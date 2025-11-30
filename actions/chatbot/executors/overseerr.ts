import { getAllOverseerrRequests, getOverseerrDiscoverMovies, getOverseerrDiscoverTV, getOverseerrMediaDetails, getOverseerrRequests, getOverseerrStatus, getOverseerrUsers } from "@/lib/connections/overseerr"
import { getActiveOverseerrService } from "@/lib/services/service-helpers"

export async function executeOverseerrTool(
  toolName: string,
  args: Record<string, unknown>,
  _userId?: string,
  _context?: string
): Promise<string> {
  const overseerrService = await getActiveOverseerrService()
  if (!overseerrService) return "Error: No active Overseerr server configured."

  const config = {
    name: overseerrService.name,
    url: overseerrService.url ?? "",
    apiKey: overseerrService.config.apiKey,
    publicUrl: overseerrService.publicUrl || undefined,
  }

  switch (toolName) {
    case "get_overseerr_status": {
      const status = await getOverseerrStatus(config)
      return JSON.stringify(status)
    }
    case "get_overseerr_requests": {
      const requests = await getOverseerrRequests(config)
      return JSON.stringify(requests)
    }
    case "get_overseerr_discover_movies": {
      const page = typeof args.page === "number" ? args.page : 1
      const sortBy = typeof args.sortBy === "string" ? args.sortBy : "popularity.desc"
      const movies = await getOverseerrDiscoverMovies(config, page, sortBy)
      return JSON.stringify(movies)
    }
    case "get_overseerr_discover_tv": {
      const page = typeof args.page === "number" ? args.page : 1
      const sortBy = typeof args.sortBy === "string" ? args.sortBy : "popularity.desc"
      const tv = await getOverseerrDiscoverTV(config, page, sortBy)
      return JSON.stringify(tv)
    }
    case "get_overseerr_media_details": {
      if (typeof args.mediaId !== "number") {
        return "Error: 'mediaId' parameter is required and must be a number"
      }
      if (args.mediaType !== "movie" && args.mediaType !== "tv") {
        return "Error: 'mediaType' parameter must be 'movie' or 'tv'"
      }
      const details = await getOverseerrMediaDetails(config, args.mediaId, args.mediaType)
      return JSON.stringify(details)
    }
    case "get_overseerr_users": {
      const users = await getOverseerrUsers(config)
      return JSON.stringify(users)
    }
    case "get_overseerr_all_requests": {
      const limit = typeof args.limit === "number" ? args.limit : 20
      const requests = await getAllOverseerrRequests(config, limit)
      return JSON.stringify(requests)
    }
    default:
      return "Error: Unknown Overseerr tool"
  }
}

