/**
 * The admin users list's reads (P11.5, BP-06): server-only, and admin-checked
 * next to the data rather than by the layout.
 *
 * @module lib/data/admin-users
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { activeRunStarts } from "@/lib/admin/active-runs"
import { getPlexServerIdentity, getPlexUsers } from "@/lib/connections/plex"
import { activeShareFor, type PlexTvUser } from "@/lib/connections/plex-tv-users"
import type { SubscriptionStatus } from "@/lib/generated/prisma/client"
import { usageTotalsByUser, usageTotalsForWrapped } from "@/lib/llm/usage-totals"
import { memberServices, primaryService } from "@/lib/members/service"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import type { AdminUsersList, AdminUserWithWrappedStats, PlexAccessCheck } from "@/types/admin"

const logger = createLogger("ADMIN_USERS")

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
  await assertAdmin()

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
      jellyfinUserId: user.jellyfinUserId,
      services: memberServices(user),
      primaryService: primaryService(user),
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

    const plexUserMap = new Map<string, PlexTvUser>()
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
