/**
 * The user detail page's header (P10.6): the member, their role, Plex access,
 * subscription and this season's Rewind state, plus what the shared row
 * actions menu needs. Status columns only, never `PlexWrapped.data`.
 *
 * @module lib/admin/user-detail
 */

import { parseRole, type RoleKey } from "@/lib/permissions"
import "server-only"

import { activeRunStarts } from "@/lib/admin/active-runs"
import { INVITED_BY_SELECT, invitedByOf, type InvitedBy, type UserActionTarget } from "@/lib/admin/user-actions"
import { checkUserServerAccess } from "@/lib/connections/plex"
import type { SubscriptionStatus } from "@/lib/generated/prisma/client"
import { memberServices, primaryService } from "@/lib/members/service"
import { prisma } from "@/lib/prisma"
import type { AuthService } from "@/types/onboarding"
import { getActiveService } from "@/lib/data/active-service"

type PlexAccess = "shared" | "notShared" | "unknown"

export interface UserDetailHeaderData {
  id: string
  /** The member's name, else their email. */
  name: string
  email: string | null
  plexUserId: string | null
  /** Every linked media server. */
  services: AuthService[]
  primaryService: AuthService
  isAdmin: boolean
  role: RoleKey | null
  /** The Plex account that set the server up. */
  isOwner: boolean
  disabledAt: Date | null
  createdAt: Date
  isExempt: boolean
  exemptNote: string | null
  /** Start of the member's newest play in Tautulli; null when none was ever read. */
  lastSeenAt: Date | null
  /** When the daily activity read last found the member in Tautulli; null when it never did. */
  lastSeenReadAt: Date | null
  /** The inactivity sweep never removes this member's Plex access. */
  inactivityExcluded: boolean
  plexAccess: PlexAccess
  subscription: {
    status: SubscriptionStatus
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
    stripeCustomerId: string | null
    /** What the last grant or revoke did on Plex (`accepted`, `pending`, `revoked`). */
    plexInviteStatus: string | null
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
  /** The affiliate whose invite they joined with. */
  invitedBy: InvitedBy
}

type ActivePlexServer = { url: string; token: string; adminPlexUserId: string | null; machineIdentifier: string | null } | null

async function plexAccessOf(plexUserId: string | null, server: ActivePlexServer): Promise<PlexAccess> {
  if (!plexUserId || !server) return "unknown"
  const result = await checkUserServerAccess(
    { url: server.url, token: server.token, adminPlexUserId: server.adminPlexUserId, machineIdentifier: server.machineIdentifier },
    plexUserId
  )
  if (result.status === "unknown") return "unknown"
  return result.status === "granted" ? "shared" : "notShared"
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
      role: true,
      disabledAt: true,
      createdAt: true,
      isExempt: true,
      exemptNote: true,
      lastSeenAt: true,
      lastSeenReadAt: true,
      inactivityExcluded: true,
      subscription: {
        select: {
          status: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          stripeCustomerId: true,
          plexInviteStatus: true,
        },
      },
      plexWrapped: { where: { year: seasonYear }, select: { status: true } },
      discordConnection: { select: { username: true, globalName: true, discordUserId: true, linkedAt: true, revokedAt: true } },
      affiliateJoin: INVITED_BY_SELECT,
    },
  })
  if (!user) return null

  const [server, config, runs] = await Promise.all([
    getActiveService("plex"),
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
    services: memberServices(user),
    primaryService: primaryService(user),
    isAdmin: user.isAdmin,
    role: parseRole(user.role),
    isOwner: Boolean(user.plexUserId && server?.adminPlexUserId === user.plexUserId),
    disabledAt: user.disabledAt,
    createdAt: user.createdAt,
    isExempt: user.isExempt,
    exemptNote: user.exemptNote,
    lastSeenAt: user.lastSeenAt,
    lastSeenReadAt: user.lastSeenReadAt,
    inactivityExcluded: user.inactivityExcluded,
    plexAccess,
    subscription: user.subscription,
    stripeEnabled: Boolean(config?.stripeEnabled),
    season: { year: seasonYear, status: user.plexWrapped[0]?.status ?? null, runStartedAt: runs.get(user.id) ?? null },
    discord: discord
      ? { displayName: discord.globalName || discord.username, discordUserId: discord.discordUserId, linkedAt: discord.linkedAt, revokedAt: discord.revokedAt }
      : null,
    invitedBy: invitedByOf(user.affiliateJoin),
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
    services: header.services,
    isAdmin: header.isAdmin,
    role: header.role,
    isOwner: header.isOwner,
    disabled: header.disabledAt !== null,
    plexAccess: header.plexAccess,
    wrappedStatus: header.season.status,
    wrappedRunStartedAt: header.season.runStartedAt,
    subscriptionStatus: header.subscription?.status ?? null,
    isExempt: header.isExempt,
    stripeCustomerId: header.subscription?.stripeCustomerId ?? null,
    invitedBy: header.invitedBy,
  }
}
