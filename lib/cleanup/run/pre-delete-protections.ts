/**
 * Row 6 of the pre-delete re-read (TS 8.8 table): fresh reads of every
 * protection that can still save the item right before its deletion.
 * Server-only; `pre-delete.ts` is its one caller.
 *
 * 1. G1 Keeps and G3 exclusions through `cascadeWhere()`, and through a
 *    shared external id at a level that the item belongs to (safety-r2-10).
 *    A Keep wins over an exclusion for the reason.
 * 2. G2 Keep forever marks on the copies and episodes (for a season, also
 *    the show's copies).
 * 3. G8: a watchlist of a member with sync on and access now.
 * 4. G9: a tag of the arr record that row 1 read. A failed tags read holds.
 *
 * @module lib/cleanup/run/pre-delete-protections
 */

import "server-only"

import { cascadeWhere } from "@/lib/cleanup/identity/keys"
import type { OutcomeReason } from "@/lib/cleanup/outcomes"
import { activeProtectionWhere } from "@/lib/cleanup/protections"
import type { ArrRecord, PreDeleteEnv, PreDeleteInput, PreDeleteResult } from "@/lib/cleanup/run/pre-delete"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { prisma } from "@/lib/prisma"

/** The external id kinds that two records must not disagree on. */
export const ID_KINDS = ["tmdb", "tvdb", "imdb"] as const
const KEEP_REASONS: Record<string, OutcomeReason> = { memberKeep: "kept", adminExclude: "excluded" }

/** The levels that a protection sharing an external id must have (safety-r2-10). */
function sharedLevel(item: SnapshotItem) {
  if (item.level === "movie") return { level: "movie" }
  return item.level === "show" ? { level: { in: ["show", "season"] } } : { OR: [{ level: "show" }, { level: "season", seasonNumber: item.seasonNumber }] }
}

/** Row 6: fresh reads of G1, G3 (cascade and shared ids), G2, G8 and G9. */
export async function protectionCheck({ item, show }: PreDeleteInput, record: ArrRecord, env: PreDeleteEnv): Promise<PreDeleteResult | null> {
  const { protections } = env.options
  const ids = (item.level === "season" ? show?.ids : null) ?? item.ids
  const shared = ID_KINDS.flatMap((kind) => (ids[kind] === undefined ? [] : [{ externalIds: { path: [kind], equals: ids[kind] } }]))
  const marks = item.level === "season" ? [...item.episodeKeys, ...(show?.copies ?? []).map((c) => c.ratingKey)]
    : [...item.copies.map((c) => c.ratingKey), ...item.episodeKeys]
  const watched = [...(ids.tmdb === undefined ? [] : [{ tmdbId: ids.tmdb }]), ...(ids.tvdb === undefined ? [] : [{ tvdbId: ids.tvdb }]),
    ...(ids.imdb === undefined ? [] : [{ imdbId: ids.imdb }])]
  const [rows, mark, watchers] = await Promise.all([
    prisma.cleanupProtection.findMany({ where: { AND: [activeProtectionWhere(env.now), { OR: [cascadeWhere({ level: item.level, itemKey: item.key,
      titleKey: item.titleKey }), ...(shared.length > 0 ? [{ AND: [{ OR: shared }, sharedLevel(item)] }] : [])] }] }, select: { kind: true } }),
    protections.g2.enabled ? prisma.userMediaMark.findFirst({ where: { markType: "KEEP_FOREVER", plexRatingKey: { in: marks } }, select: { id: true } }) : null,
    protections.g8.enabled && watched.length > 0 ? prisma.watchlistSyncHistory.findMany({ where: { status: { not: "REMOVED_FROM_WATCHLIST" }, OR: watched,
      user: { watchlistSyncSettings: { is: { syncEnabled: true } } } }, select: { user: { select: { plexUserId: true } } } }) : [],
  ])
  const keep = rows.find((r) => r.kind === "memberKeep") ?? rows[0]
  if (keep) return { kind: "rescue", reason: KEEP_REASONS[keep.kind] ?? "protected" }
  if (mark) return { kind: "rescue", reason: "markedKeepForever" }
  const access = (id: string | null) => id !== null && Object.hasOwn(env.users, id) && env.users[id].hasAccess === true
  if (watchers.some((w) => access(w.user.plexUserId))) return { kind: "rescue", reason: "protected", detail: { protectionId: "g8" } }
  if (!protections.g9.enabled) return null
  const labels = env.prepared.tags[item.level === "movie" ? "radarr" : "sonarr"]
  if (!labels) return { kind: "hold", code: `sourceFailed:${item.level === "movie" ? "radarr" : "sonarr"}` }
  const wanted = new Set(protections.g9.tags.map((tag) => tag.toLowerCase()))
  return record.tags.some((id) => wanted.has(labels.get(id) ?? "")) ? { kind: "rescue", reason: "protected", detail: { protectionId: "g9" } } : null
}
