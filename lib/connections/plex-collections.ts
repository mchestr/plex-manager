import "server-only"

import { z } from "zod"

import { serviceFetch, type ServiceErrorCode, type ServiceResult } from "@/lib/connections/http"

/**
 * The Plex collection and hub calls of the Leaving soon collections (TS 8.10
 * steps 3 and 4). The sync (`lib/cleanup/collections/sync.ts`) decides what
 * to call; each function here is one small call.
 *
 * Safety:
 * - Plex reroutes `/library/collections/{id}/...` to `/library/metadata/{id}/...`,
 *   and a `DELETE` of a metadata item deletes its media. So the only collection
 *   delete is {@link deletePlexCollectionGuarded}, which reads the metadata
 *   first and refuses anything that is not our collection.
 * - Every `DELETE` here goes to a `/library/collections/` path. No function
 *   deletes Plex media or empties a section's trash.
 * - Every rating key and section id must match `^\d+$` before a URL is built
 *   (TS 7.2.1 item 8). Any other key gives `INVALID_KEY` and sends nothing.
 * - Each call is sent once, never through the retry helper. Reads have 10 s
 *   (TS 7.2.2 A4) and writes 15 s.
 *
 * @module lib/connections/plex-collections
 */

type PlexConfig = { url: string; token: string }
type WriteOptions = { signal?: AbortSignal }
/** A transport failure, or `INVALID_KEY` for a key refused before the request. */
type PlexWriteResult<T> = ServiceResult<T, ServiceErrorCode | "INVALID_KEY">
/** The metadata fields the guards read. `smart` is true for any value but absent, false, 0 and "0". */
type PlexCollectionMeta = { ratingKey: string; type: string; title: string; smart: boolean; sectionId: string | null }
/** Where a collection is shown (TS 8.10 step 4.8), as the runtime `hub` stores it. */
export type PlexHubFlags = { recommended: boolean; ownHome: boolean; sharedHome: boolean }
/** The check of TS 8.10 step 3.1 that failed. */
export type CollectionGuardFailure = "key" | "type" | "smart" | "section" | "title"

/** The collection `type` of each level: 1 movie, 2 show, 3 season (Maintainerr `EPlexDataType`). */
const COLLECTION_TYPE = { movie: 1, show: 2, season: 3 } as const
const PLEX_KEY = /^\d+$/
const SAFE_ID = /^[\w.-]+$/
const READ_TIMEOUT_MS = 10_000
const WRITE_TIMEOUT_MS = 15_000
const ADD_BATCH = 50

const keyText = z.union([z.string(), z.number()]).transform(String)
const flag = z.union([z.boolean(), z.number(), z.string()]).optional()
const metaEntry = z.object({ ratingKey: keyText, type: z.string(), title: z.string(), smart: flag, librarySectionID: keyText.optional() })
const metadataSchema = z.object({ MediaContainer: z.object({ librarySectionID: keyText.optional(), Metadata: z.array(metaEntry).default([]) }) })
const createdSchema = z.object({ MediaContainer: z.object({ Metadata: z.array(z.object({ ratingKey: keyText })).default([]) }) })
const hubEntry = z.object({ identifier: z.string(), promotedToRecommended: flag, promotedToOwnHome: flag, promotedToSharedHome: flag })
const hubSchema = z.object({ MediaContainer: z.object({ Hub: z.array(hubEntry).default([]) }) })

/** Plex sends a flag as a boolean, a number or a string. */
const isSet = (value: boolean | number | string | undefined) => !(value === undefined || value === false || value === 0 || value === "0")
const invalidKey = () => ({ ok: false, code: "INVALID_KEY" }) as const
const badKeys = (...keys: string[]) => (keys.every((key) => PLEX_KEY.test(key)) ? null : invalidKey())
const isStatus = (result: { ok: boolean; code?: string; status?: number }, status: number) =>
  !result.ok && result.code === "HTTP" && result.status === status
