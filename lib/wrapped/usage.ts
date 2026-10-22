/**
 * LLM usage and cost statistics for the cost pages, from aggregate queries
 * (BP-28): one `groupBy` by provider, model and member, and a date series that
 * reads only `createdAt`, `cost` and `totalTokens`. No query selects a
 * prompt or response.
 *
 * @module lib/wrapped/usage
 */

import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"

interface Totals {
  requests: number
  tokens: number
  cost: number
}

export interface LLMUsageStats {
  totalRequests: number
  totalTokens: number
  totalCost: number
  averageCostPerRequest: number
  averageTokensPerRequest: number
  byProvider: Array<{ provider: string } & Totals>
  byModel: Array<{ model: string } & Totals>
  byUser: Array<{ userId: string; userName: string | null } & Totals>
  byDate: Array<{ date: string } & Totals>
}

function add(map: Map<string, Totals>, key: string, part: Totals) {
  const existing = map.get(key) ?? { requests: 0, tokens: 0, cost: 0 }
  existing.requests += part.requests
  existing.tokens += part.tokens
  existing.cost += part.cost
  map.set(key, existing)
}

const byCost = (a: Totals, b: Totals) => b.cost - a.cost

/** Usage statistics for the cost analysis and LLM usage pages. */
export async function getLLMUsageStats(startDate?: Date, endDate?: Date, userId?: string): Promise<LLMUsageStats> {
  const where: Prisma.LLMUsageWhereInput = {}
  if (startDate || endDate) where.createdAt = { ...(startDate && { gte: startDate }), ...(endDate && { lt: endDate }) }
  if (userId) where.userId = userId

  const [groups, dated] = await Promise.all([
    prisma.lLMUsage.groupBy({
      by: ["provider", "model", "userId"],
      where,
      _sum: { totalTokens: true, cost: true },
      _count: { _all: true },
    }),
    prisma.lLMUsage.findMany({ where, select: { createdAt: true, cost: true, totalTokens: true } }),
  ])

  const providers = new Map<string, Totals>()
  const models = new Map<string, Totals>()
  const users = new Map<string, Totals>()
  for (const group of groups) {
    const part = { requests: group._count._all, tokens: group._sum.totalTokens ?? 0, cost: group._sum.cost ?? 0 }
    add(providers, group.provider, part)
    add(models, group.model || "unknown", part)
    add(users, group.userId, part)
  }

  const dates = new Map<string, Totals>()
  for (const row of dated) {
    add(dates, row.createdAt.toISOString().slice(0, 10), { requests: 1, tokens: row.totalTokens, cost: row.cost })
  }

  const names = users.size
    ? await prisma.user.findMany({ where: { id: { in: [...users.keys()] } }, select: { id: true, name: true, email: true } })
    : []
  const nameOf = new Map(names.map((user) => [user.id, user.name || user.email]))

  const totalRequests = groups.reduce((sum, group) => sum + group._count._all, 0)
  const totalTokens = groups.reduce((sum, group) => sum + (group._sum.totalTokens ?? 0), 0)
  const totalCost = groups.reduce((sum, group) => sum + (group._sum.cost ?? 0), 0)

  return {
    totalRequests,
    totalTokens,
    totalCost,
    averageCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0,
    averageTokensPerRequest: totalRequests > 0 ? totalTokens / totalRequests : 0,
    byProvider: [...providers].map(([provider, totals]) => ({ provider, ...totals })).sort(byCost),
    byModel: [...models].map(([model, totals]) => ({ model, ...totals })).sort(byCost),
    byUser: [...users]
      .map(([id, totals]) => ({ userId: id, userName: nameOf.get(id) ?? null, ...totals }))
      .sort(byCost),
    byDate: [...dates].map(([date, totals]) => ({ date, ...totals })).sort((a, b) => b.date.localeCompare(a.date)),
  }
}
