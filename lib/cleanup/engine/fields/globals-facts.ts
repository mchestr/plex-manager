/**
 * The fact protections (TS 5.3, 5.4 rule 4): G4 recent play, G5 part-way
 * through, G6 recently added and G7 recent open request. Each reads the
 * item's own facts: a show's facts sum its episodes, and a season's are its
 * own, so a play of season 9 does not protect season 2. Client-safe.
 *
 * @module lib/cleanup/engine/fields/globals-facts
 */

import { asProtection, CLEAR, defineGlobal, type GlobalBuilder, PROTECTS, protectsWhen, unknownP } from "@/lib/cleanup/engine/fields/global-kit"
import { applicableRequests } from "@/lib/cleanup/engine/fields/request-set"
import { allOf, anyOf, dateOf, FAIL, newest, PASS, passWhen, phrases, sourceFailed, unknown } from "@/lib/cleanup/engine/fields/shared"
import { within } from "@/lib/cleanup/engine/fields/time"
import type { EvalContext, FieldVerdict } from "@/lib/cleanup/engine/types"
import type { SnapshotItem, Viewer } from "@/lib/cleanup/schema/snapshot"
import { LEVEL_ARR, LEVELS } from "@/lib/validations/cleanup-vocabulary"

/**
 * The viewer has not finished the item (TS 5.3 G5): a movie by its newest
 * counted play, a show or a season by its episodes on disk. With no episode
 * count, the viewer's `finished` flag decides.
 */
export function notFinished(viewer: Viewer, item: SnapshotItem): boolean {
  if (item.level === "movie") return !viewer.lastCountedFinished
  return item.episodeCount === null ? !viewer.finished : viewer.finishedEpisodes < item.episodeCount
}

/** Plays are unknown while Tautulli failed (`plays` null). */
const playsUnknown = (item: SnapshotItem, ctx: EvalContext) => item.plays === null || ctx.sources.tautulli === "failed"
const TAUTULLI_FAILED = unknownP({ kind: "sourceFailed", service: "tautulli" })

export const g4: GlobalBuilder = ({ options }) =>
  defineGlobal({
    id: "g4",
    levels: LEVELS,
    needs: ["tautulli"],
    evaluate(item, ctx) {
      if (playsUnknown(item, ctx)) return TAUTULLI_FAILED
      const at = item.plays?.lastCountedAt ?? null
      return protectsWhen(at !== null && within(at, options.protections.g4.days, ctx.now))
    },
    fact(item, ctx) {
      if (!item.plays) return []
      const at = item.plays.lastCountedAt
      return phrases(at === null ? "Never played." : `Last played ${dateOf(at, ctx)}.`)
    },
  })

export const g5: GlobalBuilder = ({ options }) => {
  const partWay = (item: SnapshotItem, now: number) =>
    (item.plays?.viewers ?? []).some((v) => v.lastCountedAt !== null && within(v.lastCountedAt, options.protections.g5.days, now) && notFinished(v, item))
  return defineGlobal({
    id: "g5",
    levels: LEVELS,
    needs: ["tautulli"],
    evaluate: (item, ctx) => (playsUnknown(item, ctx) ? TAUTULLI_FAILED : protectsWhen(partWay(item, ctx.now))),
    fact(item, ctx) {
      if (!item.plays) return []
      return phrases(partWay(item, ctx.now) ? "A member is part-way through it." : "Nobody is part-way through it.")
    },
  })
}

export const g6: GlobalBuilder = ({ options }) => {
  /** Plex, the arr app, and the newest episode of a show or a season. */
  const dates = (item: SnapshotItem) => [item.added.plex, item.added.arr, item.show?.lastEpisodeAddedAt ?? null].filter((t): t is number => t !== null)
  return defineGlobal({
    id: "g6",
    levels: LEVELS,
    needs: [],
    evaluate(item, ctx) {
      const known = dates(item)
      if (known.some((t) => within(t, options.protections.g6.days, ctx.now))) return PROTECTS
      const arr = LEVEL_ARR[item.level]
      // The arr source failed: its date, and a show's newest episode date, are missing and could protect.
      if (ctx.sources[arr] === "failed") return unknownP({ kind: "sourceFailed", service: arr })
      return known.length === 0 ? unknownP({ kind: "noValue", what: "date" }) : CLEAR
    },
    fact(item, ctx) {
      const at = newest(dates(item))
      if (at === null) return phrases("Added date unknown.")
      const episode = at !== newest([item.added.plex, item.added.arr])
      return phrases(`${episode ? "Last episode added" : "Added"} ${dateOf(at, ctx)}.`)
    },
  })
}

/** The member of a request has access: true passes, false or no entry fails, null and no Plex id are unknown. */
function hasAccess(by: string | null, ctx: EvalContext): FieldVerdict {
  if (by === null) return unknown({ kind: "noValue", what: "requester" })
  const access = ctx.users.get(by)?.hasAccess
  if (access === null) return unknown({ kind: "noValue", what: "access" })
  return passWhen(access === true)
}

/** The member's viewer row on the item is missing or not finished; unknown while plays are unknown. */
function notDone(by: string | null, item: SnapshotItem): FieldVerdict {
  if (!item.plays) return sourceFailed("tautulli")
  const viewer = by === null ? undefined : item.plays.viewers.find((v) => v.user === by)
  return viewer?.finished ? FAIL : PASS
}

/** Each request of `R` in the last N days, with its G7 verdict: by a member with access who has not finished it. */
function recentRequests(item: SnapshotItem, days: number, ctx: EvalContext): { at: number; open: FieldVerdict }[] | null {
  const requests = applicableRequests(item)
  if (requests === null || ctx.sources.overseerr === "failed") return null
  return requests.filter((r) => within(r.at, days, ctx.now)).map((r) => ({ at: r.at, open: allOf([hasAccess(r.by, ctx), notDone(r.by, item)]) }))
}

/** G7 as a Kleene verdict: any recent request is open. */
function openRequest(item: SnapshotItem, days: number, ctx: EvalContext): FieldVerdict {
  const recent = recentRequests(item, days, ctx)
  return recent === null ? sourceFailed("overseerr") : anyOf(recent.map((r) => r.open))
}

export const g7: GlobalBuilder = ({ options }) => {
  const days = options.protections.g7.days
  return defineGlobal({
    id: "g7",
    levels: LEVELS,
    needs: ["overseerr"],
    evaluate: (item, ctx) => asProtection(openRequest(item, days, ctx)),
    fact(item, ctx) {
      if (openRequest(item, days, ctx).verdict === "unknown") return []
      const at = newest((recentRequests(item, days, ctx) ?? []).filter((r) => r.open.verdict === "pass").map((r) => r.at))
      if (at !== null) return phrases(`Requested ${dateOf(at, ctx)} by a member who has not finished it.`)
      return phrases(`No request in the last ${days} days by a member who has not finished it.`)
    },
  })
}
