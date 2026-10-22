"use server"

import { z } from "zod"

import { memberAction } from "@/lib/actions/define-action"
import { type ActionErrorCode, type ActionResult, fail, ok, toActionError } from "@/lib/actions/result"
import { requireAdmin } from "@/lib/admin"
import { getPlexServerIdentity, getPlexUsers, unshareUserFromPlexServer } from "@/lib/connections/plex"
import { activeShareFor, type PlexTvUser as PlexUser } from "@/lib/connections/plex-tv-users"
import { type PlexUnshareErrorCode } from "@/lib/connections/plex-invitations"
import { prisma } from "@/lib/prisma"
import { endUserSessions } from "@/lib/session-revocation"
import { SubscriptionStatus } from "@/lib/generated/prisma/client"
import { usageTotalsByUser, usageTotalsForWrapped } from "@/lib/llm/usage-totals"
import { createLogger } from "@/lib/utils/logger"
import { parseStoredRewind } from "@/lib/wrapped/data/parse-stored"
import { readStoredError, toStoredError } from "@/lib/wrapped/generation-errors"
import { userIdSchema, yearSchema } from "@/lib/validations/shared-schemas"
import { decodeActivityCursor, loadActivityTimeline } from "@/lib/admin/activity-timeline"
import { activeRunStarts } from "@/lib/admin/active-runs"
import type {
  AdminUsersList,
  AdminUserWithWrappedStats,
  PlexAccessCheck,
  UserActivityTimelineData,
} from "@/types/admin"

const logger = createLogger("USER_QUERIES")

// --- Exported Actions ---

/**
 * Get user's Plex Wrapped.
 *
 * A non-admin caller gets `error` normalised to a stored code
 * (`{"code":"..."}`), so legacy free text, such as a pre-P0.9 row listing
 * Tautulli's users, never reaches a member's browser. Admins get the stored
 * text as is.
 *
 * `data` never carries `statistics.leaderboards`: rows written before P0.8
 * hold every member's name and yearly watch minutes there until P0.20's
 * clean-up runs, and no viewer reads them.
 *
 * A member may read only their own row (`FORBIDDEN` otherwise); admins may
 * read any. `data` is null when there is no row for the year.
 *
 * @param input - `{ userId, year }`
 */
