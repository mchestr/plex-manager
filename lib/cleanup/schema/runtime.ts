/**
 * Job state of media cleanup (TS 3.4): `CleanupSettings.runtime`, written only
 * by the collection sync job (one writer), the arr record of an item
 * (`CleanupItem.arr`) and the item state that a Keep's Undo restores
 * (`CleanupProtection.restore`). Client-safe.
 *
 * @module lib/cleanup/schema/runtime
 */

import { z } from "zod"

import { issuePaths, logParseDropped, parseStoredRows } from "@/lib/cleanup/schema/snapshot"
import { ACTION_IDS } from "@/lib/validations/cleanup-vocabulary"

export const arrRefSchema = z.object({ service: z.enum(["radarr", "sonarr"]), id: z.number().int(), titleSlug: z.string(), path: z.string(),
  unmonitored: z.boolean().optional() }) // true after a failed delete that left the record unmonitored (8.9 step 6)
export type ArrRef = z.infer<typeof arrRefSchema>

const collectionSchema = z.object({ // key "<sectionId>:<level>"
  ratingKey: z.string(), title: z.string(), createdAt: z.iso.datetime(), lastSyncAt: z.iso.datetime(), count: z.number().int(),
  hub: z.object({ ownHome: z.boolean(), sharedHome: z.boolean(), recommended: z.boolean() }),
})
const lastSyncSchema = z.object({ at: z.iso.datetime(), ok: z.boolean(), errorCode: z.string().optional() })
const noticeSchema = z.object({ kind: z.literal("collectionRemoved"), key: z.string(), title: z.string(), sectionId: z.string(),
  detectedAt: z.iso.datetime(), recreatedAt: z.iso.datetime().nullable() })

export const runtimeSchema = z.object({
  collections: z.record(z.string(), collectionSchema).default({}),
  lastSync: lastSyncSchema.optional(),
  notices: z.array(noticeSchema).default([]),
})
export type CleanupRuntime = z.infer<typeof runtimeSchema>
export type RuntimeCollection = z.infer<typeof collectionSchema>
export type RuntimeNotice = z.infer<typeof noticeSchema>

export const restoreItemSchema = z.object({ // a CleanupItem row's state, for a Keep's Undo
  ruleIds: z.array(z.string()), action: z.enum(ACTION_IDS), importListExclusion: z.boolean(), needsApproval: z.boolean(),
  enteredAt: z.iso.datetime(), leaveOn: z.string(), firstLeaveOn: z.string(), state: z.enum(["leaving", "approved"]),
  approvedAt: z.iso.datetime().nullable(), approvedBy: z.string().nullable(), keptAt: z.iso.datetime(),
})
export type RestoreItem = z.infer<typeof restoreItemSchema>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

/**
 * The stored runtime with its defaults. Never throws. A bad collection entry,
 * a bad `lastSync` and a bad notice each drop alone (logged by issue path), so
 * one bad value never loses the Plex collection ids.
 */
export function parseRuntime(raw: unknown): CleanupRuntime {
  const stored = isRecord(raw) ? raw : {}
  const paths: string[] = raw !== undefined && raw !== null && !isRecord(raw) ? ["(root)"] : []
  const kept: [string, RuntimeCollection][] = []
  for (const [key, value] of Object.entries(isRecord(stored.collections) ? stored.collections : {})) {
    const parsed = collectionSchema.safeParse(value)
    if (parsed.success) kept.push([key, parsed.data])
    else paths.push(...issuePaths(parsed.error, ["collections", key]))
  }
  // fromEntries defines own properties, so a stored "__proto__" key stays a plain key
  const collections: CleanupRuntime["collections"] = Object.fromEntries(kept)
  if (stored.collections !== undefined && !isRecord(stored.collections)) paths.push("collections")
  let lastSync: CleanupRuntime["lastSync"]
  if (stored.lastSync !== undefined) {
    const parsed = lastSyncSchema.safeParse(stored.lastSync)
    if (parsed.success) lastSync = parsed.data
    else paths.push(...issuePaths(parsed.error, ["lastSync"]))
  }
  if (paths.length > 0) logParseDropped("runtime", paths.length, paths)
  const notices = parseStoredRows("runtime.notices", noticeSchema, stored.notices).rows
  return lastSync ? { collections, lastSync, notices } : { collections, notices }
}

/** A stored `CleanupItem.arr`, or null when it does not parse (logged by issue path). Never throws. */
export function parseArrRef(raw: unknown): ArrRef | null {
  const parsed = arrRefSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  logParseDropped("arrRef", 1, issuePaths(parsed.error))
  return null
}

/** A stored `CleanupProtection.restore`, or null when there is none or it does not parse. Never throws. */
export function parseRestoreItem(raw: unknown): RestoreItem | null {
  if (raw === null || raw === undefined) return null
  const parsed = restoreItemSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  logParseDropped("restoreItem", 1, issuePaths(parsed.error))
  return null
}
