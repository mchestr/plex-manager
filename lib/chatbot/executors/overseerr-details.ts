import "server-only"

import { z } from "zod"

import { bounded, mediaAvailability, mediaSchema, mediaStatus, optBoolean, optNumber, optObject, optString, requestBrief, requestSchema, safeLink } from "./overseerr-projections"

/**
 * `get_overseerr_media_details`: Overseerr's TMDB-backed `/movie/{id}` or
 * `/tv/{id}` cut to what an answer needs. TMDB sends every credit (a show's
 * cast is everyone in every season), every release date, video and keyword,
 * so a raw reply runs to hundreds of thousands of characters. This one keeps
 * the ids, dates, a bounded overview, the top-billed cast (`castLimit`), a
 * few studios or networks, the seasons with their availability, and
 * Overseerr's own record: availability, the newest requests and the links.
 *
 * @module
 */

export const CAST_DEFAULT = 10
export const CAST_MAX = 50
const OVERVIEW_MAX = 600
const NAME_MAX = 80
/** Studios, networks, directors and creators listed. */
const NAMES_MAX = 5
const GENRES_MAX = 10
const SEASONS_MAX = 100
/** Requests listed under `mediaInfo`, newest first. */
const REQUESTS_MAX = 5

const named = z.array(z.looseObject({ name: z.string() })).catch([])
const episodeSchema = z.looseObject({ seasonNumber: optNumber, episodeNumber: optNumber, name: optString, airDate: optString })
const seasonAvailability = z.looseObject({ seasonNumber: z.number(), status: optNumber, status4k: optNumber })

const mediaInfoSchema = mediaSchema.extend({
  plexUrl: optString,
  plexUrl4k: optString,
  serviceUrl: optString,
  serviceUrl4k: optString,
  seasons: z.array(seasonAvailability).catch([]),
  requests: z.array(requestSchema).catch([]),
})

const detailsSchema = z.looseObject({
  id: z.number(),
  title: optString,
  name: optString,
  imdbId: optString,
  externalIds: optObject(z.looseObject({ imdbId: optString, tvdbId: optNumber })),
  releaseDate: optString,
  firstAirDate: optString,
  lastAirDate: optString,
  status: optString,
  inProduction: optBoolean,
  overview: optString,
  genres: named,
  runtime: optNumber,
  episodeRunTime: z.array(z.number()).catch([]),
  numberOfSeasons: optNumber,
  numberOfEpisodes: optNumber,
  seasons: z.array(z.looseObject({ seasonNumber: z.number(), episodeCount: optNumber, airDate: optString })).catch([]),
  lastEpisodeToAir: optObject(episodeSchema),
  nextEpisodeToAir: optObject(episodeSchema),
  networks: named,
  productionCompanies: named,
  createdBy: named,
  voteAverage: optNumber,
  voteCount: optNumber,
  credits: z
    .looseObject({
      cast: z.array(z.looseObject({ name: z.string(), character: optString, order: optNumber })).catch([]),
      crew: z.array(z.looseObject({ name: z.string(), job: optString })).catch([]),
    })
    .catch({ cast: [], crew: [] }),
  mediaInfo: optObject(mediaInfoSchema),
})

type Details = z.infer<typeof detailsSchema>

/** The first `max` names, then "and N more" when there are more. */
function names(items: { name: string }[], max: number): string[] {
  const listed = items.slice(0, max).map((item) => bounded(item.name, NAME_MAX))
  return items.length > max ? [...listed, `and ${items.length - max} more`] : listed
}

/** The top-billed `limit` of the cast, and how many there are when that is not all of them. */
function castOf(cast: Details["credits"]["cast"], limit: number) {
  const billed = [...cast].sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)).slice(0, limit)
  return {
    cast: billed.map((person) => ({ name: bounded(person.name, NAME_MAX), character: bounded(person.character, NAME_MAX) })),
    ...(cast.length > billed.length ? { castShowing: `showing ${billed.length} of ${cast.length}; castLimit lists up to ${CAST_MAX}` } : {}),
  }
}

