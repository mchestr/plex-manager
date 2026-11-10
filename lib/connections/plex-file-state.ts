/**
 * Three Plex reads a swap or a removal makes with the owner token
 * (docs/problem-reports.md, "Swap the copy"):
 *
 * - {@link isPlexItemPlaying}: whether anyone is streaming the item
 *   (`GET /status/sessions`), since an import replaces the file under them;
 * - {@link plexEmptiesTrash}: whether Plex empties its trash after each scan
 *   (`GET /:/prefs`, `autoEmptyTrash`), which can bring a removed title back
 *   as a new item without its watch state;
 * - {@link findPlexItemByGuid}: the item a library section holds for a guid
 *   (`GET /library/sections/<id>/all?guid=`), for a title Plex added again
 *   under a new rating key, and to see whether a match would merge two items.
 *
 * Each says when Plex can't be read (`null`, or `unknown`), and never throws.
 *
 * @module lib/connections/plex-file-state
 */

import "server-only"

import { z } from "zod"

import { serviceFetch } from "@/lib/connections/http"
import { ratingKeySchema } from "@/lib/validations/params"

type PlexServer = { url: string; token: string }

const READ_TIMEOUT_MS = 5000

const keySchema = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).transform(String)

const sessionsSchema = z.looseObject({
  MediaContainer: z.looseObject({ Metadata: z.array(z.looseObject({ ratingKey: keySchema.optional().catch(undefined) })).optional().catch(undefined) }),
})

const prefsSchema = z.looseObject({
  MediaContainer: z.looseObject({ Setting: z.array(z.looseObject({ id: z.string(), value: z.unknown() })).optional().catch(undefined) }),
})

const itemsSchema = z.looseObject({
  MediaContainer: z.looseObject({ Metadata: z.array(z.looseObject({ ratingKey: keySchema })).optional().catch(undefined) }),
})

function read<T>(server: PlexServer, path: string, schema: z.ZodType<T>) {
  return serviceFetch({ service: "Plex", url: `${server.url}${path}`, headers: { "X-Plex-Token": server.token }, schema, timeoutMs: READ_TIMEOUT_MS })
}

/** Whether a stream of the item is running now. */
export async function isPlexItemPlaying(server: PlexServer, ratingKey: string): Promise<boolean | null> {
  const result = await read(server, "/status/sessions", sessionsSchema)
  if (!result.ok) return null
  return (result.data.MediaContainer.Metadata ?? []).some((session) => session.ratingKey === ratingKey)
}

/** Whether Plex empties its trash after every scan. */
export async function plexEmptiesTrash(server: PlexServer): Promise<boolean | null> {
  const result = await read(server, "/:/prefs", prefsSchema)
  if (!result.ok) return null
  const setting = (result.data.MediaContainer.Setting ?? []).find((entry) => entry.id === "autoEmptyTrash")
  return setting ? setting.value === true || setting.value === "1" || setting.value === 1 : null
}

/** The section's item with this guid: `found` with its rating key, `missing`, or `unknown` when Plex can't be read. */
export async function findPlexItemByGuid(
  server: PlexServer,
  sectionId: string,
  guid: string
): Promise<{ status: "found"; ratingKey: string } | { status: "missing" } | { status: "unknown" }> {
  if (!ratingKeySchema.safeParse(sectionId).success || !guid) return { status: "unknown" }
  const result = await read(server, `/library/sections/${encodeURIComponent(sectionId)}/all?guid=${encodeURIComponent(guid)}`, itemsSchema)
  if (!result.ok) return { status: "unknown" }
  const ratingKey = result.data.MediaContainer.Metadata?.[0]?.ratingKey
  return ratingKey ? { status: "found", ratingKey } : { status: "missing" }
}
