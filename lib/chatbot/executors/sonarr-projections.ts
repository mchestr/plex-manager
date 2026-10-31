import "server-only"

import { z } from "zod"

import { arrLocalPage, asList, projectEach } from "./arr-output"
import { clip, flag, historyFields, historyOf, known, num, OVERVIEW_MAX, queueFields, queueOf, text, TITLE_MAX } from "./arr-projections"

/**
 * Sonarr records as the tools return them: ids the other tools take
 * (`seriesId`, `episodeId`, `tvdbId`, `tmdbId`, `titleSlug`), titles, and the
 * state an answer needs. Nested series and episodes become `series: { title }`
 * and `episode: { title, seasonNumber, episodeNumber }`, the names the Discord
 * allowlists keep.
 *
 * @module
 */

const seriesRef = z.object({ title: text }).optional().catch(undefined)
const episodeRef = z.object({ title: text, seasonNumber: num, episodeNumber: num }).optional().catch(undefined)

function seriesOf(series: z.output<typeof seriesRef>) {
  return series && { title: clip(series.title, TITLE_MAX) }
}

function episodeOf(episode: z.output<typeof episodeRef>) {
  return episode && { title: clip(episode.title, TITLE_MAX), seasonNumber: episode.seasonNumber, episodeNumber: episode.episodeNumber }
}

const statistics = z.object({ seasonCount: num, episodeFileCount: num, episodeCount: num, sizeOnDisk: num }).optional().catch(undefined)

/**
 * A library series: `id` is the seriesId; `seriesType` is standard, daily or
 * anime; `episodeCount` counts the monitored aired episodes,
 * `episodeFileCount` those on disk.
 */
export const seriesItem = z
  .object({ id: num, title: text, year: num, titleSlug: text, tvdbId: num, tmdbId: num, status: text, seriesType: text, network: text, monitored: flag, added: text, qualityProfileId: num, statistics })
  .transform((series) => ({
    id: series.id,
    title: clip(series.title, TITLE_MAX),
    year: known(series.year),
    titleSlug: clip(series.titleSlug, TITLE_MAX),
    tvdbId: known(series.tvdbId),
    tmdbId: known(series.tmdbId),
    status: series.status,
    seriesType: series.seriesType,
    network: clip(series.network, TITLE_MAX),
    monitored: series.monitored,
    seasonCount: series.statistics?.seasonCount,
    episodeFileCount: series.statistics?.episodeFileCount,
    episodeCount: series.statistics?.episodeCount,
    sizeOnDisk: series.statistics?.sizeOnDisk,
    added: series.added,
    qualityProfileId: series.qualityProfileId,
  }))

/** A lookup result. Sonarr gives a series it holds its library `id`, which becomes `sonarrId`. */
export const lookupItem = z
  .object({ id: num, title: text, year: num, titleSlug: text, tvdbId: num, tmdbId: num, imdbId: text, status: text, network: text, overview: text })
  .transform((series) => ({
    title: clip(series.title, TITLE_MAX),
    year: known(series.year),
    tvdbId: known(series.tvdbId),
    tmdbId: known(series.tmdbId),
    imdbId: series.imdbId || undefined,
    titleSlug: clip(series.titleSlug, TITLE_MAX),
    status: series.status,
    network: series.network,
    overview: clip(series.overview, OVERVIEW_MAX),
    sonarrId: known(series.id),
  }))

/** A library series as a search result in the library shows it: its id, whether it is monitored, and its episode counts. */
interface HeldSeries {
  sonarrId: number
  monitored?: boolean
  episodeFileCount?: number
  episodeCount?: number
}

/** The library's series by TVDB id. */
export function librarySeries(library: unknown): Map<number, HeldSeries> {
  const held = new Map<number, HeldSeries>()
  for (const series of projectEach(asList(library), z.object({ id: num, tvdbId: num, monitored: flag, statistics }))) {
    const sonarrId = known(series.id)
    const tvdbId = known(series.tvdbId)
    if (sonarrId === undefined || tvdbId === undefined) continue
    held.set(tvdbId, { sonarrId, monitored: series.monitored, episodeFileCount: series.statistics?.episodeFileCount, episodeCount: series.statistics?.episodeCount })
  }
  return held
}

/**
 * A lookup result marked `inLibrary`. One in the library has its `sonarrId`
 * (its own, or the library series' with the same TVDB id; never by title
 * alone, which would give a remake the original's id) and, from the library,
 * whether it is `monitored` and how much of it is downloaded:
 * `episodeFileCount` of its `episodeCount` monitored, aired episodes.
 */
