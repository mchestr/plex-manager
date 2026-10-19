/**
 * Overseerr request statistics for one member's Rewind.
 *
 * ## Process
 *
 * 1. Find the member's Overseerr account by paging `/api/v1/user?take=100`
 *    (at most 50 pages). Overseerr's numeric `plexId` must equal the member's
 *    `plexUserId`; failing that, the email must match in any case. A member
 *    who has a Plex id matches by email only a local account (no `plexId`),
 *    because a different `plexId` is a different Plex identity. A blank
 *    email or Plex id is no identity. A member with no match gets zeros:
 *    requests are never credited by a loose rule.
 * 2. Page through every server request (`take=100`, newest first, at most
 *    200 pages) until `pageInfo` says the last page was read. `skip` advances
 *    by the rows received and rows are kept once by id, so a request added
 *    between two fetches is not counted twice. Keep the requests created in
 *    the year (UTC, end exclusive).
 * 3. Count the member's requests with the API's own status values:
 *    - pending: request status PENDING;
 *    - approved: APPROVED or COMPLETED (DECLINED and FAILED never count);
 *    - available: an approved request whose media is AVAILABLE, or
 *      PARTIALLY_AVAILABLE for TV, read from `media.status4k` for a 4K
 *      request. Pending requests never count, and neither does any other
 *      media status, including Seerr's 6 and 7.
 *
 * Every response is checked with Zod; an error status, an unexpected shape or
 * hitting the request page cap returns `success: false`, so a partial count
 * is never reported.
 *
 * Requests carry no genres, so `topRequestedGenres` is empty until the genre
 * lookup by `tmdbId` exists.
 *
 * @module lib/wrapped/overseerr-statistics
 */

import type { z } from "zod"

import { serviceErrorMessage, serviceFetch } from "@/lib/connections/http"
import { createLogger } from "@/lib/utils/logger"
import {
  MediaRequestStatus,
  MediaStatus,
  overseerrRequestPageSchema,
  overseerrUserPageSchema,
  type OverseerrRequest,
} from "@/lib/validations/overseerr"
import type { OverseerrConfig, OverseerrStatisticsData } from "./statistics-types"

const logger = createLogger("STATISTICS")

const PAGE_SIZE = 100
const MAX_USER_PAGES = 50
const MAX_REQUEST_PAGES = 200

/** Who the member is, as stored on their `User` row. */
export interface OverseerrMemberIdentity {
  plexUserId: string | null
  email: string | null
}

async function getOverseerrPage<T>(
  config: OverseerrConfig,
  path: string,
  schema: z.ZodType<T>
): Promise<T> {
  const result = await serviceFetch({
    service: "Overseerr",
    url: `${config.url}/api/v1${path}`,
    headers: { "X-Api-Key": config.apiKey },
    schema,
  })
  if (!result.ok) throw new Error(serviceErrorMessage("Overseerr", result))
  return result.data
}

/**
 * Returns the member's Overseerr user id, or null when no account matches.
 * @internal
 */
async function findOverseerrUserId(
  config: OverseerrConfig,
  identity: OverseerrMemberIdentity
): Promise<number | null> {
  const plexIdText = identity.plexUserId?.trim()
  const plexId = plexIdText && Number.isSafeInteger(Number(plexIdText)) ? Number(plexIdText) : null
  const email = identity.email?.trim().toLowerCase() || null
  if (plexId === null && email === null) return null

  let emailMatch: number | null = null

  for (let page = 0; page < MAX_USER_PAGES; page++) {
    const users = await getOverseerrPage(
      config,
      `/user?take=${PAGE_SIZE}&skip=${page * PAGE_SIZE}`,
      overseerrUserPageSchema
    )

    for (const user of users.results) {
      if (plexId !== null && user.plexId === plexId) return user.id
      if (emailMatch !== null || email === null || user.email?.trim().toLowerCase() !== email) continue
      if (plexId === null) return user.id
      if (user.plexId == null) emailMatch = user.id
    }

    if (users.pageInfo.page >= users.pageInfo.pages) return emailMatch
  }

  logger.warn("Stopped searching Overseerr users at the page cap", { pages: MAX_USER_PAGES })
  return emailMatch
}

/** @internal */
async function fetchAllRequests(config: OverseerrConfig): Promise<OverseerrRequest[]> {
  const requests = new Map<number, OverseerrRequest>()
  let skip = 0

  for (let pageCount = 0; pageCount < MAX_REQUEST_PAGES; pageCount++) {
    const page = await getOverseerrPage(
      config,
      `/request?take=${PAGE_SIZE}&skip=${skip}&sort=added&filter=all`,
      overseerrRequestPageSchema
    )
    for (const request of page.results) requests.set(request.id, request)
    if (page.results.length === 0 || page.pageInfo.page >= page.pageInfo.pages) {
      return [...requests.values()]
    }
    skip += page.results.length
  }

  throw new Error(`Overseerr /request has more than ${MAX_REQUEST_PAGES} pages`)
}

/** @internal */
function isApproved(request: OverseerrRequest): boolean {
  return request.status === MediaRequestStatus.APPROVED || request.status === MediaRequestStatus.COMPLETED
}

/** @internal */
function isAvailable(request: OverseerrRequest): boolean {
  if (!isApproved(request)) return false
  const mediaStatus = request.is4k ? request.media.status4k : request.media.status
  return (
    mediaStatus === MediaStatus.AVAILABLE ||
    (request.type === "tv" && mediaStatus === MediaStatus.PARTIALLY_AVAILABLE)
  )
}

/**
 * Fetch a member's Overseerr request statistics for a year.
 *
 * @param config - Overseerr URL and API key
 * @param identity - The member's `plexUserId` and email
 * @param year - Calendar year, as a UTC window
 * @returns The member's counts and the server's total for the year, or
 *   `success: false` when Overseerr fails or answers in an unexpected shape
 */
export async function fetchOverseerrStatistics(
  config: OverseerrConfig,
  identity: OverseerrMemberIdentity,
  year: number
): Promise<{
  success: boolean
  data?: OverseerrStatisticsData
  error?: string
}> {
  try {
    const overseerrUserId = await findOverseerrUserId(config, identity)
    const allRequests = await fetchAllRequests(config)

    const yearStart = Date.UTC(year, 0, 1)
    const yearEnd = Date.UTC(year + 1, 0, 1)
    const yearRequests = allRequests.filter((request) => {
      const createdAt = Date.parse(request.createdAt)
      return createdAt >= yearStart && createdAt < yearEnd
    })

    const memberRequests =
      overseerrUserId === null
        ? []
        : yearRequests.filter((request) => request.requestedBy?.id === overseerrUserId)

    const countWhere = (predicate: (request: OverseerrRequest) => boolean) =>
      memberRequests.filter(predicate).length

    return {
      success: true,
      data: {
        totalRequests: memberRequests.length,
        totalServerRequests: yearRequests.length,
        approvedRequests: countWhere(isApproved),
        pendingRequests: countWhere((request) => request.status === MediaRequestStatus.PENDING),
        availableRequests: countWhere(isAvailable),
        topRequestedGenres: [],
      },
    }
  } catch (error) {
    logger.error("Error fetching Overseerr statistics", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch Overseerr statistics",
    }
  }
}
