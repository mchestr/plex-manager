/**
 * The admin Affiliates page's loaders. Applications, Affiliates and the Invite
 * tree need `affiliates:read` (admins and Support); the open invites' labels
 * and the History tab (`lib/data/affiliate-history.ts`) are for admins only. Watch hours
 * are the stored snapshot, never a live Tautulli read.
 *
 * @module lib/data/affiliates
 */

import "server-only"

import { assertPermission } from "@/lib/admin"
import {
  affiliateState,
  buildInviteTree,
  countInvites,
  openInvites,
  type AffiliateState,
  type InviteCounts,
  type OpenInvite,
  type TreeNode,
} from "@/lib/admin/affiliates/rows"
import { PAID_STATUSES } from "@/lib/affiliates/eligibility"
import { affiliateFlags, type AffiliateFlag } from "@/lib/affiliates/flags"
import { affiliateAllowance, affiliateTiersFromConfig, type Allowance } from "@/lib/affiliates/tiers"
import { prisma } from "@/lib/prisma"
import { auditMemberListed } from "@/lib/security/audit-log"

const memberSelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
  watchHours: true,
  watchHoursLast30Days: true,
  watchHoursReadAt: true,
  accessEndedAt: true,
  subscription: { select: { status: true } },
  affiliateJoin: { select: { id: true } },
} as const

export interface Member {
  id: string
  name: string
  /** Set once their access ended: "No longer a member". */
  accessEndedAt: Date | null
}

export const displayName = (user: { name: string | null; email: string | null }) => user.name || user.email || "Unknown member"

export function member(user: { id: string; name: string | null; email: string | null; accessEndedAt: Date | null }): Member {
  return { id: user.id, name: displayName(user), accessEndedAt: user.accessEndedAt }
}

export interface ApplicationRow {
  id: string
  member: Member
  watchHours: number | null
  watchHoursReadAt: Date | null
  memberSince: Date
  appliedAt: Date
  note: string | null
  flags: AffiliateFlag[]
}

/** Pending applications, oldest first. */
export async function listAffiliateApplications(): Promise<ApplicationRow[]> {
  const session = await assertPermission("affiliates:read")
  // The rows carry members' notes
  await auditMemberListed("affiliates", session.user.id)
  const now = new Date()
  const rows = await prisma.affiliateApplication.findMany({
    where: { status: "PENDING" },
    orderBy: { appliedAt: "asc" },
    select: { id: true, appliedAt: true, note: true, plexEmailShared: true, tierRaisedAt: true, user: { select: memberSelect } },
  })
  return rows.map((row) => ({
    id: row.id,
    member: member(row.user),
    watchHours: row.user.watchHours,
    watchHoursReadAt: row.user.watchHoursReadAt,
    memberSince: row.user.createdAt,
    appliedAt: row.appliedAt,
    note: row.note,
    flags: affiliateFlags({ ...factsOf(row.user), plexEmailShared: row.plexEmailShared, tierRaisedAt: row.tierRaisedAt }, now),
  }))
}

function factsOf(user: { createdAt: Date; affiliateJoin: { id: string } | null; watchHours: number | null; watchHoursLast30Days: number | null }) {
  return { memberSince: user.createdAt, invited: user.affiliateJoin !== null, watchHours: user.watchHours, watchHoursLast30Days: user.watchHoursLast30Days }
}

export interface AffiliateRow extends InviteCounts {
  id: string
  member: Member
  allowance: Allowance
  state: AffiliateState
  flags: AffiliateFlag[]
  inviteOverride: number | null
  /** Admins only; null for Support. */
  openInvites: OpenInvite[] | null
}

/**
 * The open invites of the given affiliates, by affiliate. Only an admin's read
 * calls it, so a Support read never loads a code or a label.
 */
async function openInvitesByAffiliate(userIds: string[], now: Date): Promise<Map<string, OpenInvite[]>> {
  const rows = await prisma.invite.findMany({
    where: { kind: "AFFILIATE", affiliateUserId: { in: userIds }, joinedAt: null, cancelledAt: null, expiresAt: { gt: now } },
    select: { id: true, code: true, label: true, expiresAt: true, cancelledAt: true, joinedAt: true, affiliateUserId: true },
  })
  const byAffiliate = new Map<string, typeof rows>(userIds.map((userId) => [userId, []]))
  for (const row of rows) if (row.affiliateUserId) byAffiliate.get(row.affiliateUserId)?.push(row)
  return new Map([...byAffiliate].map(([userId, invites]) => [userId, openInvites(invites, now)]))
}

/** Approved affiliates, by name. */
export async function listAffiliates(): Promise<AffiliateRow[]> {
  const session = await assertPermission("affiliates:read")
  const admin = session.user.isAdmin
  const now = new Date()
  const [rows, config] = await Promise.all([
    prisma.affiliateApplication.findMany({
      where: { status: "APPROVED" },
      select: {
        id: true,
        plexEmailShared: true,
        tierRaisedAt: true,
        inviteOverride: true,
        user: {
          select: {
            ...memberSelect,
            affiliateInvites: {
              where: { kind: "AFFILIATE" },
              select: { expiresAt: true, cancelledAt: true, joinedAt: true },
            },
          },
        },
      },
    }),
    prisma.config.findUnique({ where: { id: "config" }, select: { affiliateTiers: true } }),
  ])
  const tiers = affiliateTiersFromConfig(config?.affiliateTiers)
  const open = admin ? await openInvitesByAffiliate(rows.map((row) => row.user.id), now) : null

  return rows
    .map((row): AffiliateRow => {
      const { user } = row
      const allowance = affiliateAllowance(user.watchHours ?? 0, row.inviteOverride, tiers)
      const paid = (PAID_STATUSES as readonly string[]).includes(user.subscription?.status ?? "")
      return {
        id: row.id,
        member: member(user),
        allowance,
        state: affiliateState(paid, allowance),
        flags: affiliateFlags({ ...factsOf(user), plexEmailShared: row.plexEmailShared, tierRaisedAt: row.tierRaisedAt }, now),
        inviteOverride: row.inviteOverride,
        ...countInvites(user.affiliateInvites, now),
        openInvites: open?.get(user.id) ?? null,
      }
    })
    .sort((a, b) => a.member.name.localeCompare(b.member.name))
}

/** Every member who invited someone through an affiliate invite, with the people they invited. */
export async function getInviteTree(): Promise<TreeNode[]> {
  await assertPermission("affiliates:read")
  const joins = await prisma.invite.findMany({
    where: { kind: "AFFILIATE", joinedAt: { not: null } },
    select: { affiliateUserId: true, joinedUserId: true, joinedAt: true },
  })
  const ids = [...new Set(joins.flatMap((join) => [join.affiliateUserId, join.joinedUserId].filter((id): id is string => id !== null)))]
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })
  const names = new Map(users.map((user) => [user.id, displayName(user)]))
  return buildInviteTree(
    joins.map((join) => ({ affiliateUserId: join.affiliateUserId, joinedUserId: join.joinedUserId, joinedAt: join.joinedAt! })),
    names
  )
}