export const getUserPlexWrapped = memberAction({
  input: z.object({ userId: userIdSchema, year: yearSchema }),
  fallbackError: "Failed to load the Rewind",
  handler: async ({ userId, year }, { session }) => {
    // This action is a public endpoint, so the ownership check must live here:
    // nothing gates direct Server Action calls.
    if (session.user.id !== userId && !session.user.isAdmin) {
      logger.warn("Unauthorized attempt to read another user's wrapped", {
        requesterId: session.user.id,
        targetUserId: userId,
      })
      return fail("FORBIDDEN", "You can only open your own Rewind.")
    }

    const wrapped = await prisma.plexWrapped.findUnique({
      where: {
        userId_year: {
          userId,
          year,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    })

    if (!wrapped) {
      return ok(null)
    }
    const visible = { ...wrapped, data: withoutLeaderboards(wrapped.data) }
    if (!visible.error || session.user.isAdmin) {
      return ok(visible)
    }
    return ok({ ...visible, error: toStoredError(readStoredError(visible.error)) })
  },
})

/**
 * Every user with their Rewind status for `year` (the caller passes the
 * season year; there is no calendar default), and whether Plex could be asked
 * about their access (P10.18).
 *
 * Plex being down never hides anyone: each non-owner's `hasPlexAccess` is
 * null and `plexCheck.status` is `unreachable`, so the page can say why. A
 * database failure throws to the admin error boundary rather than rendering
 * an empty list.
 */
export async function getAllUsersWithWrapped(year: number): Promise<AdminUsersList> {
  // Admin-only: enumerates every user's PII.
  await requireAdmin()

  const users = await fetchUsersWithWrappedData(year)
  const userIds = users.map((u) => u.id)
  const wrappedIds = users.flatMap((u) => u.plexWrapped.map((w) => w.id))
  // Aggregate queries in one round; no N+1
  const [access, shareStatsMap, subscriptionMap, totalUsageMap, yearUsageMap, runStarts] = await Promise.all([
    buildPlexAccessMap(users),
    fetchShareStatsMap(userIds),
    fetchSubscriptionMap(userIds),
    usageTotalsByUser(userIds),
    usageTotalsForWrapped(wrappedIds),
    activeRunStarts(userIds, year),
  ])
  const ownerPlexId = access.adminPlexUserId ? String(access.adminPlexUserId).trim() : null

  const rows = users.map((user): AdminUserWithWrappedStats => {
    const wrapped = user.plexWrapped[0]
    const shareStatsForUser = shareStatsMap.get(user.id) || { totalShares: 0, totalVisits: 0 }
    const subscription = subscriptionMap.get(user.id) ?? null

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      plexUserId: user.plexUserId,
      isAdmin: user.isAdmin,
      isOwner: Boolean(ownerPlexId && user.plexUserId && String(user.plexUserId).trim() === ownerPlexId),
      disabledAt: user.disabledAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      wrappedStatus: wrapped?.status || null,
      wrappedGeneratedAt: wrapped?.generatedAt || null,
      wrappedRunStartedAt: runStarts.get(user.id) ?? null,
      totalWrappedCount: user._count.plexWrapped,
      totalShares: shareStatsForUser.totalShares,
      totalVisits: shareStatsForUser.totalVisits,
      hasPlexAccess: access.map.get(user.id) ?? null,
      // This year's Rewind (regenerations included), and every call across all years
      llmUsage: (wrapped && yearUsageMap.get(wrapped.id)) ?? null,
      totalLlmUsage: totalUsageMap.get(user.id) ?? null,
      subscriptionStatus: subscription?.status ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      isExempt: user.isExempt,
      exemptReason: user.exemptReason,
      stripeCustomerId: subscription?.stripeCustomerId ?? null,
    }
  })

  return { users: rows, plexCheck: { status: access.status, checkedAt: new Date() } }
}

/** Admin copy for each unshare failure; Plex's own text is never shown. */
const UNSHARE_ERROR_COPY: Record<PlexUnshareErrorCode, string> = {
  PLEX_AUTH: "Plex rejected Plex Manager's token. Reconnect Plex in settings.",
  PLEX_UNAVAILABLE: "Plex didn't respond. Try again in a few minutes.",
}

/**
 * Removes a user's share of the configured Plex server (admin only), leaving
 * their plex.tv friendship and the owner's other servers alone. A share that
 * is already gone succeeds as `already_removed`. Either success also ends the
 * user's sessions (SEC-10).
 */
export async function unshareUserLibrary(
  userId: string
): Promise<ActionResult<{ status: "removed" | "already_removed" }, ActionErrorCode | PlexUnshareErrorCode>> {
  const session = await requireAdmin()

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        plexUserId: true,
        isAdmin: true,
      },
    })

    if (!user) {
      return fail("NOT_FOUND", "User not found")
    }

    if (user.isAdmin) {
      return fail("FORBIDDEN", "Cannot unshare library access for admin users")
    }

    if (!user.plexUserId) {
      return fail("VALIDATION", "User Plex ID is required to unshare library access")
    }

    const plexServer = await prisma.plexServer.findFirst({
      where: { isActive: true },
    })

    if (!plexServer) {
      return fail("NOT_FOUND", "No active Plex server configured")
    }

    const result = await unshareUserFromPlexServer(
      {
        url: plexServer.url,
        token: plexServer.token,
        machineIdentifier: plexServer.machineIdentifier,
      },
      user.plexUserId
    )

    if (!result.success) {
      logger.warn("Failed to unshare user library", { userId: user.id, code: result.code })
      return { success: false, code: result.code, error: UNSHARE_ERROR_COPY[result.code] }
    }

    await endUserSessions(user.id, "unshared", session.user.id)

    logger.info("Unshared user library", { userId: user.id, status: result.status })

    return ok({ status: result.status })
  } catch (error) {
    return toActionError(error, "Failed to unshare user library")
  }
}

// --- Internal Helpers ---
// NOT exported: every export in a "use server" module is a directly-invocable
// endpoint. These return user PII and are only consumed by getAllUsersWithWrapped
// (which is admin-gated), so they must not be independently callable.

/**
 * A stored `PlexWrapped.data` string without `statistics.leaderboards`: v1
 * and v2 rows are re-serialised from the parser, which drops them. Other rows
 * hold no leaderboards and pass through.
 */
function withoutLeaderboards(data: string): string {
  const stored = parseStoredRewind(data)
  return stored.version === 1 || stored.version === 2 ? JSON.stringify(stored.legacy) : data
}

async function fetchUsersWithWrappedData(year: number) {
  // Uses `include` (not `select`), so every scalar User column — including
  // `isExempt` and `exemptReason` used by the subscription column — is returned.
  // The Rewind row carries only its status and date; LLM usage comes from
  // aggregate queries (BP-28), never the rows with their prompt text.
  return prisma.user.findMany({
    orderBy: [
      { isAdmin: "desc" },
      { name: "asc" },
    ],
    include: {
      plexWrapped: {
        where: {
          year: year,
        },
        take: 1,
        select: { id: true, status: true, generatedAt: true },
      },
      _count: {
        select: {
          plexWrapped: true,
        },
      },
    },
  })
}

interface PlexAccessResult {
  map: Map<string, boolean | null>
  status: PlexAccessCheck["status"]
  adminPlexUserId: string | null
}

/**
 * Each user's access to the active Plex server: true, false, or null when it
 * can't be known (no Plex account, or Plex didn't answer). The owner is
 * always true, from the stored `adminPlexUserId`, even with Plex down.
 */
