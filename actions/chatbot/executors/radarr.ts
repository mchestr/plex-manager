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
      const [status, queue, health, disk] = await Promise.all([
        getRadarrSystemStatus(config),
        getRadarrQueue(config),
        getRadarrHealth(config),
        getRadarrDiskSpace(config),
      ])
      return JSON.stringify({ status, queue, health, disk })
    }
    case "search_radarr_movies": {
      if (typeof args.term !== "string") {
        return "Error: 'term' parameter is required and must be a string"
      }
      const lookupResults = await searchRadarrMovies(config, args.term)

      // Also check if any of these movies are already in the library
      // This allows us to return Radarr internal IDs when available
      const libraryMovies = await getRadarrMovies(config)
      const libraryArray = Array.isArray(libraryMovies) ? libraryMovies : []

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
        const allMovies = await getRadarrMovies(config)
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

      const history = await getRadarrHistory(config, pageSize, movieId)
      return JSON.stringify(history)
    }
    case "get_radarr_queue": {
      const queue = await getRadarrQueue(config)
      return JSON.stringify(queue)
    }
    case "get_radarr_movies": {
      const movies = await getRadarrMovies(config)
      return JSON.stringify(movies)
    }
    case "get_radarr_movie_details": {
      if (typeof args.movieId !== "number") {
        return "Error: 'movieId' parameter is required and must be a number"
      }
      const movie = await getRadarrMovieById(config, args.movieId)
      return JSON.stringify(movie)
    }
    case "get_radarr_calendar": {
      const startDate = typeof args.startDate === "string" ? args.startDate : undefined
      const endDate = typeof args.endDate === "string" ? args.endDate : undefined
      const calendar = await getRadarrCalendar(config, startDate, endDate)
      return JSON.stringify(calendar)
    }
    case "get_radarr_wanted_missing": {
      const pageSize = typeof args.pageSize === "number" ? args.pageSize : 20
      const missing = await getRadarrWantedMissing(config, pageSize)
      return JSON.stringify(missing)
    }
    case "get_radarr_root_folders": {
      const folders = await getRadarrRootFolders(config)
      return JSON.stringify(folders)
    }
    case "get_radarr_quality_profiles": {
      const profiles = await getRadarrQualityProfiles(config)
      return JSON.stringify(profiles)
    }
    default:
      return "Error: Unknown Radarr tool"
  }
}

