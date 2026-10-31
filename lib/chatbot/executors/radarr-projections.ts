import "server-only"

import { z } from "zod"

import { asList, projectEach } from "./arr-output"
import { clip, day, flag, historyFields, historyOf, known, num, OVERVIEW_MAX, quality, queueFields, queueOf, text, TITLE_MAX } from "./arr-projections"

/**
 * Radarr records as the tools return them: ids the other tools take
 * (`movieId`, `tmdbId`, `imdbId`, `titleSlug`), titles, and the state an
 * answer needs. A nested movie becomes `movie: { title, year }`, the name the
 * Discord allowlists keep.
 *
 * @module
 */

const movieRef = z.object({ title: text, year: num }).optional().catch(undefined)

function movieOf(movie: z.output<typeof movieRef>) {
  return movie && { title: clip(movie.title, TITLE_MAX), year: known(movie.year) }
}

/** A library movie: `id` is the movieId the other Radarr tools take; `quality` is its file's ("Bluray-2160p"). */
export const movieItem = z
  .object({
    id: num,
    title: text,
    year: num,
    titleSlug: text,
    tmdbId: num,
    imdbId: text,
    status: text,
    monitored: flag,
    hasFile: flag,
    movieFile: z.object({ quality }).optional().catch(undefined),
    sizeOnDisk: num,
    statistics: z.object({ sizeOnDisk: num }).optional().catch(undefined),
    added: text,
    qualityProfileId: num,
  })
  .transform(({ statistics, movieFile, ...movie }) => ({
    ...movie,
    title: clip(movie.title, TITLE_MAX),
    year: known(movie.year),
    titleSlug: clip(movie.titleSlug, TITLE_MAX),
    tmdbId: known(movie.tmdbId),
    imdbId: movie.imdbId || undefined,
    quality: movieFile?.quality?.quality?.name,
    sizeOnDisk: movie.sizeOnDisk ?? statistics?.sizeOnDisk,
  }))

/** A lookup result. Radarr gives a movie it holds its library `id`, which becomes `radarrId`. */
export const lookupItem = z
  .object({ id: num, title: text, year: num, titleSlug: text, tmdbId: num, imdbId: text, status: text, studio: text, overview: text })
  .transform((movie) => ({
    title: clip(movie.title, TITLE_MAX),
    year: known(movie.year),
    tmdbId: known(movie.tmdbId),
    imdbId: movie.imdbId || undefined,
    titleSlug: clip(movie.titleSlug, TITLE_MAX),
    status: movie.status,
    studio: movie.studio,
    overview: clip(movie.overview, OVERVIEW_MAX),
    radarrId: known(movie.id),
  }))

/** A library movie as a search result in the library shows it: its id, whether it is downloaded, and whether it is monitored. */
interface HeldMovie {
  radarrId: number
  hasFile?: boolean
  monitored?: boolean
}

/** The library's movies by TMDB id. */
export function libraryMovies(library: unknown): Map<number, HeldMovie> {
  const held = new Map<number, HeldMovie>()
  for (const movie of projectEach(asList(library), z.object({ id: num, tmdbId: num, hasFile: flag, monitored: flag }))) {
    const radarrId = known(movie.id)
    const tmdbId = known(movie.tmdbId)
    if (radarrId === undefined || tmdbId === undefined) continue
    held.set(tmdbId, { radarrId, hasFile: movie.hasFile, monitored: movie.monitored })
  }
  return held
}

/**
 * A lookup result marked `inLibrary`. One in the library has its `radarrId`
 * (its own, or the library movie's with the same TMDB id; never by title
 * alone, which would give a remake the original's id) and, from the library,
 * whether it is downloaded (`hasFile`) and `monitored`.
 */
export function withRadarrId(result: z.output<typeof lookupItem>, library: Map<number, HeldMovie>) {
  const held = result.tmdbId === undefined ? undefined : library.get(result.tmdbId)
  const radarrId = result.radarrId ?? held?.radarrId
  if (radarrId === undefined) return { ...result, inLibrary: false }
  return { ...result, radarrId, inLibrary: true, hasFile: held?.hasFile, monitored: held?.monitored }
}

const historyItem = z.object({ ...historyFields, movieId: num, movie: movieRef })

/** A history record: the event, the release, its movie, and why it failed; `pathless` in Discord (see `historyOf`). */
export function historyRecord(pathless: boolean) {
  return historyItem.transform((record) => ({ ...historyOf(record, pathless), movieId: record.movieId, movie: movieOf(record.movie) }))
}

const queueItem = z.object({ ...queueFields, movieId: num, movie: movieRef })

/** A queue item: the release, its movie, progress and state; `pathless` in Discord (see `queueOf`). */
export function queueRecord(pathless: boolean) {
  return queueItem.transform((item) => ({ movieId: item.movieId, movie: movieOf(item.movie), ...queueOf(item, pathless) }))
}

/**
 * A calendar or wanted/missing movie: `id` is the movieId. Release dates are
 * days; `isAvailable` says whether Radarr counts it as released under its
 * `minimumAvailability`, so it searches for it.
 */
export const movieRecord = z
  .object({
    id: num,
    title: text,
    year: num,
    tmdbId: num,
    status: text,
    monitored: flag,
    hasFile: flag,
    isAvailable: flag,
    minimumAvailability: text,
    inCinemas: text,
    digitalRelease: text,
    physicalRelease: text,
    lastSearchTime: text,
  })
  .transform((movie) => ({
    ...movie,
    title: clip(movie.title, TITLE_MAX),
    year: known(movie.year),
    tmdbId: known(movie.tmdbId),
    inCinemas: day(movie.inCinemas),
    digitalRelease: day(movie.digitalRelease),
    physicalRelease: day(movie.physicalRelease),
  }))
