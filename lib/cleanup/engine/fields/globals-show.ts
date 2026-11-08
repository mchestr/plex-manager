/**
 * The show-level and season global protections (TS 5.3): G8 watchlist, G9
 * arr tag and G13 Plex collection read show-level facts, so a season reads
 * them from its show (TS 5.4 rule 5, X10). G11 and G12 apply to seasons
 * only. A protection that protects is a sure answer, so it wins over an
 * unknown part. Client-safe.
 *
 * @module lib/cleanup/engine/fields/globals-show
 */

import { CLEAR, defineGlobal, type GlobalBuilder, PROTECTS, protectsWhen, showLevel, unknownP } from "@/lib/cleanup/engine/fields/global-kit"
import { notFinished } from "@/lib/cleanup/engine/fields/globals-facts"
import { ARR_NAMES, phrases, showOf } from "@/lib/cleanup/engine/fields/shared"
import { within } from "@/lib/cleanup/engine/fields/time"
import type { EvalContext } from "@/lib/cleanup/engine/types"
import type { SnapshotItem, Viewer } from "@/lib/cleanup/schema/snapshot"
import { LEVEL_ARR, LEVELS } from "@/lib/validations/cleanup-vocabulary"

const SEASONS = ["season"] as const
const norm = (text: string) => text.trim().toLowerCase()

/** One of the item's ids, or its show's for a season, is on the watchlist of a member with access (TS 5.2). */
function onWatchlist(item: SnapshotItem, ctx: EvalContext): boolean {
  const { ids } = showLevel(item, ctx)
  const list = ctx.live.watchlist
  if (ids.tmdb !== undefined && list.tmdb.has(ids.tmdb)) return true
  if (ids.tvdb !== undefined && list.tvdb.has(ids.tvdb)) return true
  return ids.imdb !== undefined && list.imdb.has(ids.imdb)
}

export const g8: GlobalBuilder = () =>
  defineGlobal({
    id: "g8",
    levels: LEVELS,
    needs: ["plex"],
    evaluate(item, ctx) {
      if (onWatchlist(item, ctx)) return PROTECTS
      // The watchlist keeps only members with access, so a failed share list hides every one (TS 5.2).
      return ctx.shares === "failed" ? unknownP({ kind: "noValue", what: "access" }) : CLEAR
    },
    fact: (item, ctx) => phrases(onWatchlist(item, ctx) ? "On the watchlist of a member with access." : "Not on a known watchlist."),
  })

export const g9: GlobalBuilder = ({ level, options }) => {
  const arr = LEVEL_ARR[level]
  const wanted = new Set(options.protections.g9.tags.map(norm))
  const tagOf = (item: SnapshotItem, ctx: EvalContext) => showLevel(item, ctx).arr?.tags.find((tag) => wanted.has(norm(tag))) ?? null
  return defineGlobal({
    id: "g9",
    levels: LEVELS,
    needs: [arr],
    evaluate(item, ctx) {
      if (tagOf(item, ctx) !== null) return PROTECTS
      return ctx.sources[arr] === "failed" ? unknownP({ kind: "sourceFailed", service: arr }) : CLEAR
    },
    fact(item, ctx) {
      const tag = tagOf(item, ctx)
      return phrases(tag === null ? `No ${ARR_NAMES[arr]} tag matches.` : `Has the ${ARR_NAMES[arr]} tag ${tag}.`)
    },
  })
}

/** G11: the season is the newest on disk of a continuing or upcoming show; null while the show facts are missing. */
function newestOfContinuing(item: SnapshotItem): boolean | null {
  const show = item.show
  if (!show?.status) return null
  const continuing = show.status === "continuing" || show.status === "upcoming"
  return continuing && item.seasonNumber !== null && show.newestSeasonOnDisk !== null && item.seasonNumber >= show.newestSeasonOnDisk
}

export const g11: GlobalBuilder = () =>
  defineGlobal({
    id: "g11",
    levels: SEASONS,
    needs: ["sonarr"],
    evaluate(item, ctx) {
      const newest = newestOfContinuing(item)
      if (newest !== null) return protectsWhen(newest)
      return ctx.sources.sonarr === "failed" ? unknownP({ kind: "sourceFailed", service: "sonarr" }) : CLEAR
    },
    fact(item) {
      const newest = newestOfContinuing(item)
      if (newest === null) return []
      return phrases(newest ? "The newest season of a continuing show." : "Not the newest season of a continuing show.")
    },
  })

/** The season has episodes left for `user`: no viewer row counts as 0 finished episodes (TS 5.3 G12). */
function seasonLeft(item: SnapshotItem, user: string): boolean {
  const none: Viewer = { user, lastCountedAt: null, lastCountedFinished: false, counted: 0, finished: false, finishedEpisodes: 0 }
  return notFinished(item.plays?.viewers.find((v) => v.user === user) ?? none, item)
}

export const g12: GlobalBuilder = ({ options }) => {
  const days = options.protections.g12.days
  const ahead = (item: SnapshotItem, show: SnapshotItem, now: number) =>
    (show.plays?.viewers ?? []).some((v) => v.lastCountedAt !== null && within(v.lastCountedAt, days, now) && seasonLeft(item, v.user))
  return defineGlobal({
    id: "g12",
    levels: SEASONS,
    needs: ["tautulli"],
    evaluate(item, ctx) {
      const show = showOf(item, ctx)
      if (!show) return unknownP() // the show's viewers decide, and the context holds no show item
      if (!show.plays || !item.plays) return unknownP({ kind: "sourceFailed", service: "tautulli" })
      return protectsWhen(ahead(item, show, ctx.now))
    },
    fact(item, ctx) {
      const show = showOf(item, ctx)
      if (!show?.plays || !item.plays) return []
      if (ahead(item, show, ctx.now)) return phrases("A member who played the show recently has not finished this season.")
      return phrases(`Every member who played the show in the last ${days} days finished this season.`)
    },
  })
}

export const g13: GlobalBuilder = ({ options, membersRead }) => {
  const names = options.protections.g13.collections
  const hit = (item: SnapshotItem, ctx: EvalContext) => {
    const held = new Set(showLevel(item, ctx).collections.map(norm))
    return names.find((name) => held.has(norm(name))) ?? null
  }
  return defineGlobal({
    id: "g13",
    levels: LEVELS,
    needs: ["plex"],
    evaluate(item, ctx) {
      if (hit(item, ctx) !== null) return PROTECTS
      // A name whose members the library read has not read yet can still hold the item (TS 5.3 rule 3).
      return names.some((name) => !membersRead.has(norm(name))) ? unknownP() : CLEAR
    },
    fact(item, ctx) {
      const name = hit(item, ctx)
      return phrases(name === null ? "In none of the chosen Plex collections." : `In the Plex collection ${name}.`)
    },
  })
}
