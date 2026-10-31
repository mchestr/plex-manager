import "server-only"

import { getRadarrCalendar, getRadarrDiskSpace, getRadarrHealth, getRadarrHistory, getRadarrMovieById, getRadarrMovies, getRadarrQualityProfiles, getRadarrQueue, getRadarrRootFolders, getRadarrSystemStatus, getRadarrWantedMissing, searchRadarrMovies } from "@/lib/connections/radarr"
import { ARR_MAX_RECORDS } from "@/lib/connections/arr-client"
import { getActiveService } from "@/lib/data/active-service"
import { type RadarrParsed } from "@/lib/validations/radarr"

import { calendarRange, optionalText, optionalWhole, textArg, wholeArg, wholeOrNone } from "./arr-args"
import { arrListOutput, arrLocalPage, arrPageOutput, arrSearchOutput, asList, byTitle, idForTitle, orElse, projectEach, titleMatches, type ArrFilter } from "./arr-output"
import { qualityProfile, rootFolder, trimDetails } from "./arr-projections"
import { historyRecord, libraryIds, lookupItem, movieItem, movieRecord, queueRecord, withRadarrId } from "./radarr-projections"

/** Most records a reply holds, so it stays under the tool result limit (see arr-output). */
const HISTORY_MAX = 50
const QUEUE_MAX = 50
const CALENDAR_MAX = 100
const WANTED_MAX = 50
const MOVIES_PAGE_SIZE = 50
const MOVIES_PAGE_SIZE_MAX = 75
const PAGE_MAX = 10_000

const PASS_MOVIE = "pass a movie (movieId or movieName)"
/** The wanted list is read to a cap, so a movie past it is checked on its own. */
const CHECK_MOVIE = "if it is not among them, check the movie itself with get_radarr_movie_details (monitored, hasFile, isAvailable)"

/**
 * The movie a tool asks about: `movieId`, or the library movie whose title
 * matches `movieName`. Neither given is every movie; a name with no match, or
 * a movieId that cannot be read with no name to fall back on, is an `error`
 * to return as the tool output.
 */
async function resolveMovie(config: RadarrParsed, args: Record<string, unknown>): Promise<{ movieId?: number } | { error: string }> {
  const id = optionalWhole(args, "movieId")
  if (!("error" in id) && id.value !== undefined) return { movieId: id.value }
  const name = optionalText(args, "movieName")
  if ("error" in name) return name
  if (name.value === undefined) return "error" in id ? id : {}
  const library = await getRadarrMovies(config)
  if (!library.success) return { error: JSON.stringify({ error: library.error }) }
  const movieId = idForTitle(library.data, name.value)
  if (movieId === undefined) return { error: JSON.stringify({ error: `Movie "${name.value}" not found in Radarr library` }) }
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
  context?: string
): Promise<string> {
  const server = await getActiveService("radarr")
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
      const term = textArg(args.term, 200)
      if (term === undefined) return "Error: 'term' parameter is required and must be a string"
      const lookup = await searchRadarrMovies(config, term)
      if (!lookup.success) return JSON.stringify({ error: lookup.error })
      // Radarr gives a movie it holds its id; the library's TMDB ids cover a version that does not
      const library = await getRadarrMovies(config)
      const ids = libraryIds(library.success ? library.data : [])
      const results = projectEach(asList(lookup.data), lookupItem).map((result) => withRadarrId(result, ids))
      return arrSearchOutput(results, term, "tmdb:<tmdbId> or imdb:<imdbId> for one movie")
    }
    case "get_radarr_history": {
      const pageSize = wholeArg(args.pageSize, 20, HISTORY_MAX)
      const movie = await resolveMovie(config, args)
      if ("error" in movie) return movie.error
      const more = orElse(pageSize < HISTORY_MAX && `pass a pageSize up to ${HISTORY_MAX}`, movie.movieId === undefined && PASS_MOVIE)
      // A movie reads /history/movie, so Radarr filters
      return arrPageOutput(await getRadarrHistory(config, { pageSize, movieId: movie.movieId }), { project: historyRecord, limit: pageSize, more })
    }
    case "get_radarr_queue": {
      // The queue cannot filter by movie: read up to the cap and filter here
      const movie = await resolveMovie(config, args)
      if ("error" in movie) return movie.error
      const limit = movie.movieId === undefined ? QUEUE_MAX : ARR_MAX_RECORDS
      const more = movie.movieId === undefined ? `${PASS_MOVIE} to see only its items` : undefined
      const reply = { project: queueRecord(context === "discord"), limit: QUEUE_MAX, more }
      return arrPageOutput(await getRadarrQueue(config, limit), reply, movieFilter("movieId", movie.movieId))
    }
    case "get_radarr_movies": {
      const library = await getRadarrMovies(config)
      if (!library.success) return JSON.stringify({ error: library.error })
      const search = textArg(args.search)
      const all = projectEach(asList(library.data), movieItem)
      return JSON.stringify(
        arrLocalPage({
          items: byTitle(search === undefined ? all : all.filter((movie) => titleMatches(movie.title, search))),
          page: wholeArg(args.page, 1, PAGE_MAX),
          pageSize: wholeArg(args.pageSize, MOVIES_PAGE_SIZE, MOVIES_PAGE_SIZE_MAX),
          what: search === undefined ? "movies, sorted by title" : `movies whose title contains "${search}", of ${all.length} in the library`,
          more: search === undefined ? "pass search to find a title" : undefined,
        })
      )
    }
    case "get_radarr_movie_details": {
      const movieId = wholeOrNone(args.movieId)
      if (movieId === undefined) return "Error: 'movieId' parameter is required and must be a number"
      const result = await getRadarrMovieById(config, movieId)
      return JSON.stringify(result.success ? trimDetails(result.data) : { error: result.error })
    }
    case "get_radarr_calendar": {
      const { start, end } = calendarRange(args)
      const movie = await resolveMovie(config, args)
      if ("error" in movie) return movie.error
      const more = `narrow the date range (startDate, endDate)${movie.movieId === undefined ? " or pass a movie" : ""} to see the rest`
      return arrListOutput(await getRadarrCalendar(config, start, end), { project: movieRecord, limit: CALENDAR_MAX, more }, movieFilter("id", movie.movieId))
    }
    case "get_radarr_wanted_missing": {
      const pageSize = wholeArg(args.pageSize, 20, WANTED_MAX)
      const movie = await resolveMovie(config, args)
      if ("error" in movie) return movie.error
      if (movie.movieId === undefined) {
        const more = orElse(pageSize < WANTED_MAX && `pass a pageSize up to ${WANTED_MAX}`, PASS_MOVIE)
        return arrPageOutput(await getRadarrWantedMissing(config, pageSize), { project: movieRecord, limit: pageSize, more })
      }
      // wanted/missing cannot filter by movie: read up to the cap and filter here
      const reply = { project: movieRecord, limit: ARR_MAX_RECORDS, more: CHECK_MOVIE, morePastRead: true }
      return arrPageOutput(await getRadarrWantedMissing(config, ARR_MAX_RECORDS), reply, movieFilter("id", movie.movieId))
    }
    case "get_radarr_root_folders": {
      const result = await getRadarrRootFolders(config)
      return JSON.stringify(result.success ? projectEach(asList(result.data), rootFolder) : { error: result.error })
    }
    case "get_radarr_quality_profiles": {
      const result = await getRadarrQualityProfiles(config)
      return JSON.stringify(result.success ? projectEach(asList(result.data), qualityProfile) : { error: result.error })
    }
    default:
      return "Error: Unknown Radarr tool"
  }
}
