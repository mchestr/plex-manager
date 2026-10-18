/**
 * Overseerr request statistics for one member's Rewind.
 *
 * ## Process
 *
 * 1. Find the member's Overseerr account by paging `/api/v1/user?take=100`
 *    (at most 50 pages). Overseerr's numeric `plexId` must equal the member's
 *    `plexUserId`; failing that, the email must match in any case. A member
 *    with no match gets zeros: requests are never credited by a loose rule.
 * 2. Page through every server request (`take=100`, newest first) until a
 *    page comes back short, and keep the ones created in the year (UTC).
 * 3. Count the member's requests with the API's own status values:
 *    - pending: request status PENDING;
 *    - approved: APPROVED or COMPLETED (DECLINED and FAILED never count);
 *    - available: an approved or pending request whose media is AVAILABLE,
 *      or PARTIALLY_AVAILABLE for TV. Any other media status, including
 *      Seerr's 6 and 7, is not available.
 *
 * Every response is checked with Zod; an error status or an unexpected shape
 * returns `success: false`, so a partial count is never reported.
 *
 * Requests carry no genres, so `topRequestedGenres` is empty until the genre
 * lookup by `tmdbId` exists.
 *
 * @module lib/wrapped/overseerr-statistics
 */

import type { z } from "zod"

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
  const response = await fetch(`${config.url}/api/v1${path}`, {
    headers: {
      "X-Api-Key": config.apiKey,
      "Accept": "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`Overseerr ${path} failed: ${response.status} ${response.statusText}`)
  }

  const parsed = schema.safeParse(await response.json())
  if (!parsed.success) {
    logger.warn("Unexpected Overseerr response", {
      path,
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    })
    throw new Error(`Overseerr ${path} returned an unexpected response`)
  }

  return parsed.data
}

/**
 * Returns the member's Overseerr user id, or null when no account matches.
 * @internal
 */
async function findOverseerrUserId(
  config: OverseerrConfig,
  identity: OverseerrMemberIdentity
): Promise<number | null> {
  const plexId = identity.plexUserId ? Number(identity.plexUserId) : null
  const email = identity.email?.toLowerCase() ?? null
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
      if (emailMatch === null && email !== null && user.email?.toLowerCase() === email) {
        if (plexId === null) return user.id
        emailMatch = user.id
      }
    }

    if (users.pageInfo.page >= users.pageInfo.pages) return emailMatch
  }

  logger.warn("Stopped searching Overseerr users at the page cap", { pages: MAX_USER_PAGES })
  return emailMatch
}

/** @internal */
async function fetchAllRequests(config: OverseerrConfig): Promise<OverseerrRequest[]> {
  const requests: OverseerrRequest[] = []

  for (let skip = 0; ; skip += PAGE_SIZE) {
    const page = await getOverseerrPage(
      config,
      `/request?take=${PAGE_SIZE}&skip=${skip}&sort=added&filter=all`,
      overseerrRequestPageSchema
    )
    requests.push(...page.results)
    if (page.results.length < PAGE_SIZE) return requests
  }
}

/** @internal */
function isAvailable(request: OverseerrRequest): boolean {
  if (request.status === MediaRequestStatus.DECLINED || request.status === MediaRequestStatus.FAILED) {
    return false
  }
  return (
    request.media.status === MediaStatus.AVAILABLE ||
    (request.type === "tv" && request.media.status === MediaStatus.PARTIALLY_AVAILABLE)
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
        approvedRequests: countWhere(
          (request) =>
            request.status === MediaRequestStatus.APPROVED ||
            request.status === MediaRequestStatus.COMPLETED
        ),
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
