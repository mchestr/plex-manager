import "server-only"

import { getSonarrCalendar, getSonarrDiskSpace, getSonarrEpisodeById, getSonarrEpisodes, getSonarrHealth, getSonarrHistory, getSonarrQualityProfiles, getSonarrQueue, getSonarrRootFolders, getSonarrSeries, getSonarrSeriesById, getSonarrSystemStatus, getSonarrWantedMissing, searchSonarrSeries } from "@/lib/connections/sonarr"
import { ARR_MAX_RECORDS } from "@/lib/connections/arr-client"
import { getActiveService } from "@/lib/data/active-service"
import { type SonarrParsed } from "@/lib/validations/sonarr"

import { calendarRange, textArg, wholeArg, wholeOrNone } from "./arr-args"
import { arrListOutput, arrLocalPage, arrPageOutput, arrSearchOutput, asList, byTitle, idForTitle, orElse, projectEach, titleMatches, type ArrFilter } from "./arr-output"
import { qualityProfile, rootFolder, trimDetails } from "./arr-projections"
import { episodeRecord, episodesOutput, historyRecord, libraryIds, lookupItem, queueRecord, seriesItem, withSonarrId } from "./sonarr-projections"

/** Most records a reply holds, so it stays under the tool result limit (see arr-output). */
const HISTORY_MAX = 50
const QUEUE_MAX = 50
const CALENDAR_MAX = 100
const WANTED_MAX = 50
const SERIES_PAGE_SIZE = 50
const SERIES_PAGE_SIZE_MAX = 100
const PAGE_MAX = 10_000

const NO_SERIES = "Error: 'seriesId' parameter is required and must be a number"
const PASS_SERIES = "pass a series (seriesId or seriesName)"

/**
 * The series a tool asks about: `seriesId`, or the library series whose title
 * matches `seriesName`. Neither given is every series; a name with no match
 * is an `error` to return as the tool output.
 */
async function resolveSeries(config: SonarrParsed, args: Record<string, unknown>): Promise<{ seriesId?: number } | { error: string }> {
  const seriesId = wholeOrNone(args.seriesId)
  if (seriesId !== undefined) return { seriesId }
  const name = textArg(args.seriesName)
  if (name === undefined) return {}
  const library = await getSonarrSeries(config)
  if (!library.success) return { error: JSON.stringify({ error: library.error }) }
  const id = idForTitle(library.data, name)
  if (id === undefined) return { error: JSON.stringify({ error: `Series "${name}" not found in Sonarr library` }) }
  return { seriesId: id }
}

function seriesFilter(seriesId: number | undefined): ArrFilter | undefined {
  return seriesId === undefined ? undefined : { key: "seriesId", id: seriesId }
}

