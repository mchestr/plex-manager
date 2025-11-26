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
      const [status, queue, health, disk] = await Promise.all([
        getSonarrSystemStatus(config),
        getSonarrQueue(config),
        getSonarrHealth(config),
        getSonarrDiskSpace(config),
      ])
      return JSON.stringify({ status, queue, health, disk })
    }
    case "search_sonarr_series": {
      if (typeof args.term !== "string") {
        return "Error: 'term' parameter is required and must be a string"
      }
      const lookupResults = await searchSonarrSeries(config, args.term)

      // Also check if any of these series are already in the library
      // This allows us to return Sonarr internal IDs when available
      const librarySeries = await getSonarrSeries(config)
      const libraryArray = Array.isArray(librarySeries) ? librarySeries : []

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
        const allSeries = await getSonarrSeries(config)
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
      const history = await getSonarrHistory(config, pageSize, seriesId, episodeId)
      return JSON.stringify(history)
    }
    case "get_sonarr_queue": {
      const queue = await getSonarrQueue(config)
      return JSON.stringify(queue)
    }
    case "get_sonarr_series": {
      const series = await getSonarrSeries(config)
      return JSON.stringify(series)
    }
    case "get_sonarr_series_details": {
      if (typeof args.seriesId !== "number") {
        return "Error: 'seriesId' parameter is required and must be a number"
      }
      const series = await getSonarrSeriesById(config, args.seriesId)
      return JSON.stringify(series)
    }
    case "get_sonarr_calendar": {
      const startDate = typeof args.startDate === "string" ? args.startDate : undefined
      const endDate = typeof args.endDate === "string" ? args.endDate : undefined
      const calendar = await getSonarrCalendar(config, startDate, endDate)
      return JSON.stringify(calendar)
    }
    case "get_sonarr_wanted_missing": {
      const pageSize = typeof args.pageSize === "number" ? args.pageSize : 20
      const missing = await getSonarrWantedMissing(config, pageSize)
      return JSON.stringify(missing)
    }
    case "get_sonarr_root_folders": {
      const folders = await getSonarrRootFolders(config)
      return JSON.stringify(folders)
    }
    case "get_sonarr_quality_profiles": {
      const profiles = await getSonarrQualityProfiles(config)
      return JSON.stringify(profiles)
    }
    case "get_sonarr_episodes": {
      if (typeof args.seriesId !== "number") {
        return "Error: 'seriesId' parameter is required and must be a number"
      }
      const seasonNumber = typeof args.seasonNumber === "number" ? args.seasonNumber : undefined
      const episodeNumber = typeof args.episodeNumber === "number" ? args.episodeNumber : undefined
      const episodes = await getSonarrEpisodes(config, args.seriesId)

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
      const episode = await getSonarrEpisodeById(config, args.episodeId)
      return JSON.stringify(episode)
    }
    default:
      return "Error: Unknown Sonarr tool"
  }
}

