import "server-only"

import { getSonarrDiskSpace, getSonarrEpisodeById, getSonarrEpisodes, getSonarrHealth, getSonarrQualityProfiles, getSonarrQueue, getSonarrRootFolders, getSonarrSeries, getSonarrSeriesById, getSonarrSystemStatus, searchSonarrSeries } from "@/lib/connections/sonarr"
import { getActiveService } from "@/lib/data/active-service"

import { optionalWhole, textArg, wholeArg, wholeOrNone } from "./arr-args"
import { arrLocalPage, arrSearchOutput, asList, byTitle, projectEach, titleMatches } from "./arr-output"
import { healthWithoutPaths } from "./arr-paths"
import { qualityProfile, rootFolder, trimDetails } from "./arr-projections"
import { calendarOutput, historyOutput, queueOutput, wantedMissingOutput } from "./sonarr-lists"
import { episodesOutput, librarySeries, lookupItem, seriesItem, withSonarrId } from "./sonarr-projections"

/** Most series a page holds, so it stays under the tool result limit (see arr-output). */
const SERIES_PAGE_SIZE = 50
const SERIES_PAGE_SIZE_MAX = 75
const PAGE_MAX = 10_000

const NO_SERIES = "Error: 'seriesId' parameter is required and must be a number"

export async function executeSonarrTool(
  toolName: string,
  args: Record<string, unknown>,
  _userId?: string,
  context?: string
): Promise<string> {
  const server = await getActiveService("sonarr")
  if (!server) return "Error: No active Sonarr server configured."

  const config = {
    name: server.name,
    url: server.url,
    apiKey: server.apiKey,
    publicUrl: server.publicUrl || undefined,
  }

  // Discord is a shared channel: its replies name no download folder's tree
  const discord = context === "discord"

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
        health: healthResult.success ? (discord ? healthWithoutPaths(healthResult.data) : healthResult.data) : { error: healthResult.error },
        disk: diskResult.success ? diskResult.data : { error: diskResult.error },
      })
    }
    case "search_sonarr_series": {
      const term = textArg(args.term, 200)
      if (term === undefined) return "Error: 'term' parameter is required and must be a string"
      const lookup = await searchSonarrSeries(config, term)
      if (!lookup.success) return JSON.stringify({ error: lookup.error })
      // Sonarr gives a series it holds its id; the library's TVDB ids cover a version that does not, and give its download state
      const library = await getSonarrSeries(config)
      const held = librarySeries(library.success ? library.data : [])
      const results = projectEach(asList(lookup.data), lookupItem).map((result) => withSonarrId(result, held))
      return arrSearchOutput(results, term, "tvdb:<tvdbId> for one series")
    }
    case "get_sonarr_history":
      return historyOutput(config, args, discord)
    case "get_sonarr_queue":
      return queueOutput(config, args, discord)
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
    case "get_sonarr_calendar":
      return calendarOutput(config, args)
    case "get_sonarr_wanted_missing":
      return wantedMissingOutput(config, args)
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
      const season = optionalWhole(args, "seasonNumber", 0)
      if ("error" in season) return season.error
      const episode = optionalWhole(args, "episodeNumber", 0)
      if ("error" in episode) return episode.error
      const result = await getSonarrEpisodes(config, seriesId)
      if (!result.success) return JSON.stringify({ error: result.error })
      return episodesOutput(result.data, { seasonNumber: season.value, episodeNumber: episode.value, page: wholeArg(args.page, 1, PAGE_MAX) })
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
