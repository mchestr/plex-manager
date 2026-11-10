/**
 * The member's own Keeps (TS 13.2, 13.3 steps 6 and 7, UX 9.2.2 and 9.4).
 * Server-only. It works with the feature off too: Keeps stay, and Account
 * lists them (E30).
 *
 * | Keep | Listed | `endedBy` |
 * |---|---|---|
 * | active, before its end | yes | none |
 * | ended by the member or an admin in the last 30 days | yes | `self` or `admin` |
 * | active past its end, or ended as expired | no | |
 * | ended more than 30 days ago | no | |
 *
 * Active rows come first, the newest Keep first, then ended rows, the newest
 * end first. `used` counts the active rows, as the Keep limit does. No row
 * holds a size, an admin note or the admin who ended it.
 *
 * @module lib/cleanup/member/keeps
 */

import "server-only"

import { activeProtectionWhere } from "@/lib/cleanup/protections"
import type { MyKeepRow } from "@/lib/cleanup/types/member"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"

import { isLevel } from "./groups"

/**
 * An ended Keep shows for this many days (UX 9.2.2).
 *
 * @internal Exported for the tests.
 */
export const ENDED_KEEP_DAYS = 30

const DAY_MS = 86_400_000

const KEEP_SELECT = {
  id: true, itemKey: true, level: true, title: true, year: true, seasonNumber: true, sectionId: true, ratingKey: true,
  expiresAt: true, createdAt: true, status: true, endedAt: true, endedBy: true,
} satisfies Prisma.CleanupProtectionSelect

type KeepRecord = Prisma.CleanupProtectionGetPayload<{ select: typeof KEEP_SELECT }>

export interface MemberKeeps {
  rows: MyKeepRow[]
  /** Active Keeps before their end: the Keep limit counts these. */
  used: number
  /** The item keys of the active Keeps. */
  activeKeys: ReadonlySet<string>
}

const endedByOf = (value: string | null): "self" | "admin" | null => (value === "self" || value === "admin" ? value : null)

/** A listed Keep. An ended one needs who ended it and when; a Keep with no end date is not valid and never protects. */
function toRow(record: KeepRecord, active: boolean): MyKeepRow | null {
  if (!record.expiresAt || !isLevel(record.level)) return null
  const row: MyKeepRow = {
    id: record.id,
    item: {
      itemKey: record.itemKey, level: record.level, title: record.title, year: record.year, seasonNumber: record.seasonNumber,
      episodeCount: null, seasonCount: null, posterKey: record.ratingKey, sectionId: record.sectionId ?? "", sizeBytes: null,
    },
    until: record.expiresAt.toISOString(),
    keptAt: record.createdAt.toISOString(),
  }
  if (active) return row
  const endedBy = endedByOf(record.endedBy)
  return endedBy && record.endedAt ? { ...row, endedAt: record.endedAt.toISOString(), endedBy } : null
}

/** The member's Keeps to list, their active count and their active item keys. */
export async function readMemberKeeps(memberId: string, now: Date): Promise<MemberKeeps> {
  const endedSince = new Date(now.getTime() - ENDED_KEEP_DAYS * DAY_MS)
  const records = await prisma.cleanupProtection.findMany({
    where: {
      kind: "memberKeep",
      memberId,
      OR: [activeProtectionWhere(now), { status: "ended", endedBy: { in: ["self", "admin"] }, endedAt: { gte: endedSince } }],
    },
    select: KEEP_SELECT,
    // Active rows have no end time, so they come first
    orderBy: [{ endedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }, { id: "asc" }],
  })
  const isActive = (record: KeepRecord) => record.status === "active" && record.expiresAt !== null && record.expiresAt > now
  const rows = records.flatMap((record) => toRow(record, isActive(record)) ?? [])
  const active = rows.filter((row) => row.endedAt === undefined)
  return { rows, used: active.length, activeKeys: new Set(active.map((row) => row.item.itemKey)) }
}
