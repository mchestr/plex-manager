/**
 * The admin invites reads (P10.1): the filtered, sorted, paged list and one
 * invite with its redemptions. Usages carry only `publicUserSelect`, so no
 * token reaches the page (P0.18, SEC-18).
 *
 * ## Status filters
 *
 * The three states are disjoint, in the order the badge reads them:
 * - `expired`: `expiresAt < now`;
 * - `usedUp`: not expired and `useCount >= maxUses`, a Prisma field
 *   reference, because a plain `where` can't compare two columns;
 * - `active`: neither. The sidebar's "3 active" badge counts the same rows.
 *
 * @module lib/admin/invites/queries
 */

import "server-only"

import { publicUserSelect } from "@/lib/dto/user"
import type { Prisma } from "@/lib/generated/prisma/client"
import { invitePassSelect } from "@/lib/invites/pass"
import { prisma } from "@/lib/prisma"
import type { TableSort } from "@/lib/ui/table-params"

import { inviteStatus, type InviteFilter, type InviteStatus } from "./filter"

/** One row of the invites table. */
export interface AdminInviteRow {
  id: string
  code: string
  serverType: "PLEX" | "JELLYFIN"
  useCount: number
  maxUses: number
  expiresAt: Date | null
  createdAt: Date
  status: InviteStatus
}

export interface AdminInviteList {
  rows: AdminInviteRow[]
  /** Rows matching the filters, across every page. */
  total: number
  /** Every invite, for "3 of 7 invites" and the first-use empty state. */
  all: number
}

const notExpired = (now: Date): Prisma.InviteWhereInput => ({ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] })

/** The `where` for one status filter; `all` adds nothing. */
export function inviteStatusWhere(status: InviteFilter["status"], now: Date): Prisma.InviteWhereInput {
  switch (status) {
    case "expired":
      return { expiresAt: { lt: now } }
    case "usedUp":
      return { AND: [notExpired(now), { useCount: { gte: prisma.invite.fields.maxUses } }] }
    case "active":
      return { AND: [notExpired(now), { useCount: { lt: prisma.invite.fields.maxUses } }] }
    case "all":
      return {}
  }
}

function listWhere({ status, server, q }: InviteFilter, now: Date): Prisma.InviteWhereInput {
  const and: Prisma.InviteWhereInput[] = [inviteStatusWhere(status, now)]
  if (server !== "all") and.push({ serverType: server === "jellyfin" ? "JELLYFIN" : "PLEX" })
  // Codes are stored upper case (SEC-56)
  if (q) and.push({ code: { contains: q.toUpperCase() } })
  return { AND: and }
}

/** The sort, then the id, so a page never reshuffles. */
function listOrder(sort: TableSort): Prisma.InviteOrderByWithRelationInput[] {
  const dir = sort.desc ? "desc" : "asc"
  const byId: Prisma.InviteOrderByWithRelationInput = { id: "asc" }
  switch (sort.id) {
    case "code":
      return [{ code: dir }, byId]
    case "expires":
      return [{ expiresAt: { sort: dir, nulls: "last" } }, byId]
    default:
      return [{ createdAt: dir }, byId]
  }
}

const rowSelect = {
  id: true,
  code: true,
  serverType: true,
  useCount: true,
  maxUses: true,
  expiresAt: true,
  createdAt: true,
} as const satisfies Prisma.InviteSelect

/** One page of invites for the filters, plus the counts the toolbar and empty state need. */
export async function listInvites({
  page,
  pageSize,
  sort,
  ...filter
}: InviteFilter & { page: number; pageSize: number; sort: TableSort }): Promise<AdminInviteList> {
  const now = new Date()
  const where = listWhere(filter, now)
  const [total, all] = await Promise.all([prisma.invite.count({ where }), prisma.invite.count()])
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const rows = await prisma.invite.findMany({
    where,
    orderBy: listOrder(sort),
    skip: (Math.min(page, lastPage) - 1) * pageSize,
    take: pageSize,
    select: rowSelect,
  })
  return { rows: rows.map((row) => ({ ...row, status: inviteStatus(row, now) })), total, all }
}

const detailSelect = {
  ...rowSelect,
  ...invitePassSelect,
  allowDownloads: true,
  usages: { select: { id: true, usedAt: true, user: { select: publicUserSelect } }, orderBy: { usedAt: "desc" } },
} as const satisfies Prisma.InviteSelect

export type AdminInviteDetail = Prisma.InviteGetPayload<{ select: typeof detailSelect }> & { status: InviteStatus }

/** One invite with its redemptions, newest first; null when there is no such invite. */
export async function getInviteDetail(id: string): Promise<AdminInviteDetail | null> {
  const invite = await prisma.invite.findUnique({ where: { id }, select: detailSelect })
  return invite && { ...invite, status: inviteStatus(invite, new Date()) }
}