const query = (params: Record<string, string | number>) =>
  Object.entries(params).map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("&")

function plexCall<T>(
  config: PlexConfig,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  { schema, json = false, timeoutMs = WRITE_TIMEOUT_MS, signal }: WriteOptions & { schema: z.ZodType<T>; json?: boolean; timeoutMs?: number }
): Promise<ServiceResult<T>> {
  const headers = { "X-Plex-Token": config.token }
  const responseType = json ? "json" : "text"
  return serviceFetch({ service: "Plex", url: `${config.url}${path}`, method, headers, responseType, schema, timeoutMs, signal })
}

/** A write whose answer is not read. */
async function plexWrite(config: PlexConfig, method: "POST" | "PUT" | "DELETE", path: string, { signal }: WriteOptions) {
  const result = await plexCall(config, method, path, { schema: z.string(), signal })
  return result.ok ? ({ ok: true, data: null } as const) : result
}

/**
 * One item's metadata, `null` on a 404 (only a 404 proves it is gone). An empty answer is `INVALID_RESPONSE`.
 * The section is the item's `librarySectionID`, else the container's (as python-plexapi `fetchItems` reads it).
 */
async function readMetadata(config: PlexConfig, path: string, { signal }: WriteOptions): Promise<PlexWriteResult<PlexCollectionMeta | null>> {
  const result = await plexCall(config, "GET", path, { schema: metadataSchema, json: true, timeoutMs: READ_TIMEOUT_MS, signal })
  if (!result.ok) return isStatus(result, 404) ? { ok: true, data: null } : result
  const { Metadata: [item], librarySectionID: containerSection } = result.data.MediaContainer
  if (!item) return { ok: false, code: "INVALID_RESPONSE" }
  const { ratingKey, type, title, smart, librarySectionID } = item
  return { ok: true, data: { ratingKey, type, title, smart: isSet(smart), sectionId: librarySectionID ?? containerSection ?? null } }
}

/**
 * `GET /library/collections/{ratingKey}` (TS 8.10 step 4.1, Maintainerr `getCollection`): the metadata,
 * or `null` on a 404. Check it with {@link collectionGuardFailure}: Plex reroutes this path to any item.
 */
export async function getPlexCollection(config: PlexConfig, ratingKey: string, options: WriteOptions = {}) {
  return badKeys(ratingKey) ?? readMetadata(config, `/library/collections/${ratingKey}`, options)
}

/**
 * The first check of TS 8.10 step 3.1 that `meta` fails, or `null`: the same key, `type` collection,
 * not smart, the stored section and, when given, the stored title. Step 4.1 checks without the title.
 */
export function collectionGuardFailure(
  meta: PlexCollectionMeta,
  expected: { ratingKey: string; sectionId: string; title?: string }
): CollectionGuardFailure | null {
  if (meta.ratingKey !== expected.ratingKey) return "key"
  if (meta.type !== "collection") return "type"
  if (meta.smart) return "smart"
  if (meta.sectionId !== expected.sectionId) return "section"
  return expected.title !== undefined && meta.title !== expected.title ? "title" : null
}

/**
 * Delete a stored collection (TS 8.10 step 3.1): `GET /library/metadata/{ratingKey}` (A4), then
 * `DELETE /library/collections/{ratingKey}` only when {@link collectionGuardFailure} finds nothing.
 * Else it sends no `DELETE` and gives `guarded: true` with the failed check. A 404 on either call
 * gives `gone: true`.
 */
