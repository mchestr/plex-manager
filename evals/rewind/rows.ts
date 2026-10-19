/**
 * Builders for the golden fixtures' raw rows: Tautulli `get_history` rows,
 * `MediaMetadataCache` rows and Overseerr request rows, all with the real
 * field names, so the fixtures exercise the source schemas (P2.4).
 *
 * A play is written as a wall time in the member's zone. Everything here is
 * synthetic: public film and TV titles, made-up keys, no member names.
 *
 * @module evals/rewind/rows
 */

import { wallTimeToInstant } from "@/lib/utils/zoned-time"

export interface Film {
  key: string
  title: string
  year: number
  /** Runtime in minutes; a play of this length reads as 100%. */
  minutes: number
  genres?: string[]
  directors?: string[]
  actors?: string[]
  released?: string
  tmdb?: number
}

export interface Series {
  key: string
  title: string
  year: number
  genres?: string[]
  actors?: string[]
  released?: string
  tmdb?: number
  tvdb?: number
  /** Episodes per season, for the metadata cache. */
  seasons?: number[]
}

/** One Tautulli `get_history` row (`grouping=1`), as the API sends it. */
export type HistoryRow = Record<string, string | number>

interface PlayBase {
  /** Wall time `YYYY-MM-DDTHH:mm` in `zone`. */
  at: string
  zone: string
  /** Minutes played; `seconds` overrides it. */
  minutes?: number
  seconds?: number
  /** 0-100; 100 by default. */
  percent?: number
  pausedSeconds?: number
  live?: boolean
  transcode?: "direct play" | "copy" | "transcode"
  location?: "lan" | "wan"
  platform?: string
  product?: string
  /** `originally_available_at`, `YYYY-MM-DD`. */
  released?: string
}

export type PlayInput = PlayBase & ({ film: Film } | { series: Series; season: number; episode: number })

/** A seeded PRNG (mulberry32): the same seed gives the same fixtures. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** An episode's rating key: unique per series, season and episode. */
function episodeKey(series: Series, season: number, episode: number): string {
  return String(Number(series.key) * 10_000 + season * 100 + episode)
}

const watchedStatus = (percent: number) => (percent >= 90 ? 1 : Math.floor(percent / 25) * 0.25)

/** One `get_history` row. Empty values are `""`, as Tautulli sends them. */
export function historyRow(input: PlayInput): HistoryRow {
  const started = wallTimeToInstant(input.at, input.zone).getTime() / 1000
  const seconds = input.seconds ?? (input.minutes ?? 0) * 60
  const paused = input.pausedSeconds ?? 0
  const percent = input.percent ?? 100
  const common = {
    // The member's plex.tv account ID; the server-wide pass (P2.6) buckets on it.
    user_id: 1,
    started,
    stopped: started + seconds + paused,
    play_duration: seconds,
    paused_counter: paused,
    percent_complete: percent,
    watched_status: watchedStatus(percent),
    transcode_decision: input.transcode ?? "direct play",
    location: input.location ?? "lan",
    platform: input.platform ?? "Apple TV",
    product: input.product ?? "Plex for Apple TV",
    live: input.live ? 1 : 0,
  }
  if ("film" in input) {
    const { film } = input
    return {
      ...common,
      media_type: "movie",
      rating_key: film.key,
      grandparent_rating_key: "",
      parent_media_index: "",
      media_index: "",
      title: film.title,
      grandparent_title: "",
      year: film.year,
      originally_available_at: input.released ?? film.released ?? `${film.year}-01-01`,
      guid: `plex://movie/${film.key}`,
      section_id: "1",
    }
  }
  const { series, season, episode } = input
  const key = episodeKey(series, season, episode)
  return {
    ...common,
    media_type: "episode",
    rating_key: key,
    grandparent_rating_key: series.key,
    parent_media_index: season,
    media_index: episode,
    title: `Episode ${episode}`,
    grandparent_title: series.title,
    year: series.year,
    originally_available_at: input.released ?? series.released ?? `${series.year}-01-01`,
    guid: `plex://episode/${key}`,
    section_id: "2",
  }
}

/** The TMDB id a title's requests and metadata share. */
export function tmdbId(title: Film | Series): number {
  return title.tmdb ?? Number(title.key) + 100000
}

/** One `MediaMetadataCache` row for a film or a series, dates as ISO strings. */
export function metadataRow(title: Film | Series): Record<string, unknown> {
  const isFilm = "minutes" in title
  return {
    ratingKey: title.key,
    kind: isFilm ? "movie" : "show",
    librarySectionId: isFilm ? "1" : "2",
    addedAt: `${Math.max(title.year, 2020)}-06-01T00:00:00.000Z`,
    genres: title.genres ?? [],
    directors: isFilm ? (title.directors ?? []) : [],
    actors: title.actors ?? [],
    studio: null,
    contentRating: null,
    year: title.year,
    originallyAvailableAt: `${title.released ?? `${title.year}-01-01`}T00:00:00.000Z`,
    runtimeSec: isFilm ? title.minutes * 60 : null,
    // Keyed by season number, as the metadata warm writes it (P2.6).
    seasonEpisodeCounts:
      isFilm || !title.seasons ? null : Object.fromEntries(title.seasons.map((count, i) => [String(i + 1), count])),
    guids: [`tmdb://${tmdbId(title)}`, ...(isFilm ? [] : [`tvdb://${title.tvdb ?? Number(title.key) + 300000}`])],
    videoResolution: "1080",
    hdr: false,
  }
}

export interface RequestInput {
  id: number
  type: "movie" | "tv"
  tmdbId: number
  /** 1 pending, 2 approved, 3 declined, 4 failed, 5 completed. */
  status: number
  /** `media.status`: 5 available, 4 partially available. */
  mediaStatus: number
  createdAt: string
  requestedBy: number
}

/** One Overseerr `/api/v1/request` result. */
export function requestRow(input: RequestInput): Record<string, unknown> {
  return {
    id: input.id,
    status: input.status,
    type: input.type,
    is4k: false,
    createdAt: input.createdAt,
    requestedBy: { id: input.requestedBy },
    media: { status: input.mediaStatus, tmdbId: input.tmdbId },
  }
}
