/**
 * `/admin/watchlist`'s reads: the global sync setting, the page's figures and
 * one page of every member's watchlist sync history, filtered and sorted from
 * the URL (`lib/admin/watchlist-filter.ts`). Server-only and admin-checked
 * (P11.5). The titles come from members' private Plex watchlists, so a read
 * is audited as a listing (P11.16).
 *
 * @module lib/data/watchlist
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { WATCHLIST_STATUS_OF, WATCHLIST_TYPE_OF, type WatchlistFilter } from "@/lib/admin/watchlist-filter"
import type { Prisma, WatchlistSyncStatus } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { auditMemberListed } from "@/lib/security/audit-log"
import type { TableSort } from "@/lib/ui/table-params"

const rowSelect = {
  id: true,
  title: true,
  year: true,
  mediaType: true,
  status: true,
  syncedAt: true,
  requestedAt: true,
  user: { select: { id: true, name: true, email: true } },
} as const satisfies Prisma.WatchlistSyncHistorySelect

/** One row of the table: a title on one member's watchlist, and what its request came to. */
export type WatchlistRow = Prisma.WatchlistSyncHistoryGetPayload<{ select: typeof rowSelect }>

/** The global switch and interval (`Config`); members can turn sync on only while it is on. */
export interface WatchlistGlobalSettings {
  enabled: boolean
  intervalMinutes: number
}

/** The figures above the table, over every row whatever the filters. */
export interface WatchlistStats {
  membersWithSyncOn: number
  /** Every history row, for "3 of 12 titles" and the first-use empty state. */
  titles: number
  requested: number
  notAllowed: number
  noMatch: number
}

export interface WatchlistPage {
  settings: WatchlistGlobalSettings
  stats: WatchlistStats
  /** This page's rows, filtered, sorted and paged. */
  rows: WatchlistRow[]
  /** Rows matching the filters, across every page. */
  total: number
}

function listWhere({ q, status, type }: WatchlistFilter): Prisma.WatchlistSyncHistoryWhereInput {
  const and: Prisma.WatchlistSyncHistoryWhereInput[] = []
  if (status !== "all") and.push({ status: WATCHLIST_STATUS_OF[status] })
  if (type !== "all") and.push({ mediaType: WATCHLIST_TYPE_OF[type] })
  if (q) {
    const contains = { contains: q, mode: "insensitive" } as const
    and.push({ OR: [{ title: contains }, { user: { name: contains } }, { user: { email: contains } }] })
  }
  return { AND: and }
}

/** The sort, then the id, so a page never reshuffles; members with no name sort by email, after the named. */
function listOrder(sort: TableSort): Prisma.WatchlistSyncHistoryOrderByWithRelationInput[] {
  const dir = sort.desc ? "desc" : "asc"
  const byId: Prisma.WatchlistSyncHistoryOrderByWithRelationInput = { id: "asc" }
  switch (sort.id) {
    case "title":
      return [{ title: dir }, byId]
    case "member":
      return [{ user: { name: { sort: dir, nulls: "last" } } }, { user: { email: { sort: dir, nulls: "last" } } }, byId]
    case "requested":
      return [{ requestedAt: { sort: dir, nulls: "last" } }, byId]
    default:
      return [{ syncedAt: dir }, byId]
  }
}

/**
 * The global setting, the figures and one page of rows for the filters (admin
 * only). A page past the end shows the last one.
 *
 * @throws the `PM_FORBIDDEN` or `PM_UNAUTHENTICATED` error from {@link assertAdmin}
 */
export async function getWatchlistPage({
  page,
  pageSize,
  sort,
  ...filter
}: WatchlistFilter & { page: number; pageSize: number; sort: TableSort }): Promise<WatchlistPage> {
  const session = await assertAdmin()
  await auditMemberListed("watchlist-history", session.user.id, filter)

  const where = listWhere(filter)
  const [config, membersWithSyncOn, byStatus, total] = await Promise.all([
    prisma.config.findUnique({
      where: { id: "config" },
      select: { watchlistSyncEnabled: true, watchlistSyncIntervalMinutes: true },
    }),
    prisma.watchlistSyncSettings.count({ where: { syncEnabled: true } }),
    prisma.watchlistSyncHistory.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.watchlistSyncHistory.count({ where }),
  ])
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const rows = await prisma.watchlistSyncHistory.findMany({
    where,
    orderBy: listOrder(sort),
    skip: (Math.min(page, lastPage) - 1) * pageSize,
    take: pageSize,
    select: rowSelect,
  })

  const count = (status: WatchlistSyncStatus) => byStatus.find((row) => row.status === status)?._count._all ?? 0
  return {
    settings: {
      enabled: config?.watchlistSyncEnabled ?? false,
      intervalMinutes: config?.watchlistSyncIntervalMinutes ?? 60,
    },
    stats: {
      membersWithSyncOn,
      titles: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      requested: count("REQUESTED"),
      notAllowed: count("NOT_PERMITTED"),
      noMatch: count("SKIPPED_NO_EXTERNAL_ID"),
    },
    rows,
    total,
  }
}
