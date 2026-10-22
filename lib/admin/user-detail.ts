/**
 * The user detail page's header (P10.6): the member, their role, Plex access,
 * subscription and this season's Rewind state, plus what the shared row
 * actions menu needs. Status columns only, never `PlexWrapped.data`.
 *
 * @module lib/admin/user-detail
 */

import "server-only"

import { activeRunStarts } from "@/lib/admin/active-runs"
import type { UserActionTarget } from "@/lib/admin/user-actions"
import { checkUserServerAccess } from "@/lib/connections/plex"
import type { SubscriptionStatus } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"

type PlexAccess = "shared" | "notShared" | "unknown"

export interface UserDetailHeaderData {
  id: string
  /** The member's name, else their email. */
  name: string
  email: string | null
  plexUserId: string | null
  primaryAuthService: string | null
  isAdmin: boolean
  /** The Plex account that set the server up. */
  isOwner: boolean
  disabledAt: Date | null
  createdAt: Date
  isExempt: boolean
  exemptReason: string | null
  plexAccess: PlexAccess
  subscription: {
    status: SubscriptionStatus
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
    stripeCustomerId: string | null
  } | null
  stripeEnabled: boolean
  season: {
    year: number
    /** `PlexWrapped.status`, or null when the year has no row. */
    status: string | null
    /** When an active run started; set means the year is generating. */
    runStartedAt: Date | null
  }
  discord: {
    displayName: string
    discordUserId: string
    linkedAt: Date
    revokedAt: Date | null
  } | null
}

type ActivePlexServer = { url: string; token: string; adminPlexUserId: string | null } | null

async function plexAccessOf(plexUserId: string | null, server: ActivePlexServer): Promise<PlexAccess> {
  if (!plexUserId || !server) return "unknown"
  const result = await checkUserServerAccess(
    { url: server.url, token: server.token, adminPlexUserId: server.adminPlexUserId },
    plexUserId
  )
  if (!result.success) return "unknown"
  return result.hasAccess ? "shared" : "notShared"
}

/** The header, or null when there is no such user. */
export async function getUserDetailHeader(userId: string, seasonYear: number): Promise<UserDetailHeaderData | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      plexUserId: true,
      primaryAuthService: true,
      isAdmin: true,
      disabledAt: true,
      createdAt: true,
      isExempt: true,
      exemptReason: true,
      subscription: { select: { status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, stripeCustomerId: true } },
      plexWrapped: { where: { year: seasonYear }, select: { status: true } },
      discordConnection: { select: { username: true, globalName: true, discordUserId: true, linkedAt: true, revokedAt: true } },
    },
  })
  if (!user) return null

  const [server, config, runs] = await Promise.all([
    prisma.plexServer.findFirst({ where: { isActive: true }, select: { url: true, token: true, adminPlexUserId: true } }),
    prisma.config.findUnique({ where: { id: "config" }, select: { stripeEnabled: true } }),
    activeRunStarts([user.id], seasonYear),
  ])
  const plexAccess = await plexAccessOf(user.plexUserId, server)
  const discord = user.discordConnection

  return {
    id: user.id,
    name: user.name ?? user.email ?? "Unknown member",
    email: user.email,
    plexUserId: user.plexUserId,
    primaryAuthService: user.primaryAuthService,
    isAdmin: user.isAdmin,
    isOwner: Boolean(user.plexUserId && server?.adminPlexUserId === user.plexUserId),
    disabledAt: user.disabledAt,
    createdAt: user.createdAt,
    isExempt: user.isExempt,
    exemptReason: user.exemptReason,
    plexAccess,
    subscription: user.subscription,
    stripeEnabled: Boolean(config?.stripeEnabled),
    season: { year: seasonYear, status: user.plexWrapped[0]?.status ?? null, runStartedAt: runs.get(user.id) ?? null },
    discord: discord
      ? { displayName: discord.globalName || discord.username, discordUserId: discord.discordUserId, linkedAt: discord.linkedAt, revokedAt: discord.revokedAt }
      : null,
  }
}

/** Billing shows when Stripe is on or the member has a subscription row. */
export function billingVisible(header: Pick<UserDetailHeaderData, "stripeEnabled" | "subscription">): boolean {
  return header.stripeEnabled || header.subscription !== null
}

/** The member as the shared action menu and dialogs see them (P10.18). */
export function detailUserTarget(header: UserDetailHeaderData): UserActionTarget {
  return {
    id: header.id,
    name: header.name,
    plexUserId: header.plexUserId,
    isAdmin: header.isAdmin,
    isOwner: header.isOwner,
    disabled: header.disabledAt !== null,
    plexAccess: header.plexAccess,
    wrappedStatus: header.season.status,
    wrappedRunStartedAt: header.season.runStartedAt,
    subscriptionStatus: header.subscription?.status ?? null,
    isExempt: header.isExempt,
    stripeCustomerId: header.subscription?.stripeCustomerId ?? null,
  }
}
