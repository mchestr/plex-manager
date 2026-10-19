/**
 * Builds `PlayEvent`s for the aggregate tests from wall times in a zone.
 */

import { wallTimeToInstant } from "@/lib/utils/zoned-time"
import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"

interface PlayOptions {
  /** Wall time in `zone`, `YYYY-MM-DDTHH:mm`. */
  at: string
  zone: string
  seconds: number
  /** A film's rating key. */
  film?: string
  /** A series' rating key; the play is one of its episodes. */
  series?: string
  percentComplete?: number
  title?: string
}

let episodeKey = 10_000

/** One play of a film or an episode, stopping `seconds` after it starts. */
export function play({ at, zone, seconds, film, series, percentComplete = 100, title }: PlayOptions): PlayEvent {
  const startedAt = wallTimeToInstant(at, zone).getTime()
  const isEpisode = series !== undefined
  return {
    ratingKey: isEpisode ? String(episodeKey++) : (film ?? "1"),
    grandparentRatingKey: isEpisode ? series : null,
    parentMediaIndex: isEpisode ? 1 : null,
    mediaIndex: isEpisode ? 1 : null,
    mediaType: isEpisode ? "episode" : "movie",
    title: title ?? (isEpisode ? "An Episode" : `Film ${film}`),
    grandparentTitle: isEpisode ? (title ?? `Series ${series}`) : null,
    year: 2026,
    originallyAvailableAt: null,
    startedAt,
    stoppedAt: startedAt + seconds * 1000,
    playSeconds: seconds,
    pausedSeconds: 0,
    percentComplete,
    watchedStatus: percentComplete >= 90 ? 1 : 0,
    transcodeDecision: "direct play",
    location: "lan",
    platform: "Roku",
    product: "Plex for Roku",
    guid: null,
    librarySectionId: "1",
    contentRating: null,
    live: false,
  }
}