async function buildPlexAccessMap(users: { id: string; plexUserId: string | null }[]): Promise<PlexAccessResult> {
  const accessMap = new Map<string, boolean | null>()

  const plexServer = await prisma.plexServer.findFirst({
    where: { isActive: true },
  })

  if (!plexServer) {
    users.forEach(user => accessMap.set(user.id, null))
    return { map: accessMap, status: "not-configured", adminPlexUserId: null }
  }

  const adminPlexUserId = plexServer.adminPlexUserId
  const normalizedAdminId = adminPlexUserId ? String(adminPlexUserId).trim() : null
  const isOwner = (plexUserId: string | null) =>
    Boolean(normalizedAdminId && plexUserId && String(plexUserId).trim() === normalizedAdminId)
  const unknown = (): PlexAccessResult => {
    users.forEach(user => accessMap.set(user.id, isOwner(user.plexUserId) ? true : null))
    return { map: accessMap, status: "unreachable", adminPlexUserId }
  }

  try {
    // The server's machine identifier: stored, or asked of the PMS once
    const identityResult = plexServer.machineIdentifier
      ? { success: true, machineIdentifier: plexServer.machineIdentifier }
      : await getPlexServerIdentity({ url: plexServer.url, token: plexServer.token })
    if (!identityResult.success || !identityResult.machineIdentifier) return unknown()

    // Fetch all users from Plex.tv API once
    const usersResult = await getPlexUsers(plexServer.token)
    if (!usersResult.success || !usersResult.data) return unknown()

    const plexUserMap = new Map<string, PlexUser>()
    for (const plexUser of usersResult.data) {
      plexUserMap.set(plexUser.id, plexUser)
    }
    const machineIdentifier = identityResult.machineIdentifier

    for (const user of users) {
      if (!user.plexUserId) {
        accessMap.set(user.id, null)
      } else if (isOwner(user.plexUserId)) {
        accessMap.set(user.id, true)
      } else {
        const plexUser = plexUserMap.get(String(user.plexUserId).trim())
        // A pending invite is no access yet (GAP-06)
        accessMap.set(user.id, Boolean(plexUser && activeShareFor(plexUser, machineIdentifier)))
      }
    }
    return { map: accessMap, status: "ok", adminPlexUserId }
  } catch (error) {
    logger.error("Error checking Plex access for users", error)
    return unknown()
  }
}

async function fetchShareStatsMap(userIds: string[]): Promise<Map<string, { totalShares: number; totalVisits: number }>> {
  const shareStats = await prisma.plexWrapped.findMany({
    where: {
      userId: {
        in: userIds,
      },
    },
    select: {
      userId: true,
      shareToken: true,
      _count: {
        select: {
          shareVisits: true,
        },
      },
    },
  })

  const shareStatsMap = new Map<string, { totalShares: number; totalVisits: number }>()
  for (const stat of shareStats) {
    const existing = shareStatsMap.get(stat.userId) || { totalShares: 0, totalVisits: 0 }
    if (stat.shareToken) {
      existing.totalShares += 1
    }
    existing.totalVisits += stat._count.shareVisits
    shareStatsMap.set(stat.userId, existing)
  }

  return shareStatsMap
}

/**
 * Batch-load subscriptions for the given users, keyed by user id.
 *
 * Mirrors the {@link fetchShareStatsMap} pattern: a single `findMany` with a
 * `userId in (...)` filter avoids per-user (N+1) queries. Each user has at most
 * one subscription (`Subscription.userId` is unique), so the map holds one row
 * per user. Users without a subscription are simply absent from the map.
 */
async function fetchSubscriptionMap(userIds: string[]): Promise<Map<string, {
  status: SubscriptionStatus
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  stripeCustomerId: string | null
}>> {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      userId: {
        in: userIds,
      },
    },
    select: {
      userId: true,
      status: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      stripeCustomerId: true,
    },
  })

  const subscriptionMap = new Map<string, {
    status: SubscriptionStatus
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
    stripeCustomerId: string | null
  }>()
  for (const subscription of subscriptions) {
    subscriptionMap.set(subscription.userId, {
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      stripeCustomerId: subscription.stripeCustomerId,
    })
  }

  return subscriptionMap
}


const timelineInput = z.object({
  userId: userIdSchema,
  cursor: z.string().max(512).optional(),
  pageSize: z.number().int().min(1).max(50).default(10),
})

const BAD_PAGE = "That timeline page is not valid"

/**
 * One keyset page of a member's activity timeline (admin only; GAP-38): see
 * `lib/admin/activity-timeline.ts` for the order and the cursor. A cursor
 * this module did not write is refused with `VALIDATION`.
 */
export async function getUserActivityTimeline(
  userId: string,
  options: { cursor?: string; pageSize?: number } = {}
): Promise<ActionResult<UserActivityTimelineData>> {
  await requireAdmin()

  const input = timelineInput.safeParse({ userId, ...options })
  if (!input.success) return fail("VALIDATION", BAD_PAGE)
  const { cursor: rawCursor, pageSize } = input.data
  const cursor = rawCursor === undefined ? null : decodeActivityCursor(rawCursor)
  if (rawCursor !== undefined && !cursor) return fail("VALIDATION", BAD_PAGE)

  try {
    return ok(await loadActivityTimeline(input.data.userId, { cursor, pageSize }))
  } catch (error) {
    logger.error("Error fetching user activity timeline", error, { userId })
    return fail("INTERNAL", "Could not load the activity")
  }
}
