/**
 * The member Invites page's one read. It uses stored values only (the watch
 * hours snapshot), so the page never waits on Tautulli or Plex.
 *
 * @module lib/member/invites
 */

import "server-only"

import { freePlaces, nextPlaceBack, serverCapReached } from "@/lib/affiliates/allowance"
import { inviterDisplayName } from "@/lib/affiliates/copy"
import { PAID_STATUSES } from "@/lib/affiliates/eligibility"
import { readHeldInvites } from "@/lib/affiliates/member-invites"
import { affiliateStanding, type Standing } from "@/lib/affiliates/standing"
import { affiliateAllowance, affiliateTiersFromConfig } from "@/lib/affiliates/tiers"
import { prisma } from "@/lib/prisma"

const JOINED_SHOWN = 100

export interface OpenInvite {
  id: string
  code: string
  label: string | null
  expiresAt: Date
}

export interface JoinedInvite {
  id: string
  joinedAt: Date
  /** Null for a removed invitee, and for a member without a name. */
  name: string | null
  status: "active" | "left" | "removed"
}

export interface AffiliatePanel {
  allowance: number
  free: number
  /** When the next held place comes back; null when none is held. */
  nextBackAt: Date | null
  /** Set when the server cap stops new invites, with when a place comes back. */
  capReached: { backAt: Date | null } | null
  open: OpenInvite[]
  joined: JoinedInvite[]
}

export interface InvitesPageData {
  /** The name the invite page shows for this member, or null. */
  inviterName: string | null
  standing: Standing
  /** For an approved (or paused) affiliate only. */
  affiliate: AffiliatePanel | null
}

/** Everything the Invites page shows for `userId` at `now`. */
export async function getInvitesPageData(userId: string, now = new Date()): Promise<InvitesPageData> {
  const [user, config, open, lastRefusal] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, watchHours: true, subscription: { select: { status: true } } } }),
    prisma.config.findUnique({ where: { id: "config" }, select: { affiliateTiers: true, affiliateServerCap: true } }),
    prisma.affiliateApplication.findUnique({ where: { openUserId: userId }, select: { status: true, appliedAt: true, inviteOverride: true } }),
    prisma.affiliateApplication.findFirst({
      where: { userId, status: { in: ["REFUSED", "REVOKED"] } },
      orderBy: { updatedAt: "desc" },
      select: { status: true, reason: true, decidedAt: true, endedAt: true },
    }),
  ])
  const tiers = affiliateTiersFromConfig(config?.affiliateTiers)
  const hours = user?.watchHours ?? null
  const refusalAt = lastRefusal?.status === "REVOKED" ? lastRefusal.endedAt : lastRefusal?.decidedAt
  const standing = affiliateStanding(
    {
      open,
      lastRefusal: lastRefusal && refusalAt ? { status: lastRefusal.status as "REFUSED" | "REVOKED", reason: lastRefusal.reason, at: refusalAt } : null,
      paid: (PAID_STATUSES as readonly string[]).includes(user?.subscription?.status ?? ""),
      hours,
      barHours: tiers[0]!.overHours,
    },
    now
  )

  const affiliate =
    open?.status === "APPROVED"
      ? await affiliatePanel(userId, affiliateAllowance(hours ?? 0, open.inviteOverride, tiers).invites, config?.affiliateServerCap ?? null, now)
      : null
  return { inviterName: inviterDisplayName(user?.name), standing, affiliate }
}

async function affiliatePanel(userId: string, allowance: number, cap: number | null, now: Date): Promise<AffiliatePanel> {
  const [held, serverHeld, open, joined] = await Promise.all([
    readHeldInvites(prisma, now, userId),
    cap === null ? null : readHeldInvites(prisma, now),
    prisma.invite.findMany({
      where: { kind: "AFFILIATE", affiliateUserId: userId, joinedAt: null, cancelledAt: null, expiresAt: { gt: now } },
      orderBy: { expiresAt: "asc" },
      select: { id: true, code: true, label: true, expiresAt: true },
    }),
    prisma.invite.findMany({
      where: { kind: "AFFILIATE", affiliateUserId: userId, joinedAt: { not: null } },
      orderBy: { joinedAt: "desc" },
      take: JOINED_SHOWN,
      select: { id: true, joinedAt: true, joinedUser: { select: { name: true, disabledAt: true, accessEndedAt: true } } },
    }),
  ])

  return {
    allowance,
    free: freePlaces(allowance, held.length),
    nextBackAt: nextPlaceBack(held),
    capReached: serverHeld && serverCapReached(cap, serverHeld.length) ? { backAt: nextPlaceBack(serverHeld) } : null,
    open: open.map((invite) => ({ ...invite, expiresAt: invite.expiresAt ?? now })),
    joined: joined.map(({ id, joinedAt, joinedUser }) => ({
      id,
      joinedAt: joinedAt ?? now,
      name: joinedUser?.name?.trim() || null,
      status: !joinedUser ? "removed" : joinedUser.disabledAt || joinedUser.accessEndedAt ? "left" : "active",
    })),
  }
}
