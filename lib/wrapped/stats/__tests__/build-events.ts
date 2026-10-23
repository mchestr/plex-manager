/**
 * Builders for the stats tests: plays given as wall times in a zone.
 */

import { wallTimeToInstant } from "@/lib/utils/zoned-time"
import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { dataWindow } from "@/lib/wrapped/time/zone"

import type { StatsContext } from "../keys"

/** The member zones every stats module is tested under (design 7.7). */
export const ZONES = ["UTC", "America/Los_Angeles", "Europe/Berlin", "Australia/Sydney"] as const

interface PlayInput {
  /** Wall time, `YYYY-MM-DDTHH:mm`, in `zone`. */
  at: string
  zone: string
  seconds?: number
  percent?: number
  pausedSeconds?: number
  /** A film's rating key. */
  film?: string
  /** A series' grandparent rating key. */
  series?: string
  season?: number
  episode?: number
  ratingKey?: string
  title?: string
  year?: number | null
  live?: boolean
  mediaType?: PlayEvent["mediaType"]
}

let episodeCounter = 0

/**
 * One play. A film by default; `series` makes it an episode with a fresh
 * rating key unless `ratingKey` or `season` and `episode` name one.
 */
export function play(input: PlayInput): PlayEvent {
  const startedAt = wallTimeToInstant(input.at, input.zone).getTime()
  const seconds = input.seconds ?? 1800
  const paused = input.pausedSeconds ?? 0
  const isEpisode = input.series !== undefined
  const season = input.season ?? 1
  const ratingKey = isEpisode
    ? (input.ratingKey ??
      (input.episode !== undefined ? `${input.series}-s${season}e${input.episode}` : `${input.series}-e${++episodeCounter}`))
    : (input.ratingKey ?? input.film ?? "film-1")
  return {
    ratingKey,
    grandparentRatingKey: isEpisode ? input.series! : null,
    parentMediaIndex: isEpisode ? season : null,
    mediaIndex: isEpisode ? (input.episode ?? null) : null,
    mediaType: input.mediaType ?? (isEpisode ? "episode" : "movie"),
    title: isEpisode ? `Episode ${ratingKey}` : (input.title ?? `Film ${ratingKey}`),
    grandparentTitle: isEpisode ? (input.title ?? `Series ${input.series}`) : null,
    year: input.year ?? null,
    originallyAvailableAt: null,
    startedAt,
    stoppedAt: startedAt + (seconds + paused) * 1000,
    playSeconds: seconds,
    pausedSeconds: paused,
    percentComplete: input.percent ?? 100,
    watchedStatus: (input.percent ?? 100) >= 90 ? 1 : 0,
    transcodeDecision: "direct play",
    location: "lan",
    platform: null,
    product: null,
    guid: null,
    contentRating: null,
    live: input.live ?? false,
  }
}

/** A stats context for 2026 in `zone`: the season window unless `finalCut`. */
export function statsContext(
  zone: string,
  { finalCut = false, hidden = [] }: { finalCut?: boolean; hidden?: string[] } = {}
): StatsContext {
  return { zone, window: dataWindow(2026, zone, { finalCut }), finalCut, hiddenKeys: new Set(hidden) }
}
