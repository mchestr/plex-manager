import { getAllOverseerrRequests, getOverseerrDiscoverMovies, getOverseerrDiscoverTV, getOverseerrMediaDetails, getOverseerrRequests, getOverseerrStatus, getOverseerrUsers } from "@/lib/connections/overseerr"
import { prisma } from "@/lib/prisma"
import { type ConnectionResult } from "@/types/connection"
import { z } from "zod"
import { withoutPersonalFields } from "./personal-fields"
import { toToolOutput } from "./tool-output"

/** The longest display name the model sees; members choose it, so it is untrusted text (SEC-42). */
const DISPLAY_NAME_MAX = 64

// `GET /user`: { pageInfo: { results: <total>, ... }, results: [{ id, displayName, email, requestCount, permissions, ... }] }
const usersSchema = z.object({
  pageInfo: z.looseObject({ results: z.number() }).optional(),
  results: z.array(
    z.looseObject({
      id: z.number(),
      displayName: z.string().nullish(),
      requestCount: z.number().nullish(),
      permissions: z.number().nullish(),
    })
  ),
})

/**
 * Overseerr users projected to the fields an answer needs: no email, a
 * bounded display name. The first page holds 100; `total` is every user, and
 * `more` says how many are not listed.
 */
function projectUsers(result: ConnectionResult<unknown>): string {
  if (!result.success) return toToolOutput(result)
  const users = usersSchema.safeParse(result.data)
  if (!users.success) return JSON.stringify({ error: "Unexpected response from Overseerr" })
  const listed = users.data.results.length
  const total = Math.max(users.data.pageInfo?.results ?? listed, listed)
  return JSON.stringify({
    total,
    ...(total > listed ? { more: `and ${total - listed} more` } : {}),
    users: users.data.results.map((user) => ({
      id: user.id,
      displayName: (user.displayName ?? "").slice(0, DISPLAY_NAME_MAX),
      requestCount: user.requestCount ?? 0,
      permissions: user.permissions ?? 0,
    })),
  })
}

/** A result with the requesters' emails removed. */
function withoutEmails(result: ConnectionResult<unknown>): string {
  return toToolOutput(result.success ? { ...result, data: withoutPersonalFields(result.data) } : result)
}

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
      return withoutEmails(await getOverseerrRequests(config))
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
      return withoutEmails(await getOverseerrMediaDetails(config, args.mediaId, args.mediaType))
    }
    case "get_overseerr_users": {
      return projectUsers(await getOverseerrUsers(config))
    }
    case "get_overseerr_all_requests": {
      const limit = typeof args.limit === "number" ? args.limit : 20
      return withoutEmails(await getAllOverseerrRequests(config, limit))
    }
    default:
      return "Error: Unknown Overseerr tool"
  }
}