export function withSonarrId(result: z.output<typeof lookupItem>, library: Map<number, HeldSeries>) {
  const held = result.tvdbId === undefined ? undefined : library.get(result.tvdbId)
  const sonarrId = result.sonarrId ?? held?.sonarrId
  if (sonarrId === undefined) return { ...result, inLibrary: false }
  return { ...result, sonarrId, inLibrary: true, monitored: held?.monitored, episodeFileCount: held?.episodeFileCount, episodeCount: held?.episodeCount }
}

const historyItem = z.object({ ...historyFields, seriesId: num, episodeId: num, series: seriesRef, episode: episodeRef })

/** A history record: the event, the release, its series and episode, and why it failed; `pathless` in Discord (see `historyOf`). */
export function historyRecord(pathless: boolean) {
  return historyItem.transform((record) => ({
    ...historyOf(record, pathless),
    seriesId: record.seriesId,
    episodeId: record.episodeId,
    series: seriesOf(record.series),
    episode: episodeOf(record.episode),
  }))
}

const queueItem = z.object({ ...queueFields, seriesId: num, episodeId: num, series: seriesRef, episode: episodeRef })

/** A queue item: the release, its series and episode, progress and state; `pathless` in Discord (see `queueOf`). */
export function queueRecord(pathless: boolean) {
  return queueItem.transform((item) => ({
    seriesId: item.seriesId,
    episodeId: item.episodeId,
    series: seriesOf(item.series),
    episode: episodeOf(item.episode),
    ...queueOf(item, pathless),
  }))
}

/** A calendar or wanted/missing episode with its series: `id` is the episodeId. */
export const episodeRecord = z
  .object({ id: num, seriesId: num, series: seriesRef, seasonNumber: num, episodeNumber: num, title: text, airDateUtc: text, hasFile: flag, monitored: flag, lastSearchTime: text })
  .transform((episode) => ({ ...episode, series: seriesOf(episode.series), title: clip(episode.title, TITLE_MAX) }))

/** An episode of one series (get_sonarr_episodes): `id` is the episodeId. */
const seriesEpisode = z
  .object({ id: num, seasonNumber: num, episodeNumber: num, title: text, airDate: text, hasFile: flag, monitored: flag })
  .transform((episode) => ({ ...episode, title: clip(episode.title, TITLE_MAX) }))

type SeriesEpisode = z.output<typeof seriesEpisode>

/** Episodes one reply of get_sonarr_episodes holds. */
const EPISODES_PAGE_SIZE = 100

/** Each season's episode count and how many have a file, so the model can pick a seasonNumber. */
function seasonsOf(episodes: SeriesEpisode[]) {
  const seasons = new Map<number, { seasonNumber: number; episodes: number; withFile: number }>()
  for (const { seasonNumber, hasFile } of episodes) {
    if (seasonNumber === undefined) continue
    const season = seasons.get(seasonNumber) ?? { seasonNumber, episodes: 0, withFile: 0 }
    season.episodes += 1
    if (hasFile) season.withFile += 1
    seasons.set(seasonNumber, season)
  }
  return [...seasons.values()].sort((a, b) => a.seasonNumber - b.seasonNumber)
}

function bySeasonAndEpisode(a: SeriesEpisode, b: SeriesEpisode): number {
  return (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) || (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0)
}

interface EpisodeQuery {
  seasonNumber?: number
  episodeNumber?: number
  page: number
}

/**
 * A series' episodes by season and number, a page at a time, filtered to a
 * season and/or episode number. A filter that matches nothing returns no
 * episodes and a note, with the seasons the series has; a reply that cannot
 * show every episode lists the seasons too, so the model can ask for one.
 */
export function episodesOutput(data: unknown, { seasonNumber, episodeNumber, page }: EpisodeQuery): string {
  const all = projectEach(asList(data), seriesEpisode).sort(bySeasonAndEpisode)
  const wanted = all.filter(
    (episode) => (seasonNumber === undefined || episode.seasonNumber === seasonNumber) && (episodeNumber === undefined || episode.episodeNumber === episodeNumber)
  )
  const asked = [seasonNumber !== undefined && `season ${seasonNumber}`, episodeNumber !== undefined && `episode ${episodeNumber}`].filter(Boolean).join(", ")
  const reply = arrLocalPage({
    items: wanted,
    page,
    pageSize: EPISODES_PAGE_SIZE,
    what: asked ? `episodes matching ${asked}` : "episodes, by season and number",
    more: seasonNumber === undefined ? "pass seasonNumber for one season (seasons lists them)" : undefined,
  })
  const none = asked !== "" && wanted.length === 0
  const note = none ? { note: `No episode of this series matches ${asked}; seasons lists the seasons it has` } : {}
  const seasons = none || (seasonNumber === undefined && reply.records.length < wanted.length) ? { seasons: seasonsOf(all) } : {}
  return JSON.stringify({ showing: reply.showing, totalRecords: reply.totalRecords, ...note, ...seasons, records: reply.records })
}
