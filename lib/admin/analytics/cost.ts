/**
 * The cost analysis page's reads (P10.2), for server code only.
 *
 * Totals by provider, model and member come from one `groupBy` (BP-28). The
 * daily series selects only `createdAt` and `cost` and buckets each row with
 * `dayKey` in the server zone: Prisma can't truncate a date in a zone, and
 * the app writes no raw SQL. Every day of the window is present, so a quiet
 * day is a zero bar and today is always the last one.
 *
 * ## Projection
 *
 * The 30-day projection is the period's cost over its calendar days, times
 * 30. Dividing by active days only overstated it: $0.0874 spent on 4 days of
 * a 30-day window is about $0.09 a month, not $0.66.
 *
 * @module lib/admin/analytics/cost
 */

import "server-only"

import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import type { DayRange } from "@/lib/ui/date-range"
import { dayWindow, sumByDay, windowSince, zeroFill, type DayWindow } from "@/lib/utils/day-window"

interface Totals {
  requests: number
  tokens: number
  cost: number
}

export interface CostAnalysis {
  window: DayWindow
  totals: Totals
  /** USD per million tokens; 0 with no tokens. */
  costPerMillionTokens: number
  projected30Days: number
  daily: Array<{ date: string; cost: number; requests: number }>
  byProvider: Array<{ provider: string } & Totals>
  byModel: Array<{ model: string } & Totals>
  byUser: Array<{ userId: string; name: string } & Totals>
}

/** The period's cost at its daily average over calendar days, for 30 days. @internal */
export function projectThirtyDays(cost: number, calendarDays: number): number {
  return calendarDays > 0 ? (cost / calendarDays) * 30 : 0
}

function add(map: Map<string, Totals>, key: string, part: Totals) {
  const existing = map.get(key) ?? { requests: 0, tokens: 0, cost: 0 }
  map.set(key, { requests: existing.requests + part.requests, tokens: existing.tokens + part.tokens, cost: existing.cost + part.cost })
}

const byCost = (a: Totals, b: Totals) => b.cost - a.cost

/** The window a page shows: the range in the URL, else from the first call through today. */
async function resolveWindow(range: DayRange | null, zone: string): Promise<DayWindow> {
  if (range) return dayWindow(range, zone)
  const first = await prisma.lLMUsage.aggregate({ _min: { createdAt: true } })
  return windowSince(first._min.createdAt, zone)
}

/** Everything the cost analysis page shows for `range` (or all time) in `zone`. */
export async function getCostAnalysis(range: DayRange | null, zone: string): Promise<CostAnalysis> {
  const window = await resolveWindow(range, zone)
  const where: Prisma.LLMUsageWhereInput = { createdAt: { gte: window.gte, lt: window.lt } }

  const [groups, dated] = await Promise.all([
    prisma.lLMUsage.groupBy({
      by: ["provider", "model", "userId"],
      where,
      _sum: { totalTokens: true, cost: true },
      _count: { _all: true },
    }),
    prisma.lLMUsage.findMany({ where, select: { createdAt: true, cost: true } }),
  ])

  const providers = new Map<string, Totals>()
  const models = new Map<string, Totals>()
  const users = new Map<string, Totals>()
  const totals: Totals = { requests: 0, tokens: 0, cost: 0 }
  for (const group of groups) {
    const part = { requests: group._count._all, tokens: group._sum.totalTokens ?? 0, cost: group._sum.cost ?? 0 }
    add(providers, group.provider, part)
    add(models, group.model || "Unknown model", part)
    add(users, group.userId, part)
    totals.requests += part.requests
    totals.tokens += part.tokens
    totals.cost += part.cost
  }

  const names = users.size
    ? await prisma.user.findMany({ where: { id: { in: [...users.keys()] } }, select: { id: true, name: true, email: true } })
    : []
  const nameOf = new Map(names.map((user) => [user.id, user.name || user.email || "Unknown member"]))

  const costs = sumByDay(dated, zone, (row) => row.createdAt, (row) => row.cost)
  const counts = sumByDay(dated, zone, (row) => row.createdAt)
  const perDay = new Map(window.keys.map((key) => [key, { cost: costs.get(key) ?? 0, requests: counts.get(key) ?? 0 }]))

  return {
    window,
    totals,
    costPerMillionTokens: totals.tokens > 0 ? (totals.cost / totals.tokens) * 1_000_000 : 0,
    projected30Days: projectThirtyDays(totals.cost, window.keys.length),
    daily: zeroFill(window.keys, perDay, { cost: 0, requests: 0 }),
    byProvider: [...providers].map(([provider, t]) => ({ provider, ...t })).sort(byCost),
    byModel: [...models].map(([model, t]) => ({ model, ...t })).sort(byCost),
    byUser: [...users].map(([userId, t]) => ({ userId, name: nameOf.get(userId) ?? "Unknown member", ...t })).sort(byCost),
  }
}