export async function deletePlexCollectionGuarded(
  config: PlexConfig,
  stored: { ratingKey: string; sectionId: string; title: string },
  options: WriteOptions = {}
): Promise<PlexWriteResult<{ guarded: true; reason: CollectionGuardFailure } | { guarded: false; gone: boolean }>> {
  const refused = badKeys(stored.ratingKey, stored.sectionId)
  const meta = refused ?? (await readMetadata(config, `/library/metadata/${stored.ratingKey}`, options))
  if (!meta.ok) return meta
  if (meta.data === null) return { ok: true, data: { guarded: false, gone: true } }
  const reason = collectionGuardFailure(meta.data, stored)
  if (reason) return { ok: true, data: { guarded: true, reason } }
  const result = await plexWrite(config, "DELETE", `/library/collections/${stored.ratingKey}`, options)
  return result.ok || isStatus(result, 404) ? { ok: true, data: { guarded: false, gone: !result.ok } } : result
}

/**
 * Create an empty collection: `POST /library/collections?type={1|2|3}&title={title}&smart=0&sectionId={id}`
 * (Maintainerr `createCollection`, python-plexapi `_create`). Plex answers it in `MediaContainer.Metadata[0]`.
 */
export async function createPlexCollection(
  config: PlexConfig,
  { sectionId, level, title }: { sectionId: string; level: keyof typeof COLLECTION_TYPE; title: string },
  { signal }: WriteOptions = {}
): Promise<PlexWriteResult<{ ratingKey: string }>> {
  const path = `/library/collections?${query({ type: COLLECTION_TYPE[level], title, smart: 0, sectionId })}`
  const result = badKeys(sectionId) ?? (await plexCall(config, "POST", path, { schema: createdSchema, json: true, signal }))
  if (!result.ok) return result
  const [created] = result.data.MediaContainer.Metadata
  return created && PLEX_KEY.test(created.ratingKey) ? { ok: true, data: { ratingKey: created.ratingKey } } : { ok: false, code: "INVALID_RESPONSE" }
}

/** Set and lock the summary: `PUT /library/sections/{id}/all?type=18&id={ratingKey}&summary.value=...&summary.locked=1`. */
export async function setPlexCollectionSummary(
  config: PlexConfig,
  { sectionId, ratingKey, summary }: { sectionId: string; ratingKey: string; summary: string },
  options: WriteOptions = {}
) {
  const params = query({ type: 18, id: ratingKey, "summary.value": summary, "summary.locked": 1 })
  return badKeys(sectionId, ratingKey) ?? plexWrite(config, "PUT", `/library/sections/${sectionId}/all?${params}`, options)
}

/** Custom order: `PUT /library/metadata/{ratingKey}/prefs?collectionSort=2` (python-plexapi `sortUpdate`). */
export async function setPlexCollectionCustomOrder(config: PlexConfig, ratingKey: string, options: WriteOptions = {}) {
  return badKeys(ratingKey) ?? plexWrite(config, "PUT", `/library/metadata/${ratingKey}/prefs?collectionSort=2`, options)
}

/**
 * Add items: `PUT /library/collections/{ratingKey}/items?uri={uri}`, 50 keys per call, with `uri` the
 * URL-encoded `server://{machineIdentifier}/com.plexapp.plugins.library/library/metadata/{rk1,rk2,...}`
 * (Maintainerr `buildCollectionItemsUri`). It stops at the first failed call.
 */
export async function addPlexCollectionItems(
  config: PlexConfig & { machineIdentifier: string },
  ratingKey: string,
  itemKeys: readonly string[],
  options: WriteOptions = {}
): Promise<PlexWriteResult<{ added: number }>> {
  if (badKeys(ratingKey, ...itemKeys) || !SAFE_ID.test(config.machineIdentifier)) return invalidKey()
  for (let start = 0; start < itemKeys.length; start += ADD_BATCH) {
    const keys = itemKeys.slice(start, start + ADD_BATCH).join(",")
    const uri = `server://${config.machineIdentifier}/com.plexapp.plugins.library/library/metadata/${keys}`
    const result = await plexWrite(config, "PUT", `/library/collections/${ratingKey}/items?${query({ uri })}`, options)
    if (!result.ok) return result
  }
  return { ok: true, data: { added: itemKeys.length } }
}

