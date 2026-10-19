import { getAllOverseerrRequests, getOverseerrDiscoverMovies, getOverseerrDiscoverTV, getOverseerrMediaDetails, getOverseerrRequests, getOverseerrStatus, getOverseerrUsers } from "@/lib/connections/overseerr"
import { prisma } from "@/lib/prisma"
import { toToolOutput } from "./tool-output"

export async function executeOverseerrTool(
  toolName: string,
  args: Record<string, unknown>,
  _userId?: string,
  _context?: string
): Promise<string> {
  const server = await prisma.overseerr.findFirst({ where: { isActive: true } })
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
    case "get_overseerr_requests": {
      return toToolOutput(await getOverseerrRequests(config))
    }
    case "get_overseerr_discover_movies": {
      const page = typeof args.page === "number" ? args.page : 1
      const sortBy = typeof args.sortBy === "string" ? args.sortBy : "popularity.desc"
      return toToolOutput(await getOverseerrDiscoverMovies(config, page, sortBy))
    }
    case "get_overseerr_discover_tv": {
      const page = typeof args.page === "number" ? args.page : 1
      const sortBy = typeof args.sortBy === "string" ? args.sortBy : "popularity.desc"
      return toToolOutput(await getOverseerrDiscoverTV(config, page, sortBy))
    }
    case "get_overseerr_media_details": {
      if (typeof args.mediaId !== "number") {
        return "Error: 'mediaId' parameter is required and must be a number"
      }
      if (args.mediaType !== "movie" && args.mediaType !== "tv") {
        return "Error: 'mediaType' parameter must be 'movie' or 'tv'"
      }
      return toToolOutput(await getOverseerrMediaDetails(config, args.mediaId, args.mediaType))
    }
    case "get_overseerr_users": {
      return toToolOutput(await getOverseerrUsers(config))
    }
    case "get_overseerr_all_requests": {
      const limit = typeof args.limit === "number" ? args.limit : 20
      return toToolOutput(await getAllOverseerrRequests(config, limit))
    }
    default:
      return "Error: Unknown Overseerr tool"
  }
}