export async function executeSonarrTool(
  toolName: string,
  args: Record<string, unknown>,
  _userId?: string,
  _context?: string
): Promise<string> {
  const server = await getActiveService("sonarr")
  if (!server) return "Error: No active Sonarr server configured."

  const config = {
    name: server.name,
    url: server.url,
    apiKey: server.apiKey,
    publicUrl: server.publicUrl || undefined,
  }

  switch (toolName) {
    case "get_sonarr_status": {
      const [statusResult, queueResult, healthResult, diskResult] = await Promise.all([
        getSonarrSystemStatus(config),
        getSonarrQueue(config, 1),
        getSonarrHealth(config),
        getSonarrDiskSpace(config),
      ])
      return JSON.stringify({
        status: statusResult.success ? statusResult.data : { error: statusResult.error },
        queue: queueResult.success ? { totalRecords: queueResult.data.totalRecords } : { error: queueResult.error },
        health: healthResult.success ? healthResult.data : { error: healthResult.error },
        disk: diskResult.success ? diskResult.data : { error: diskResult.error },
      })
    }
    case "search_sonarr_series": {
      const term = textArg(args.term, 200)
      if (term === undefined) return "Error: 'term' parameter is required and must be a string"
      const lookup = await searchSonarrSeries(config, term)
      if (!lookup.success) return JSON.stringify({ error: lookup.error })
      // Sonarr gives a series it holds its id; the library's TVDB ids cover a version that does not
      const library = await getSonarrSeries(config)
      const ids = libraryIds(library.success ? library.data : [])
      const results = projectEach(asList(lookup.data), lookupItem).map((result) => withSonarrId(result, ids))
      return arrSearchOutput(results, term, "tvdb:<tvdbId> for one series")
    }
    case "get_sonarr_history": {
      const pageSize = wholeArg(args.pageSize, 20, HISTORY_MAX)
      const episodeId = wholeOrNone(args.episodeId)
      const series = await resolveSeries(config, args)
      if ("error" in series) return series.error
      const more = orElse(pageSize < HISTORY_MAX && `pass a pageSize up to ${HISTORY_MAX}`, series.seriesId === undefined && episodeId === undefined && `${PASS_SERIES} or an episodeId`)
      // A series reads /history/series and an episode /history?episodeId=, so Sonarr filters
      return arrPageOutput(await getSonarrHistory(config, { pageSize, seriesId: series.seriesId, episodeId }), { project: historyRecord, limit: pageSize, more })
    }
    case "get_sonarr_queue": {
      // The queue cannot filter by series on every Sonarr version: read up to the cap and filter here
      const series = await resolveSeries(config, args)
      if ("error" in series) return series.error
      const limit = series.seriesId === undefined ? QUEUE_MAX : ARR_MAX_RECORDS
      const more = series.seriesId === undefined ? `${PASS_SERIES} to see only its items` : undefined
      return arrPageOutput(await getSonarrQueue(config, limit), { project: queueRecord, limit: QUEUE_MAX, more }, seriesFilter(series.seriesId))
    }
    case "get_sonarr_series": {
      const library = await getSonarrSeries(config)
      if (!library.success) return JSON.stringify({ error: library.error })
      const search = textArg(args.search)
      const all = projectEach(asList(library.data), seriesItem)
      return JSON.stringify(
        arrLocalPage({
          items: byTitle(search === undefined ? all : all.filter((series) => titleMatches(series.title, search))),
          page: wholeArg(args.page, 1, PAGE_MAX),
          pageSize: wholeArg(args.pageSize, SERIES_PAGE_SIZE, SERIES_PAGE_SIZE_MAX),
          what: search === undefined ? "series, sorted by title" : `series whose title contains "${search}", of ${all.length} in the library`,
          more: search === undefined ? "pass search to find a title" : undefined,
        })
      )
    }
    case "get_sonarr_series_details": {
      const seriesId = wholeOrNone(args.seriesId)
      if (seriesId === undefined) return NO_SERIES
      const result = await getSonarrSeriesById(config, seriesId)
      return JSON.stringify(result.success ? trimDetails(result.data) : { error: result.error })
    }
    case "get_sonarr_calendar": {
      const { start, end } = calendarRange(args)
      const series = await resolveSeries(config, args)
      if ("error" in series) return series.error
      const more = `narrow the date range (startDate, endDate)${series.seriesId === undefined ? " or pass a series" : ""} to see the rest`
      return arrListOutput(await getSonarrCalendar(config, start, end), { project: episodeRecord, limit: CALENDAR_MAX, more }, seriesFilter(series.seriesId))
    }
    case "get_sonarr_wanted_missing": {
      const pageSize = wholeArg(args.pageSize, 20, WANTED_MAX)
      // wanted/missing cannot filter by series: read up to the cap and filter here
      const series = await resolveSeries(config, args)
      if ("error" in series) return series.error
      const limit = series.seriesId === undefined ? pageSize : ARR_MAX_RECORDS
      const more = orElse(pageSize < WANTED_MAX && `pass a pageSize up to ${WANTED_MAX}`, series.seriesId === undefined && PASS_SERIES)
      return arrPageOutput(await getSonarrWantedMissing(config, limit), { project: episodeRecord, limit: pageSize, more }, seriesFilter(series.seriesId))
    }
    case "get_sonarr_root_folders": {
      const result = await getSonarrRootFolders(config)
      return JSON.stringify(result.success ? projectEach(asList(result.data), rootFolder) : { error: result.error })
    }
    case "get_sonarr_quality_profiles": {
      const result = await getSonarrQualityProfiles(config)
      return JSON.stringify(result.success ? projectEach(asList(result.data), qualityProfile) : { error: result.error })
    }
    case "get_sonarr_episodes": {
      const seriesId = wholeOrNone(args.seriesId)
      if (seriesId === undefined) return NO_SERIES
      const result = await getSonarrEpisodes(config, seriesId)
      if (!result.success) return JSON.stringify({ error: result.error })
      const query = { seasonNumber: wholeOrNone(args.seasonNumber, 0), episodeNumber: wholeOrNone(args.episodeNumber, 0), page: wholeArg(args.page, 1, PAGE_MAX) }
      return episodesOutput(result.data, query)
    }
    case "get_sonarr_episode_details": {
      const episodeId = wholeOrNone(args.episodeId)
      if (episodeId === undefined) return "Error: 'episodeId' parameter is required and must be a number"
      const result = await getSonarrEpisodeById(config, episodeId)
      return JSON.stringify(result.success ? trimDetails(result.data) : { error: result.error })
    }
    default:
      return "Error: Unknown Sonarr tool"
  }
}