/**
 * Remove one item: `DELETE /library/collections/{ratingKey}/items/{itemKey}` (python-plexapi `removeItems`).
 * Plex's API page lists `PUT` for this route, so an answer of 405 sends `PUT` once.
 */
export async function removePlexCollectionItem(config: PlexConfig, ratingKey: string, itemKey: string, options: WriteOptions = {}) {
  const path = `/library/collections/${ratingKey}/items/${itemKey}`
  const result = badKeys(ratingKey, itemKey) ?? (await plexWrite(config, "DELETE", path, options))
  return isStatus(result, 405) ? plexWrite(config, "PUT", path, options) : result
}

/** Move an item after `after`, or to the front when `after` is null: `PUT .../items/{itemKey}/move?after={after}`. */
export async function movePlexCollectionItem(config: PlexConfig, ratingKey: string, itemKey: string, after: string | null, options: WriteOptions = {}) {
  const path = `/library/collections/${ratingKey}/items/${itemKey}/move${after === null ? "" : `?after=${after}`}`
  return badKeys(ratingKey, itemKey, ...(after === null ? [] : [after])) ?? plexWrite(config, "PUT", path, options)
}

const hubQuery = ({ recommended, ownHome, sharedHome }: PlexHubFlags) =>
  query({ promotedToRecommended: Number(recommended), promotedToOwnHome: Number(ownHome), promotedToSharedHome: Number(sharedHome) })

/**
 * The collection's hub: `GET /hubs/sections/{id}/manage?metadataItemId={ratingKey}` (python-plexapi
 * `visibility()`), or `null` with no hub. A collection hub's identifier ends in `.{ratingKey}`
 * (`custom.collection.{id}.{ratingKey}`), so a built-in hub is never taken for it.
 */
export async function getPlexCollectionHub(
  config: PlexConfig,
  sectionId: string,
  ratingKey: string,
  { signal }: WriteOptions = {}
): Promise<PlexWriteResult<(PlexHubFlags & { identifier: string }) | null>> {
  const path = `/hubs/sections/${sectionId}/manage?metadataItemId=${ratingKey}`
  const result = badKeys(sectionId, ratingKey) ?? (await plexCall(config, "GET", path, { schema: hubSchema, json: true, signal }))
  if (!result.ok) return result
  const hub = result.data.MediaContainer.Hub.find(({ identifier }) => identifier.endsWith(`.${ratingKey}`))
  if (!hub) return { ok: true, data: null }
  const { identifier, promotedToRecommended: recommended, promotedToOwnHome: ownHome, promotedToSharedHome: sharedHome } = hub
  return { ok: true, data: { identifier, recommended: isSet(recommended), ownHome: isSet(ownHome), sharedHome: isSet(sharedHome) } }
}

/** Make a hub: `POST /hubs/sections/{id}/manage?metadataItemId={ratingKey}&promotedToRecommended=...`. */
export async function createPlexCollectionHub(config: PlexConfig, sectionId: string, ratingKey: string, flags: PlexHubFlags, options: WriteOptions = {}) {
  const path = `/hubs/sections/${sectionId}/manage?metadataItemId=${ratingKey}&${hubQuery(flags)}`
  return badKeys(sectionId, ratingKey) ?? plexWrite(config, "POST", path, options)
}

/** Set a hub's three flags: `PUT /hubs/sections/{id}/manage/{identifier}?promotedToRecommended=...`. It never deletes a hub. */
export async function updatePlexCollectionHub(config: PlexConfig, sectionId: string, identifier: string, flags: PlexHubFlags, options: WriteOptions = {}) {
  if (badKeys(sectionId) || !SAFE_ID.test(identifier)) return invalidKey()
  return plexWrite(config, "PUT", `/hubs/sections/${sectionId}/manage/${identifier}?${hubQuery(flags)}`, options)
}
