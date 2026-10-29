/**
 * The admin Affiliates page's History tab: refused, revoked, ended and closed
 * applications with their reasons, and the block list. Admins only.
 *
 * @module lib/data/affiliate-history
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { displayName, member, type Member } from "@/lib/data/affiliates"
import type { AffiliateEndCause, AffiliateStatus } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"

export interface HistoryRow {
  id: string
  member: Member
  status: AffiliateStatus
  reason: string | null
  endCause: AffiliateEndCause | null
  /** When it was refused, or when it ended. */
  at: Date | null
}

export interface BlockRow {
  id: string
  createdAt: Date
  createdBy: string
  /** The first 8 hex characters of the hash; the list holds no Plex id. */
  hashPrefix: string
}

/** Refused, revoked, ended and closed applications, newest first, and the block list. Admins only. */
export async function getAffiliateHistory(): Promise<{ applications: HistoryRow[]; blocks: BlockRow[] }> {
  await assertAdmin()
  const [rows, blocks] = await Promise.all([
    prisma.affiliateApplication.findMany({
      where: { status: { in: ["REFUSED", "REVOKED", "ENDED", "CLOSED"] } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, status: true, reason: true, endCause: true, decidedAt: true, endedAt: true, user: { select: { id: true, name: true, email: true, accessEndedAt: true } } },
    }),
    prisma.affiliateBlock.findMany({ orderBy: { createdAt: "desc" } }),
  ])
  const admins = await prisma.user.findMany({ where: { id: { in: blocks.map((block) => block.createdBy) } }, select: { id: true, name: true, email: true } })
  const adminNames = new Map(admins.map((user) => [user.id, displayName(user)]))
  return {
    applications: rows.map((row) => ({
      id: row.id,
      member: member(row.user),
      status: row.status,
      reason: row.reason,
      endCause: row.endCause,
      at: row.status === "REFUSED" ? row.decidedAt : row.endedAt,
    })),
    blocks: blocks.map((block) => ({
      id: block.id,
      createdAt: block.createdAt,
      createdBy: adminNames.get(block.createdBy) ?? "A removed admin",
      hashPrefix: block.plexIdHash.slice(0, 8),
    })),
  }
}
