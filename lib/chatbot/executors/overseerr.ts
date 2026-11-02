import "server-only"

import {
  getOverseerrDiscoverMovies,
  getOverseerrDiscoverTV,
  getOverseerrMediaDetails,
  getOverseerrRequests,
  getOverseerrStatus,
  getOverseerrUsers,
  type OverseerrEndpoint,
} from "@/lib/connections/overseerr"
import { getActiveService } from "@/lib/data/active-service"
import { type ConnectionResult } from "@/types/connection"

import { OVERSEERR_REQUEST_FILTERS } from "../tools/overseerr"
import { CAST_DEFAULT, CAST_MAX, projectMediaDetails } from "./overseerr-details"
import { DISCOVER_LAST_PAGE, projectDiscoverPage, projectRequestPage, projectUserPage } from "./overseerr-lists"
import { toToolOutput } from "./tool-output"

/** Requests per page: the open-requests tool lists 10 and the all-requests tool 20 unless asked; either at most 50. */
const REQUESTS_MAX = 50
/** A page past any real list, so `skip` stays a safe integer. */
const PAGE_MAX = 100_000

/** A whole number from a model's argument (a number or a string of digits), clamped to `min`..`max`; `fallback` otherwise. */
function intArg(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\s*\d+\s*$/.test(value) ? Number(value) : Number.NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback
}

/** A positive whole id from a model's argument, or `undefined`. */
function idArg(value: unknown): number | undefined {
  const n = typeof value === "string" && /^\s*\d+\s*$/.test(value) ? Number(value) : value
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : undefined
}

/** The projection of a successful call, the call's error, or a fixed line for a reply of another shape. */
function output(result: ConnectionResult<unknown>, project: (data: unknown) => object | undefined): string {
  if (!result.success) return toToolOutput(result)
  const projected = project(result.data)
  return JSON.stringify(projected ?? { error: "Unexpected response from Overseerr" })
}

/**
 * One page of requests, optionally one user's. The open-requests tool asks
 * for Overseerr's `unavailable` filter: waiting for approval, or approved and
 * not yet available. The all-requests tool takes any filter.
 */
async function requestList(config: OverseerrEndpoint, args: Record<string, unknown>, open: boolean): Promise<string> {
  const limit = intArg(args.limit, open ? 10 : 20, 1, REQUESTS_MAX)
  const page = intArg(args.page, 1, 1, PAGE_MAX)
  const filter = open ? "unavailable" : OVERSEERR_REQUEST_FILTERS.find((known) => known === (args.filter ?? "all"))
  if (!filter) {
    return `Error: 'filter' must be one of ${OVERSEERR_REQUEST_FILTERS.join(", ")}`
  }
  const requestedBy = idArg(args.requestedBy)
  if (args.requestedBy != null && requestedBy === undefined) {
    return "Error: 'requestedBy' must be an Overseerr user id from get_overseerr_users"
  }
  const result = await getOverseerrRequests(config, {
    take: limit,
    skip: (page - 1) * limit,
    filter: filter === "all" ? undefined : filter,
    requestedBy,
  })
  const hint = open ? "; requestedBy narrows the list" : "; filter and requestedBy narrow the list"
  return output(result, (data) => projectRequestPage(data, page, limit, hint))
}

export async function executeOverseerrTool(
  toolName: string,
  args: Record<string, unknown>,
  _userId?: string,
  _context?: string
): Promise<string> {
  const server = await getActiveService("overseerr")
  if (!server) return "Error: No active Overseerr server configured."

  const config = {
    name: server.name,
    url: server.url,
    apiKey: server.apiKey,
    publicUrl: server.publicUrl || undefined,
  }

  switch (toolName) {
    case "get_overseerr_status": {
      return toToolOutput(await getOverseerrStatus(config))
    }
    case "get_overseerr_requests":
    case "get_overseerr_all_requests": {
      return requestList(config, args, toolName === "get_overseerr_requests")
    }
    case "get_overseerr_discover_movies":
    case "get_overseerr_discover_tv": {
      // TMDB serves no page past 500 (Overseerr answers HTTP 500): a later one reads page 500, and the reply says so
      const asked = intArg(args.page, 1, 1, PAGE_MAX)
      const page = Math.min(asked, DISCOVER_LAST_PAGE)
      const sortBy = typeof args.sortBy === "string" && args.sortBy !== "" ? args.sortBy : "popularity.desc"
      const kind = toolName === "get_overseerr_discover_movies" ? "movie" : "tv"
      const result = await (kind === "movie" ? getOverseerrDiscoverMovies : getOverseerrDiscoverTV)(config, page, sortBy)
      return output(result, (data) => projectDiscoverPage(data, page, kind, asked))
    }
    case "get_overseerr_media_details": {
      const mediaId = idArg(args.mediaId)
      if (mediaId === undefined) {
        return "Error: 'mediaId' parameter is required and must be a number"
      }
      const mediaType = args.mediaType
      if (mediaType !== "movie" && mediaType !== "tv") {
        return "Error: 'mediaType' parameter must be 'movie' or 'tv'"
      }
      const castLimit = intArg(args.castLimit, CAST_DEFAULT, 0, CAST_MAX)
      const result = await getOverseerrMediaDetails(config, mediaId, mediaType)
      return output(result, (data) => projectMediaDetails(data, mediaType, castLimit))
    }
    case "get_overseerr_users": {
      const page = intArg(args.page, 1, 1, PAGE_MAX)
      return output(await getOverseerrUsers(config, page - 1), (data) => projectUserPage(data, page))
    }
    default:
      return "Error: Unknown Overseerr tool"
  }
}
