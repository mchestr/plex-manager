/**
 * The audit log's reads: one page of the filtered log and one event, for
 * `audit:read` (admins and Support), and a member's latest events for their
 * admin page. Each read is itself audited (`AUDIT_LOG_VIEWED`, at most once an
 * hour per viewer, with ids only).
 *
 * A row names who acted and whom it was about, and carries the event's label,
 * category and summary (`lib/audit/summary.ts`). The stored details never
 * leave this module in a row: only an admin's read of one event returns
 * them, and Support's read of it says they are hidden.
 *
 * | Stored id              | Shown as                                            |
 * |------------------------|-----------------------------------------------------|
 * | `system`               | System (a job or a webhook)                         |
 * | `setup`                | Setup (the first-run wizard)                        |
 * | `unknown`              | Unknown (an assistant call with no user)            |
 * | a user's id            | their name, else their email, else "Unknown member" |
 * | an id with no user row | Removed user                                        |
 *
 * @module lib/data/audit-log
 */

import "server-only"

import { assertAdmin, assertPermission } from "@/lib/admin"
import { type AuditCategory, eventCategory, eventLabel } from "@/lib/audit/events"
import { type AuditFilters, auditFilterParams, auditWhere } from "@/lib/audit/filters"
import { auditSummary } from "@/lib/audit/summary"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { auditLogViewed } from "@/lib/security/audit-log"
import type { BoundFormat } from "@/lib/utils/format"
import { recordIdSchema } from "@/lib/validations/params"

export interface AuditParty {
  id: string
  kind: "user" | "system" | "setup" | "unknown" | "removed"
  name: string
}

/** One event in a list: never its stored details. */
export interface AuditRow {
  id: string
  /** The stored type, which may be one the enum no longer knows. */
  type: string
  label: string
  category: AuditCategory | null
  createdAt: Date
  actor: AuditParty
  /** Whom it was about (`targetUserId`), if anyone. */
  member: AuditParty | null
  summary: string | null
}

export interface AuditLogPage {
  rows: AuditRow[]
  /** Events matching the filters, across every page. */
  total: number
  /** The page shown: one past the end shows the last. */
  page: number
  /** Whom the `actor` and `member` filters name, for the scope chips. */
  scope: { actor: AuditParty | null; member: AuditParty | null }
}

export interface AuditEventView extends AuditRow {
  /** The stored details, for an admin only. */
  details: Prisma.JsonValue | null
  /** True for Support, whose read never carries the details. */
  detailsHidden: boolean
}

export interface MemberAuditRow extends AuditRow {
  /** Whether the member acted, or the event was about them. */
  role: "actor" | "subject"
}

const rowSelect = {
  id: true,
  type: true,
  actorUserId: true,
  targetUserId: true,
  createdAt: true,
  details: true,
} as const satisfies Prisma.AuditLogSelect

type StoredRow = Prisma.AuditLogGetPayload<{ select: typeof rowSelect }>

/** Newest first, with the id as the tie-break so a page never reshuffles. */
const NEWEST_FIRST: Prisma.AuditLogOrderByWithRelationInput[] = [{ createdAt: "desc" }, { id: "desc" }]

const NON_USERS = new Map<string, Omit<AuditParty, "id">>([
  ["system", { kind: "system", name: "System" }],
  ["setup", { kind: "setup", name: "Setup" }],
  ["unknown", { kind: "unknown", name: "Unknown" }],
])

/** The names of every user among `ids`, in one query. */
async function namesOf(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const userIds = [...new Set(ids.filter((id): id is string => typeof id === "string" && id !== "" && !NON_USERS.has(id)))]
  if (userIds.length === 0) return new Map()
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
  return new Map(users.map((user) => [user.id, user.name || user.email || "Unknown member"]))
}

function party(id: string, names: Map<string, string>): AuditParty {
  const fixed = NON_USERS.get(id)
  if (fixed) return { id, ...fixed }
  const name = names.get(id)
  return name === undefined ? { id, kind: "removed", name: "Removed user" } : { id, kind: "user", name }
}

function toRow(row: StoredRow, names: Map<string, string>, f: BoundFormat): AuditRow {
  return {
    id: row.id,
    type: row.type,
    label: eventLabel(row.type),
    category: eventCategory(row.type),
    createdAt: row.createdAt,
    actor: party(row.actorUserId, names),
    member: row.targetUserId === null ? null : party(row.targetUserId, names),
    summary: auditSummary(row.type, row.details, f),
  }
}

const userIdsOf = (rows: StoredRow[]) => rows.flatMap((row) => [row.actorUserId, row.targetUserId])

/**
 * One page of the log for the filters, newest first (`audit:read`). A page
 * past the end shows the last one. `f` places the day range in the server
 * zone and formats the summaries.
 *
 * @throws the `PM_FORBIDDEN` or `PM_UNAUTHENTICATED` error from {@link assertPermission}
 */
export async function getAuditLogPage(
  filters: AuditFilters,
  { page, pageSize, f }: { page: number; pageSize: number; f: BoundFormat }
): Promise<AuditLogPage> {
  const session = await assertPermission("audit:read")
  const where = auditWhere(filters, f.settings.timeZone)
  const total = await prisma.auditLog.count({ where })
  const shown = Math.min(page, Math.max(1, Math.ceil(total / pageSize)))
  const stored = await prisma.auditLog.findMany({
    where,
    orderBy: NEWEST_FIRST,
    skip: (shown - 1) * pageSize,
    take: pageSize,
    select: rowSelect,
  })
  const names = await namesOf([...userIdsOf(stored), filters.actor, filters.member])
  await auditLogViewed(session.user.id, auditFilterParams(filters))

  return {
    rows: stored.map((row) => toRow(row, names, f)),
    total,
    page: shown,
    scope: {
      actor: filters.actor ? party(filters.actor, names) : null,
      member: filters.member ? party(filters.member, names) : null,
    },
  }
}

/**
 * One event (`audit:read`), or null for an unknown or malformed id. Its stored
 * details come back for an admin only.
 *
 * @throws the `PM_FORBIDDEN` or `PM_UNAUTHENTICATED` error from {@link assertPermission}
 */
export async function getAuditEvent(id: string, f: BoundFormat): Promise<AuditEventView | null> {
  const session = await assertPermission("audit:read")
  if (!recordIdSchema.safeParse(id).success) return null
  const row = await prisma.auditLog.findUnique({ where: { id }, select: rowSelect })
  if (!row) return null
  const names = await namesOf(userIdsOf([row]))
  await auditLogViewed(session.user.id, { event: row.id })

  const admin = session.user.isAdmin
  return { ...toRow(row, names, f), details: admin ? row.details : null, detailsHidden: !admin }
}

/**
 * The latest `limit` events by or about one member, and how many there are
 * (admins only: Support cannot open a member's page).
 *
 * @throws the `PM_FORBIDDEN` or `PM_UNAUTHENTICATED` error from {@link assertAdmin}
 */
export async function getMemberAuditEvents(
  userId: string,
  { limit, f }: { limit: number; f: BoundFormat }
): Promise<{ rows: MemberAuditRow[]; total: number }> {
  const session = await assertAdmin()
  const where: Prisma.AuditLogWhereInput = { OR: [{ actorUserId: userId }, { targetUserId: userId }] }
  const [total, stored] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: NEWEST_FIRST, take: limit, select: rowSelect }),
  ])
  const names = await namesOf(userIdsOf(stored))
  await auditLogViewed(session.user.id, { member: userId })

  return {
    rows: stored.map((row) => ({ ...toRow(row, names, f), role: row.actorUserId === userId ? "actor" : "subject" })),
    total,
  }
}
