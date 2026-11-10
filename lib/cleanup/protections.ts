/**
 * Member Keeps and admin exclusions (`CleanupProtection`, TS 2.2, E6, 13.2).
 * Server-only.
 *
 * A row is active while `activeKey` holds `keep:<itemKey>:<memberId>` (a Keep)
 * or `exclude:<itemKey>` (an exclusion). Ending a row sets `activeKey` to
 * null, so PostgreSQL's unique index allows one active row per key and any
 * number of ended ones. A Keep always has an end (`expiresAt`); an exclusion
 * has one when the admin set an end date. An active row past its end is
 * expired: it no longer protects, and {@link expireProtections} ends it.
 *
 * The writes run in the transaction of the caller (an action), which also
 * exits the items, checks for `deleting` rows (E33) and writes the audit
 * rows. A create ends the older row of the same key first. Two creates of
 * one key at the same time both find no row, and the second fails on the
 * unique index (`P2002`), which rolls its transaction back: the action reads
 * the winner's row after it.
 *
 * @module lib/cleanup/protections
 */

import "server-only"

import { type RestoreItem, restoreItemSchema } from "@/lib/cleanup/schema/runtime"
import type { CleanupItem, CleanupProtection, Prisma } from "@/lib/generated/prisma/client"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { addDays } from "@/lib/ui/date-range"
import { wallTimeToInstant } from "@/lib/utils/zoned-time"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

const DAY_MS = 86_400_000

export type ProtectionKind = "memberKeep" | "adminExclude"
/** Who ended a row: the member, an admin, or the end date. */
export type EndedBy = "self" | "admin" | "expired"

/** The active key of a member's Keep of an item. */
export const keepActiveKey = (itemKey: string, memberId: string) => `keep:${itemKey}:${memberId}`
/** The active key of the exclusion of an item. */
export const excludeActiveKey = (itemKey: string) => `exclude:${itemKey}`

/** The title facts a protection copies when it is made (from the item row, else the newest snapshot). */
export interface ProtectionTitle {
  itemKey: string
  level: Level
  titleKey: string
  title: string
  year: number | null
  seasonNumber: number | null
  sectionId: string | null
  ratingKey: string | null
  /** The title's ids; a season holds its show's ids. */
  externalIds: { tmdb?: number; tvdb?: number; imdb?: string } | null
}

const titleData = ({ externalIds, ...title }: ProtectionTitle) => ({ ...title, ...(externalIds ? { externalIds } : {}) })
const isExpired = (row: Pick<CleanupProtection, "expiresAt">, now: Date) => row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()
const ended = (endedBy: EndedBy, endedByUserId: string | null, now: Date) =>
  ({ status: "ended", endedAt: now, endedBy, endedByUserId, activeKey: null }) as const

/** Active rows that have not reached their end at `now`: the rows that protect. */
export function activeProtectionWhere(now: Date): Prisma.CleanupProtectionWhereInput {
  return { status: "active", activeKey: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }
}

/**
 * The protecting rows of the cascade of an item (TS 5.4): pass its item keys
 * with the keys that cascade to it, or its `cascadeWhere()`.
 */
export async function activeProtectionsFor(
  db: PrismaTransactionClient,
  match: readonly string[] | Prisma.CleanupProtectionWhereInput,
  now: Date
): Promise<CleanupProtection[]> {
  if (isKeyList(match) && match.length === 0) return []
  const where: Prisma.CleanupProtectionWhereInput = isKeyList(match) ? { itemKey: { in: [...match] } } : match
  return db.cleanupProtection.findMany({ where: { AND: [activeProtectionWhere(now), where] } })
}

// Array.isArray does not narrow a readonly array out of a union
const isKeyList = (match: readonly string[] | Prisma.CleanupProtectionWhereInput): match is readonly string[] => Array.isArray(match)

/** The instant `day` ends in `zone`: an exclusion that ends on `day` protects until then. */
export function dayEndsAt(day: string, zone: string): Date {
  return wallTimeToInstant(`${addDays(day, 1)}T00:00`, zone)
}

export type CreateKeepResult = { created: true; keep: CleanupProtection } | { created: false; keep: CleanupProtection }

/**
 * Creates the member's Keep of the title for `keepDays` days (13.2). An older
 * Keep of the same key that has expired ends first (`expired`). An active
 * Keep that has not expired is returned as it is (`created: false`).
 */
export async function createKeep(
  tx: PrismaTransactionClient,
  input: { title: ProtectionTitle; memberId: string; keepDays: number; restore: RestoreItem | null; now: Date }
): Promise<CreateKeepResult> {
  const { title, memberId, keepDays, restore, now } = input
  const activeKey = keepActiveKey(title.itemKey, memberId)
  const older = await tx.cleanupProtection.findUnique({ where: { activeKey } })
  if (older && !isExpired(older, now)) return { created: false, keep: older }
  if (older) await tx.cleanupProtection.update({ where: { id: older.id }, data: ended("expired", null, now) })
  const keep = await tx.cleanupProtection.create({
    data: {
      ...titleData(title),
      kind: "memberKeep",
      memberId,
      createdBy: memberId,
      expiresAt: new Date(now.getTime() + keepDays * DAY_MS),
      activeKey,
      ...(restore ? { restore } : {}),
    },
  })
  return { created: true, keep }
}

