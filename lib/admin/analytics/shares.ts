/**
 * The share analytics page's reads (P10.2), for server code only. They
 * replace `actions/share-analytics.ts` and read the v3 tables (Rewind 6.2,
 * 7.10): `RewindShare` for the links and `RewindShareVisitDay` for the daily
 * visit counts, which hold no visitor data.
 *
 * v2 tokens still write a `WrappedShareVisit` row per view with only the
 * Rewind id (P0.11); they show only as a count until P11.18 removes them.
 * No share token or URL leaves this module.
 *
 * @module lib/admin/analytics/shares
 */

import "server-only"

import { publicUserSelect } from "@/lib/dto/user"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import type { DayRange } from "@/lib/ui/date-range"
import { dayWindow, sumByDay, windowSince, zeroFill, type DayWindow } from "@/lib/utils/day-window"

type ShareLinkStatus = "active" | "expired" | "stopped"

export interface ShareAnalytics {
  window: DayWindow
  /** Links that work right now: not stopped and not expired. */
  linksOn: number
  visitsInPeriod: number
  linksCreatedInPeriod: number
  /** Visits in the period per link that is on. */
  averageVisitsPerLink: number
  /** Views of v2 links in the period (`WrappedShareVisit`). */
  legacyVisitsInPeriod: number
  daily: Array<{ date: string; links: number; visits: number }>
}

/** One link in the table: who, which year and how it is doing, never its token. */
export interface ShareLinkRow {
  id: string
  userId: string
  memberName: string
  year: number
  pages: number
  createdAt: string
  expiresAt: string | null
  status: ShareLinkStatus
  /** Visits in the days kept (90). */
  visits: number
}

const dateOfKey = (key: string) => new Date(`${key}T00:00:00.000Z`)

/** Stopped beats expired: a stopped link is off whatever its expiry. @internal */
export function shareLinkStatus(link: { revokedAt: Date | null; expiresAt: Date | null }, now: Date): ShareLinkStatus {
  if (link.revokedAt) return "stopped"
  if (link.expiresAt && link.expiresAt <= now) return "expired"
  return "active"
}

const linkIsOn = (now: Date): Prisma.RewindShareWhereInput => ({
  revokedAt: null,
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
})

async function resolveWindow(range: DayRange | null, zone: string): Promise<DayWindow> {
  if (range) return dayWindow(range, zone)
  const first = await prisma.rewindShare.aggregate({ _min: { createdAt: true } })
  return windowSince(first._min.createdAt, zone)
}

/** The tiles and the daily chart for `range` (or since the first link) in `zone`. */
export async function getShareAnalytics(range: DayRange | null, zone: string, now = new Date()): Promise<ShareAnalytics> {
  const window = await resolveWindow(range, zone)
  const created = { createdAt: { gte: window.gte, lt: window.lt } }

  const [linksOn, links, visitDays, legacyVisitsInPeriod] = await Promise.all([
    prisma.rewindShare.count({ where: linkIsOn(now) }),
    prisma.rewindShare.findMany({ where: created, select: { createdAt: true } }),
    // Visit days are recorded in the server zone, so they are already the window's keys.
    prisma.rewindShareVisitDay.groupBy({
      by: ["day"],
      where: { day: { gte: dateOfKey(window.from), lte: dateOfKey(window.to) } },
      _sum: { count: true },
    }),
    prisma.wrappedShareVisit.count({ where: created }),
  ])

  const createdPerDay = sumByDay(links, zone, (link) => link.createdAt)
  const visitsPerDay = new Map(visitDays.map((row) => [row.day.toISOString().slice(0, 10), row._sum.count ?? 0]))
  const perDay = new Map(window.keys.map((key) => [key, { links: createdPerDay.get(key) ?? 0, visits: visitsPerDay.get(key) ?? 0 }]))
  const visitsInPeriod = [...visitsPerDay.values()].reduce((sum, count) => sum + count, 0)

  return {
    window,
    linksOn,
    visitsInPeriod,
    linksCreatedInPeriod: links.length,
    averageVisitsPerLink: linksOn > 0 ? visitsInPeriod / linksOn : 0,
    legacyVisitsInPeriod,
    daily: zeroFill(window.keys, perDay, { links: 0, visits: 0 }),
  }
}

export const SHARE_LINK_SORTS = ["created", "expires"] as const

/** One page of links, newest first by default. */
export async function listShareLinks(
  { page, pageSize, sort }: { page: number; pageSize: number; sort: { id: string; desc: boolean } },
  now = new Date(),
): Promise<{ rows: ShareLinkRow[]; total: number }> {
  const direction = sort.desc ? "desc" : "asc"
  const orderBy: Prisma.RewindShareOrderByWithRelationInput[] =
    sort.id === "expires" ? [{ expiresAt: { sort: direction, nulls: "last" } }, { id: "asc" }] : [{ createdAt: direction }, { id: "asc" }]

  const [links, total] = await Promise.all([
    prisma.rewindShare.findMany({
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        pages: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
        wrapped: { select: { year: true, userId: true, user: { select: publicUserSelect } } },
      },
    }),
    prisma.rewindShare.count(),
  ])

  const visits = links.length
    ? await prisma.rewindShareVisitDay.groupBy({
        by: ["shareId"],
        where: { shareId: { in: links.map((link) => link.id) } },
        _sum: { count: true },
      })
    : []
  const visitsOf = new Map(visits.map((row) => [row.shareId, row._sum.count ?? 0]))

  return {
    total,
    rows: links.map((link) => ({
      id: link.id,
      userId: link.wrapped.userId,
      memberName: link.wrapped.user.name || link.wrapped.user.email || "Unknown member",
      year: link.wrapped.year,
      pages: Array.isArray(link.pages) ? link.pages.length : 0,
      createdAt: link.createdAt.toISOString(),
      expiresAt: link.expiresAt?.toISOString() ?? null,
      status: shareLinkStatus(link, now),
      visits: visitsOf.get(link.id) ?? 0,
    })),
  }
}
