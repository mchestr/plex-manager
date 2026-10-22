import { getRadarrCalendar, getRadarrDiskSpace, getRadarrHealth, getRadarrHistory, getRadarrMovieById, getRadarrMovies, getRadarrQualityProfiles, getRadarrQueue, getRadarrRootFolders, getRadarrSystemStatus, getRadarrWantedMissing, searchRadarrMovies } from "@/lib/connections/radarr"
import { prisma } from "@/lib/prisma"

export async function executeRadarrTool(
  toolName: string,
  args: Record<string, unknown>,
  _userId?: string,
  _context?: string
): Promise<string> {
  const server = await prisma.radarr.findFirst({ where: { isActive: true } })
  if (!server) return "Error: No active Radarr server configured."

  const config = {
    name: server.name,
    url: server.url,
    apiKey: server.apiKey,
    publicUrl: server.publicUrl || undefined,
  }

  switch (toolName) {
    case "get_radarr_status": {
      const [statusResult, queueResult, healthResult, diskResult] = await Promise.all([
        getRadarrSystemStatus(config),
        getRadarrQueue(config),
        getRadarrHealth(config),
        getRadarrDiskSpace(config),
      ])
      return JSON.stringify({
        status: statusResult.success ? statusResult.data : { error: statusResult.error },
        queue: queueResult.success ? queueResult.data : { error: queueResult.error },
        health: healthResult.success ? healthResult.data : { error: healthResult.error },
        disk: diskResult.success ? diskResult.data : { error: diskResult.error },
      })
    }
    case "search_radarr_movies": {
      if (typeof args.term !== "string") {
        return "Error: 'term' parameter is required and must be a string"
      }
      const lookupResult = await searchRadarrMovies(config, args.term)
      if (!lookupResult.success) {
        return JSON.stringify({ error: lookupResult.error })
      }
      const lookupResults = lookupResult.data

      // Also check if any of these movies are already in the library
      // This allows us to return Radarr internal IDs when available
      const libraryResult = await getRadarrMovies(config)
      const libraryArray = libraryResult.success && Array.isArray(libraryResult.data) ? libraryResult.data : []

      // Match lookup results with library movies by TMDB ID
      const enrichedResults = Array.isArray(lookupResults) ? lookupResults.map((lookup: any) => {
        const inLibrary = libraryArray.find((lib: any) =>
          lib.tmdbId === lookup.tmdbId ||
          lib.title?.toLowerCase() === lookup.title?.toLowerCase()
        )
        return {
          ...lookup,
          // If found in library, include Radarr internal ID
          radarrId: inLibrary?.id,
          inLibrary: !!inLibrary,
        }
      }) : lookupResults

      return JSON.stringify(enrichedResults)
    }
    case "get_radarr_history": {
      const pageSize = typeof args.pageSize === "number" ? args.pageSize : 20
      let movieId: number | undefined = typeof args.movieId === "number" ? args.movieId : undefined

      // If movieName is provided, search for the movie first
      if (typeof args.movieName === "string" && !movieId) {
        const movieName = args.movieName
        const allMoviesResult = await getRadarrMovies(config)
        if (!allMoviesResult.success) {
          return JSON.stringify({ error: allMoviesResult.error })
        }
        const allMovies = allMoviesResult.data
        const matchingMovie = Array.isArray(allMovies)
          ? allMovies.find(
              (m: { title?: string; titleSlug?: string }) =>
                m.title?.toLowerCase().includes(movieName.toLowerCase()) ||
                m.titleSlug?.toLowerCase().includes(movieName.toLowerCase())
            )
          : null

        if (!matchingMovie) {
          return JSON.stringify({
            error: `Movie "${movieName}" not found in Radarr library`,
          })
        }

        movieId = matchingMovie.id
      }

      const historyResult = await getRadarrHistory(config, pageSize, movieId)
      if (!historyResult.success) {
        return JSON.stringify({ error: historyResult.error })
      }
      return JSON.stringify(historyResult.data)
    }
    case "get_radarr_queue": {
      const queueResult = await getRadarrQueue(config)
      if (!queueResult.success) {
        return JSON.stringify({ error: queueResult.error })
      }
      return JSON.stringify(queueResult.data)
    }
    case "get_radarr_movies": {
      const moviesResult = await getRadarrMovies(config)
      if (!moviesResult.success) {
        return JSON.stringify({ error: moviesResult.error })
      }
      return JSON.stringify(moviesResult.data)
    }
    case "get_radarr_movie_details": {
      if (typeof args.movieId !== "number") {
        return "Error: 'movieId' parameter is required and must be a number"
      }
      const movieResult = await getRadarrMovieById(config, args.movieId)
      if (!movieResult.success) {
        return JSON.stringify({ error: movieResult.error })
      }
      return JSON.stringify(movieResult.data)
    }
    case "get_radarr_calendar": {
      const startDate = typeof args.startDate === "string" ? args.startDate : undefined
      const endDate = typeof args.endDate === "string" ? args.endDate : undefined
      const calendarResult = await getRadarrCalendar(config, startDate, endDate)
      if (!calendarResult.success) {
        return JSON.stringify({ error: calendarResult.error })
      }
      return JSON.stringify(calendarResult.data)
    }
    case "get_radarr_wanted_missing": {
      const pageSize = typeof args.pageSize === "number" ? args.pageSize : 20
      const missingResult = await getRadarrWantedMissing(config, pageSize)
      if (!missingResult.success) {
        return JSON.stringify({ error: missingResult.error })
      }
      return JSON.stringify(missingResult.data)
    }
    case "get_radarr_root_folders": {
      const foldersResult = await getRadarrRootFolders(config)
      if (!foldersResult.success) {
        return JSON.stringify({ error: foldersResult.error })
      }
      return JSON.stringify(foldersResult.data)
    }
    case "get_radarr_quality_profiles": {
      const profilesResult = await getRadarrQualityProfiles(config)
      if (!profilesResult.success) {
        return JSON.stringify({ error: profilesResult.error })
      }
      return JSON.stringify(profilesResult.data)
    }
    default:
      return "Error: Unknown Radarr tool"
  }
}

