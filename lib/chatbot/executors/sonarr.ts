import "server-only"

import { getSonarrCalendar, getSonarrDiskSpace, getSonarrEpisodeById, getSonarrEpisodes, getSonarrHealth, getSonarrHistory, getSonarrQualityProfiles, getSonarrQueue, getSonarrRootFolders, getSonarrSeries, getSonarrSeriesById, getSonarrSystemStatus, getSonarrWantedMissing, searchSonarrSeries } from "@/lib/connections/sonarr"
import { ARR_MAX_RECORDS } from "@/lib/connections/arr-client"
import { prisma } from "@/lib/prisma"
import { type SonarrParsed } from "@/lib/validations/sonarr"

import { arrListOutput, arrPageOutput, idForTitle, type ArrFilter } from "./arr-output"

/**
 * The series a tool asks about: `seriesId`, or the library series whose title
 * matches `seriesName`. Neither given is every series; a name with no match
 * is an `error` to return as the tool output.
 */
async function resolveSeries(config: SonarrParsed, args: Record<string, unknown>): Promise<{ seriesId?: number } | { error: string }> {
  if (typeof args.seriesId === "number") return { seriesId: args.seriesId }
  if (typeof args.seriesName !== "string") return {}
  const library = await getSonarrSeries(config)
  if (!library.success) return { error: JSON.stringify({ error: library.error }) }
  const seriesId = idForTitle(library.data, args.seriesName)
  if (seriesId === undefined) return { error: JSON.stringify({ error: `Series "${args.seriesName}" not found in Sonarr library` }) }
  return { seriesId }
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
  const server = await prisma.sonarr.findFirst({ where: { isActive: true } })
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
      if (typeof args.term !== "string") {
        return "Error: 'term' parameter is required and must be a string"
      }
      const lookupResult = await searchSonarrSeries(config, args.term)
      if (!lookupResult.success) {
        return JSON.stringify({ error: lookupResult.error })
      }
      const lookupResults = lookupResult.data

      // Also check if any of these series are already in the library
      // This allows us to return Sonarr internal IDs when available
      const libraryResult = await getSonarrSeries(config)
      const libraryArray = libraryResult.success && Array.isArray(libraryResult.data) ? libraryResult.data : []

      // Match lookup results with library series by TVDB ID
      const enrichedResults = Array.isArray(lookupResults) ? lookupResults.map((lookup: any) => {
        const inLibrary = libraryArray.find((lib: any) =>
          lib.tvdbId === lookup.tvdbId ||
          lib.title?.toLowerCase() === lookup.title?.toLowerCase()
        )
        return {
          ...lookup,
          // If found in library, include Sonarr internal ID
          sonarrId: inLibrary?.id,
          inLibrary: !!inLibrary,
        }
      }) : lookupResults

      return JSON.stringify(enrichedResults)
    }
    case "get_sonarr_history": {
      const pageSize = typeof args.pageSize === "number" ? args.pageSize : 20
      const episodeId = typeof args.episodeId === "number" ? args.episodeId : undefined
      const series = await resolveSeries(config, args)
      if ("error" in series) return series.error
      // A series reads /history/series and an episode /history?episodeId=, so Sonarr filters
      return arrPageOutput(await getSonarrHistory(config, { pageSize, seriesId: series.seriesId, episodeId }))
    }
    case "get_sonarr_queue": {
      // The queue cannot filter by series on every Sonarr version: read up to the cap and filter here
      const series = await resolveSeries(config, args)
      if ("error" in series) return series.error
      const limit = series.seriesId === undefined ? 50 : ARR_MAX_RECORDS
      return arrPageOutput(await getSonarrQueue(config, limit), seriesFilter(series.seriesId))
    }
    case "get_sonarr_series": {
      const seriesResult = await getSonarrSeries(config)
      if (!seriesResult.success) {
        return JSON.stringify({ error: seriesResult.error })
      }
      return JSON.stringify(seriesResult.data)
    }
    case "get_sonarr_series_details": {
      if (typeof args.seriesId !== "number") {
        return "Error: 'seriesId' parameter is required and must be a number"
      }
      const seriesResult = await getSonarrSeriesById(config, args.seriesId)
      if (!seriesResult.success) {
        return JSON.stringify({ error: seriesResult.error })
      }
      return JSON.stringify(seriesResult.data)
    }
    case "get_sonarr_calendar": {
      const startDate = typeof args.startDate === "string" ? args.startDate : undefined
      const endDate = typeof args.endDate === "string" ? args.endDate : undefined
      const series = await resolveSeries(config, args)
      if ("error" in series) return series.error
      return arrListOutput(await getSonarrCalendar(config, startDate, endDate), seriesFilter(series.seriesId))
    }
    case "get_sonarr_wanted_missing": {
      const pageSize = typeof args.pageSize === "number" ? args.pageSize : 20
      // wanted/missing cannot filter by series: read up to the cap and filter here
      const series = await resolveSeries(config, args)
      if ("error" in series) return series.error
      const limit = series.seriesId === undefined ? pageSize : ARR_MAX_RECORDS
      return arrPageOutput(await getSonarrWantedMissing(config, limit), seriesFilter(series.seriesId))
    }
    case "get_sonarr_root_folders": {
      const foldersResult = await getSonarrRootFolders(config)
      if (!foldersResult.success) {
        return JSON.stringify({ error: foldersResult.error })
      }
      return JSON.stringify(foldersResult.data)
    }
    case "get_sonarr_quality_profiles": {
      const profilesResult = await getSonarrQualityProfiles(config)
      if (!profilesResult.success) {
        return JSON.stringify({ error: profilesResult.error })
      }
      return JSON.stringify(profilesResult.data)
    }
    case "get_sonarr_episodes": {
      if (typeof args.seriesId !== "number") {
        return "Error: 'seriesId' parameter is required and must be a number"
      }
      const seasonNumber = typeof args.seasonNumber === "number" ? args.seasonNumber : undefined
      const episodeNumber = typeof args.episodeNumber === "number" ? args.episodeNumber : undefined
      const episodesResult = await getSonarrEpisodes(config, args.seriesId)
      if (!episodesResult.success) {
        return JSON.stringify({ error: episodesResult.error })
      }
      const episodes = episodesResult.data

      // Filter by season/episode if provided
      let filteredEpisodes = Array.isArray(episodes) ? episodes : []
      if (seasonNumber !== undefined) {
        filteredEpisodes = filteredEpisodes.filter((ep: any) => ep.seasonNumber === seasonNumber)
      }
      if (episodeNumber !== undefined) {
        filteredEpisodes = filteredEpisodes.filter((ep: any) => ep.episodeNumber === episodeNumber)
      }

      return JSON.stringify(filteredEpisodes.length > 0 ? filteredEpisodes : episodes)
    }
    case "get_sonarr_episode_details": {
      if (typeof args.episodeId !== "number") {
        return "Error: 'episodeId' parameter is required and must be a number"
      }
      const episodeResult = await getSonarrEpisodeById(config, args.episodeId)
      if (!episodeResult.success) {
        return JSON.stringify({ error: episodeResult.error })
      }
      return JSON.stringify(episodeResult.data)
    }
    default:
      return "Error: Unknown Sonarr tool"
  }
}