/** Overseerr's own record of the title: availability, requests and links (without credentials). */
function mediaInfoOf(info: Details["mediaInfo"], mediaType: "movie" | "tv") {
  // Overseerr keeps no record of a title nobody requested and Plex does not have
  if (!info) return { status: mediaStatus(1), status4k: mediaStatus(1), requestCount: 0 }
  const requests = [...info.requests].sort((a, b) => b.id - a.id)
  return {
    ...mediaAvailability(info, mediaType),
    requestCount: requests.length,
    requests: requests.slice(0, REQUESTS_MAX).map(requestBrief),
    ...(requests.length > REQUESTS_MAX ? { requestsShowing: `showing the newest ${REQUESTS_MAX} of ${requests.length}` } : {}),
    plexUrl: safeLink(info.plexUrl),
    plexUrl4k: safeLink(info.plexUrl4k),
    serviceUrl: safeLink(info.serviceUrl),
    serviceUrl4k: safeLink(info.serviceUrl4k),
  }
}

/** Each season's episode count and first air date, with its availability from Overseerr's record. */
function seasonsOf(details: Details) {
  const availability = new Map(details.mediaInfo?.seasons.map((season) => [season.seasonNumber, season]))
  const seasons = details.seasons.slice(0, SEASONS_MAX).map((season) => {
    const known = availability.get(season.seasonNumber)
    return {
      seasonNumber: season.seasonNumber,
      episodeCount: season.episodeCount,
      airDate: season.airDate,
      status: mediaStatus(known?.status),
      ...(known?.status4k !== undefined && known.status4k > 1 ? { status4k: mediaStatus(known.status4k) } : {}),
    }
  })
  return { seasons, ...(details.seasons.length > SEASONS_MAX ? { seasonsShowing: `showing ${SEASONS_MAX} of ${details.seasons.length}` } : {}) }
}

const episode = (value: Details["nextEpisodeToAir"]) =>
  value && { seasonNumber: value.seasonNumber, episodeNumber: value.episodeNumber, name: bounded(value.name, NAME_MAX), airDate: value.airDate }

/** A movie or show, or `undefined` for a payload of another shape. */
export function projectMediaDetails(data: unknown, mediaType: "movie" | "tv", castLimit: number) {
  const parsed = detailsSchema.safeParse(data)
  if (!parsed.success) return undefined
  const details = parsed.data
  const common = {
    genres: names(details.genres, GENRES_MAX),
    rating: details.voteAverage === undefined ? undefined : Math.round(details.voteAverage * 10) / 10,
    votes: details.voteCount,
    overview: bounded(details.overview, OVERVIEW_MAX),
  }
  const tail = { ...castOf(details.credits.cast, castLimit), mediaInfo: mediaInfoOf(details.mediaInfo, mediaType) }
  if (mediaType === "movie") {
    return {
      mediaType,
      tmdbId: details.id,
      imdbId: details.imdbId ?? details.externalIds?.imdbId,
      title: details.title,
      releaseDate: details.releaseDate,
      status: details.status,
      runtime: details.runtime,
      ...common,
      directors: names(details.credits.crew.filter((person) => person.job === "Director"), NAMES_MAX),
      studios: names(details.productionCompanies, NAMES_MAX),
      ...tail,
    }
  }
  return {
    mediaType,
    tmdbId: details.id,
    tvdbId: details.externalIds?.tvdbId ?? details.mediaInfo?.tvdbId,
    imdbId: details.externalIds?.imdbId ?? details.imdbId,
    name: details.name,
    firstAirDate: details.firstAirDate,
    lastAirDate: details.lastAirDate,
    status: details.status,
    inProduction: details.inProduction,
    episodeRuntime: details.episodeRunTime[0],
    ...common,
    creators: names(details.createdBy, NAMES_MAX),
    networks: names(details.networks, NAMES_MAX),
    numberOfSeasons: details.numberOfSeasons,
    numberOfEpisodes: details.numberOfEpisodes,
    ...seasonsOf(details),
    lastEpisodeToAir: episode(details.lastEpisodeToAir),
    nextEpisodeToAir: episode(details.nextEpisodeToAir),
    ...tail,
  }
}
