/**
 * The member rows the inactivity rules read ({@link InactivityMember}), for
 * the sweep: every member with a Plex account, and one member read again
 * just before their removal.
 *
 * @module lib/inactivity/members
 */

import "server-only"

import type { Prisma } from "@/lib/generated/prisma/client"
import { withReturn, type InactivityMember } from "@/lib/inactivity/rules"
import { prisma } from "@/lib/prisma"

const MEMBER_SELECT = {
  id: true,
  plexUserId: true,
  isAdmin: true,
  role: true,
  isExempt: true,
  inactivityExcluded: true,
  createdAt: true,
  lastSeenAt: true,
  lastSeenReadAt: true,
  accessEndedAt: true,
  accessRestoredAt: true,
  subscription: { select: { status: true } },
} as const satisfies Prisma.UserSelect

type MemberRow = Prisma.UserGetPayload<{ select: typeof MEMBER_SELECT }>

function toMember({ subscription, ...member }: MemberRow): InactivityMember {
  return { ...member, subscriptionStatus: subscription?.status ?? null }
}

/** Every member with a Plex account. */
export async function listInactivityMembers(): Promise<InactivityMember[]> {
  const rows = await prisma.user.findMany({ where: { plexUserId: { not: null } }, select: MEMBER_SELECT })
  return rows.map(toMember)
}

/** One member as stored now; null when the row is gone. */
export async function readInactivityMember(id: string): Promise<InactivityMember | null> {
  const row = await prisma.user.findUnique({ where: { id }, select: MEMBER_SELECT })
  return row && toMember(row)
}

/**
 * Stamps `accessRestoredAt = now` on each member who holds a share while
 * their access is recorded as ended (a re-share made in Plex itself, say),
 * and returns every member as stored after that. See `withReturn`.
 */
export async function recordReturns(
  members: InactivityMember[],
  hasShare: (member: InactivityMember) => boolean,
  now: Date
): Promise<InactivityMember[]> {
  const seen = members.map((member) => withReturn(member, hasShare(member), now))
  const returned = seen.filter((member, i) => member !== members[i]).map((member) => member.id)
  if (returned.length > 0) await prisma.user.updateMany({ where: { id: { in: returned } }, data: { accessRestoredAt: now } })
  return seen
}