/**
 * Creates the admin exclusion of the title, until `expiresAt` (null: no end).
 * An older exclusion of the same key ends first: `admin`, or `expired` when
 * its end had passed.
 */
export async function createExclusion(
  tx: PrismaTransactionClient,
  input: { title: ProtectionTitle; createdBy: string; note: string | null; expiresAt: Date | null; now: Date }
): Promise<CleanupProtection> {
  const { title, createdBy, note, expiresAt, now } = input
  const activeKey = excludeActiveKey(title.itemKey)
  const older = await tx.cleanupProtection.findUnique({ where: { activeKey } })
  if (older) {
    const data = isExpired(older, now) ? ended("expired", null, now) : ended("admin", createdBy, now)
    await tx.cleanupProtection.update({ where: { id: older.id }, data })
  }
  return tx.cleanupProtection.create({ data: { ...titleData(title), kind: "adminExclude", memberId: null, createdBy, note, expiresAt, activeKey } })
}

/**
 * Ends an active Keep. With `memberId`, only that member's Keep. True when a
 * row ended; false when it was not an active Keep (or not the member's).
 */
export async function endKeep(
  db: PrismaTransactionClient,
  input: { keepId: string; endedBy: "self" | "admin"; endedByUserId: string; now: Date; memberId?: string }
): Promise<boolean> {
  const { keepId, endedBy, endedByUserId, now, memberId } = input
  const where = { id: keepId, kind: "memberKeep", status: "active", ...(memberId ? { memberId } : {}) }
  const { count } = await db.cleanupProtection.updateMany({ where, data: ended(endedBy, endedByUserId, now) })
  return count > 0
}

/** Ends an active exclusion (`admin`). True when a row ended. */
export async function endExclusion(
  db: PrismaTransactionClient,
  input: { exclusionId: string; endedByUserId: string; now: Date }
): Promise<boolean> {
  const where = { id: input.exclusionId, kind: "adminExclude", status: "active" }
  const { count } = await db.cleanupProtection.updateMany({ where, data: ended("admin", input.endedByUserId, input.now) })
  return count > 0
}

/** Moves the end of an active exclusion (null: no end; {@link dayEndsAt} for a day). True when a row changed. */
export async function setExclusionEnd(
  db: PrismaTransactionClient,
  input: { exclusionId: string; expiresAt: Date | null }
): Promise<boolean> {
  const where = { id: input.exclusionId, kind: "adminExclude", status: "active" }
  const { count } = await db.cleanupProtection.updateMany({ where, data: { expiresAt: input.expiresAt } })
  return count > 0
}

/**
 * Ends every active Keep and exclusion whose end has passed at `now`
 * (`endedBy: "expired"`, TS 8.3 step 11), with `endedAt` = its own
 * `expiresAt`, so the member page names the day the Keep really ended.
 * Prisma cannot copy a column in `data`, so each row gets its own write. A
 * row that another writer ended first counts nowhere. The counts of each kind.
 */
export async function expireProtections(now: Date, db: PrismaTransactionClient = prisma): Promise<{ keeps: number; exclusions: number }> {
  const kinds: ProtectionKind[] = ["memberKeep", "adminExclude"]
  const rows = await db.cleanupProtection.findMany({
    where: { kind: { in: kinds }, status: "active", expiresAt: { lte: now } },
    select: { id: true, kind: true, expiresAt: true },
  })
  const counts = { keeps: 0, exclusions: 0 }
  for (const row of rows) {
    const { count } = await db.cleanupProtection.updateMany({ where: { id: row.id, status: "active" }, data: ended("expired", null, row.expiresAt ?? now) })
    if (row.kind === "memberKeep") counts.keeps += count
    else counts.exclusions += count
  }
  return counts
}

/** The member's Keeps that protect at `now`: the count the Keep limit compares (13.2). */
export function countActiveKeeps(db: PrismaTransactionClient, memberId: string, now: Date): Promise<number> {
  return db.cleanupProtection.count({ where: { kind: "memberKeep", memberId, status: "active", expiresAt: { gt: now } } })
}

type RestoreSource = Pick<
  CleanupItem,
  "state" | "ruleIds" | "action" | "importListExclusion" | "needsApproval" | "enteredAt" | "leaveOn" | "firstLeaveOn" | "approvedAt" | "approvedBy"
>

/** The `restore` of a Keep: the state of the item row it takes out, for Undo. Null for a row not in Leaving soon. */
export function restoreOf(row: RestoreSource, now: Date): RestoreItem | null {
  const parsed = restoreItemSchema.safeParse({
    ruleIds: row.ruleIds,
    action: row.action,
    importListExclusion: row.importListExclusion,
    needsApproval: row.needsApproval,
    enteredAt: row.enteredAt?.toISOString(),
    leaveOn: row.leaveOn,
    firstLeaveOn: row.firstLeaveOn,
    state: row.state,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedBy: row.approvedBy,
    keptAt: now.toISOString(),
  })
  return parsed.success ? parsed.data : null
}
