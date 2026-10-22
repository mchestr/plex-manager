import { getSonarrCalendar, getSonarrDiskSpace, getSonarrEpisodeById, getSonarrEpisodes, getSonarrHealth, getSonarrHistory, getSonarrQualityProfiles, getSonarrQueue, getSonarrRootFolders, getSonarrSeries, getSonarrSeriesById, getSonarrSystemStatus, getSonarrWantedMissing, searchSonarrSeries } from "@/lib/connections/sonarr"
import { prisma } from "@/lib/prisma"

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
        getSonarrQueue(config),
        getSonarrHealth(config),
        getSonarrDiskSpace(config),
      ])
      return JSON.stringify({
        status: statusResult.success ? statusResult.data : { error: statusResult.error },
        queue: queueResult.success ? queueResult.data : { error: queueResult.error },
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
      let seriesId: number | undefined = typeof args.seriesId === "number" ? args.seriesId : undefined
      let episodeId: number | undefined = typeof args.episodeId === "number" ? args.episodeId : undefined

      // If seriesName is provided, search for the series first
      if (typeof args.seriesName === "string" && !seriesId) {
        const seriesName = args.seriesName
        const allSeriesResult = await getSonarrSeries(config)
        if (!allSeriesResult.success) {
          return JSON.stringify({ error: allSeriesResult.error })
        }
        const allSeries = allSeriesResult.data
        const matchingSeries = Array.isArray(allSeries)
          ? allSeries.find(
              (s: { title?: string; titleSlug?: string }) =>
                s.title?.toLowerCase().includes(seriesName.toLowerCase()) ||
                s.titleSlug?.toLowerCase().includes(seriesName.toLowerCase())
            )
          : null

        if (!matchingSeries) {
          return JSON.stringify({
            error: `Series "${seriesName}" not found in Sonarr library`,
          })
        }

        seriesId = matchingSeries.id
      }

      // If episodeId is provided but we need to find seriesId, get episode details
      // Note: Sonarr history API can filter by episodeId directly, but if user wants series history
      // we need seriesId. For now, if episodeId is provided, we'll use it directly.
      const historyResult = await getSonarrHistory(config, pageSize, seriesId, episodeId)
      if (!historyResult.success) {
        return JSON.stringify({ error: historyResult.error })
      }
      return JSON.stringify(historyResult.data)
    }
    case "get_sonarr_queue": {
      const queueResult = await getSonarrQueue(config)
      if (!queueResult.success) {
        return JSON.stringify({ error: queueResult.error })
      }
      return JSON.stringify(queueResult.data)
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
      const calendarResult = await getSonarrCalendar(config, startDate, endDate)
      if (!calendarResult.success) {
        return JSON.stringify({ error: calendarResult.error })
      }
      return JSON.stringify(calendarResult.data)
    }
    case "get_sonarr_wanted_missing": {
      const pageSize = typeof args.pageSize === "number" ? args.pageSize : 20
      const missingResult = await getSonarrWantedMissing(config, pageSize)
      if (!missingResult.success) {
        return JSON.stringify({ error: missingResult.error })
      }
      return JSON.stringify(missingResult.data)
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

