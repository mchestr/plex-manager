import { getRadarrCalendar, getRadarrDiskSpace, getRadarrHealth, getRadarrHistory, getRadarrMovieById, getRadarrMovies, getRadarrQualityProfiles, getRadarrQueue, getRadarrRootFolders, getRadarrSystemStatus, getRadarrWantedMissing, searchRadarrMovies } from "@/lib/connections/radarr"
import { ARR_MAX_RECORDS } from "@/lib/connections/arr-client"
import { prisma } from "@/lib/prisma"
import { type RadarrParsed } from "@/lib/validations/radarr"

import { arrListOutput, arrPageOutput, idForTitle, type ArrFilter } from "./arr-output"

/**
 * The movie a tool asks about: `movieId`, or the library movie whose title
 * matches `movieName`. Neither given is every movie; a name with no match is
 * an `error` to return as the tool output.
 */
async function resolveMovie(config: RadarrParsed, args: Record<string, unknown>): Promise<{ movieId?: number } | { error: string }> {
  if (typeof args.movieId === "number") return { movieId: args.movieId }
  if (typeof args.movieName !== "string") return {}
  const library = await getRadarrMovies(config)
  if (!library.success) return { error: JSON.stringify({ error: library.error }) }
  const movieId = idForTitle(library.data, args.movieName)
  if (movieId === undefined) return { error: JSON.stringify({ error: `Movie "${args.movieName}" not found in Radarr library` }) }
  return { movieId }
}

/** Queue records name their movie in `movieId`; calendar and wanted records are movies, so `id`. */
function movieFilter(key: "movieId" | "id", movieId: number | undefined): ArrFilter | undefined {
  return movieId === undefined ? undefined : { key, id: movieId }
}

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
        getRadarrQueue(config, 1),
        getRadarrHealth(config),
        getRadarrDiskSpace(config),
      ])
      return JSON.stringify({
        status: statusResult.success ? statusResult.data : { error: statusResult.error },
        queue: queueResult.success ? { totalRecords: queueResult.data.totalRecords } : { error: queueResult.error },
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
      const movie = await resolveMovie(config, args)
      if ("error" in movie) return movie.error
      // A movie reads /history/movie, so Radarr filters
      return arrPageOutput(await getRadarrHistory(config, { pageSize, movieId: movie.movieId }))
    }
    case "get_radarr_queue": {
      // The queue cannot filter by movie: read up to the cap and filter here
      const movie = await resolveMovie(config, args)
      if ("error" in movie) return movie.error
      const limit = movie.movieId === undefined ? 50 : ARR_MAX_RECORDS
      return arrPageOutput(await getRadarrQueue(config, limit), movieFilter("movieId", movie.movieId))
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
      const movie = await resolveMovie(config, args)
      if ("error" in movie) return movie.error
      return arrListOutput(await getRadarrCalendar(config, startDate, endDate), movieFilter("id", movie.movieId))
    }
    case "get_radarr_wanted_missing": {
      const pageSize = typeof args.pageSize === "number" ? args.pageSize : 20
      // wanted/missing cannot filter by movie: read up to the cap and filter here
      const movie = await resolveMovie(config, args)
      if ("error" in movie) return movie.error
      const limit = movie.movieId === undefined ? pageSize : ARR_MAX_RECORDS
      return arrPageOutput(await getRadarrWantedMissing(config, limit), movieFilter("id", movie.movieId))
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

