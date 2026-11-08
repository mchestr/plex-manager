/**
 * The explicit global protections (TS 5.3): G1 member Keeps, G2 Keep forever
 * marks, G3 admin exclusions and G10 stored Rewinds. They read the live facts
 * (TS 5.2), never a service, so none of them is ever Unknown. G1 and G3 are
 * always on (E30): `members.keepsEnabled` stops new Keeps only. Client-safe.
 *
 * @module lib/cleanup/engine/fields/globals-explicit
 */

import { copyKeys, coversKey, defineGlobal, type GlobalBuilder, protectionKeys, protectsWhen } from "@/lib/cleanup/engine/fields/global-kit"
import { dateOf, phrases } from "@/lib/cleanup/engine/fields/shared"
import type { EvalContext } from "@/lib/cleanup/engine/types"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { LEVELS } from "@/lib/validations/cleanup-vocabulary"

const seconds = (date: Date) => Math.floor(date.getTime() / 1000)

/** The active, unexpired Keeps on the item or its cascade (TS 5.4), the latest end first. */
function keepsOf(item: SnapshotItem, ctx: EvalContext) {
  const keys = protectionKeys(item)
  return ctx.live.keeps
    .filter((keep) => keep.expiresAt.getTime() > ctx.now && coversKey(keys, keep.itemKey))
    .sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())
}

/** The active exclusions on the item or its cascade: one with no end first, then the latest end. */
function excludesOf(item: SnapshotItem, ctx: EvalContext) {
  const keys = protectionKeys(item)
  const end = (expiresAt: Date | null) => expiresAt?.getTime() ?? Number.POSITIVE_INFINITY
  return ctx.live.excludes
    .filter((row) => end(row.expiresAt) > ctx.now && coversKey(keys, row.itemKey))
    .sort((a, b) => end(b.expiresAt) - end(a.expiresAt))
}

/** `User.name` of the member, else "Unknown member" (X8). Admin surfaces only (TS 6.9). */
const memberName = (userId: string, ctx: EvalContext) => ctx.live.members.find((m) => m.userId === userId)?.name ?? "Unknown member"

export const g1: GlobalBuilder = () =>
  defineGlobal({
    id: "g1",
    levels: LEVELS,
    needs: [],
    evaluate: (item, ctx) => protectsWhen(keepsOf(item, ctx).length > 0),
    fact(item, ctx) {
      const keep = keepsOf(item, ctx).at(0)
      if (!keep) return phrases("No member Keep.")
      return phrases(`Kept by ${memberName(keep.memberId, ctx)} until ${dateOf(seconds(keep.expiresAt), ctx)}.`)
    },
  })

/**
 * True when a Keep forever mark is on one of the item's Plex rating keys
 * (TS 5.3 G2, 5.4 rule 3): its copies and its episodes on disk, and for a
 * season its show's copies. A mark on an episode protects its season and
 * its show.
 */
function marked(item: SnapshotItem, ctx: EvalContext): boolean {
  return [...copyKeys(item, ctx), ...item.episodeKeys].some((key) => ctx.live.keepForever.has(key))
}

export const g2: GlobalBuilder = () =>
  defineGlobal({
    id: "g2",
    levels: LEVELS,
    needs: [],
    evaluate: (item, ctx) => protectsWhen(marked(item, ctx)),
    fact: (item, ctx) => phrases(marked(item, ctx) ? "Marked Keep forever by a member." : "No Keep forever mark."),
  })

export const g3: GlobalBuilder = () =>
  defineGlobal({
    id: "g3",
    levels: LEVELS,
    needs: [],
    evaluate: (item, ctx) => protectsWhen(excludesOf(item, ctx).length > 0),
    fact(item, ctx) {
      const row = excludesOf(item, ctx).at(0)
      if (!row) return phrases("Not excluded.")
      if (row.expiresAt === null) return phrases("Excluded by an admin.")
      return phrases(`Excluded by an admin until ${dateOf(seconds(row.expiresAt), ctx)}.`)
    },
  })

/** True when a stored Rewind of the open season holds a copy of the item or of the season's show. */
function inRewind(item: SnapshotItem, ctx: EvalContext): boolean {
  const stored = ctx.live.rewindKeys
  return stored !== null && copyKeys(item, ctx).some((key) => stored.has(key))
}

export const g10: GlobalBuilder = () =>
  defineGlobal({
    id: "g10",
    levels: LEVELS,
    needs: [],
    evaluate: (item, ctx) => protectsWhen(inRewind(item, ctx)),
    fact(item, ctx) {
      if (ctx.live.rewindKeys === null) return phrases("The Rewind season is closed.")
      return phrases(inRewind(item, ctx) ? "In a stored Rewind." : "Not in a stored Rewind.")
    },
  })
