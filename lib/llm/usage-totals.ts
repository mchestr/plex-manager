/**
 * LLM usage totals from aggregate queries (BP-28): one `aggregate()` or
 * `groupBy()` in Postgres instead of loading every `LLMUsage` row (and its
 * prompt and response text) to sum it in memory.
 *
 * - `getRewindSeasonSpend(year)`: the season's Rewind generation spend, read
 *   by P5.9's copy step (the budget cap) and the season dashboard.
 * - `usageTotalsByUser` and `usageTotalsForWrapped`: tokens, cost and call
 *   counts per member or per Rewind, with the latest provider and model.
 * - `latestModelByUser`: each member's most recent provider and model.
 *
 * None of them selects `prompt` or `response`.
 *
 * @module lib/llm/usage-totals
 */

import "server-only"

import { prisma } from "@/lib/prisma"

/** The summed usage of a group of calls, the shape `aggregateLlmUsage` returned. */
export interface UsageTotals {
  totalTokens: number
  promptTokens: number
  completionTokens: number
  cost: number
  provider: string | null
  model: string | null
  count: number
}

interface LatestModel {
  provider: string
  model: string | null
}

const SUMS = { totalTokens: true, promptTokens: true, completionTokens: true, cost: true } as const

/** The cost of this year's Rewind generations, in USD (one `aggregate()`). */
export async function getRewindSeasonSpend(year: number): Promise<number> {
  const spent = await prisma.lLMUsage.aggregate({ where: { generation: { year } }, _sum: { cost: true } })
  return spent._sum.cost ?? 0
}

/**
 * Each member's most recent provider and model, from one `distinct` query.
 *
 * @internal until P10.8's Overview reads it; `usageTotalsByUser` uses it today
 */
export async function latestModelByUser(userIds?: readonly string[]): Promise<Map<string, LatestModel>> {
  const rows = await prisma.lLMUsage.findMany({
    where: userIds ? { userId: { in: [...userIds] } } : undefined,
    distinct: ["userId"],
    orderBy: [{ userId: "asc" }, { createdAt: "desc" }],
    select: { userId: true, provider: true, model: true },
  })
  return new Map(rows.map((row) => [row.userId, { provider: row.provider, model: row.model }]))
}

type SumRow = {
  _sum: { totalTokens: number | null; promptTokens: number | null; completionTokens: number | null; cost: number | null }
  _count: { _all: number }
}

function toTotals(row: SumRow, latest: LatestModel | undefined): UsageTotals {
  return {
    totalTokens: row._sum.totalTokens ?? 0,
    promptTokens: row._sum.promptTokens ?? 0,
    completionTokens: row._sum.completionTokens ?? 0,
    cost: row._sum.cost ?? 0,
    provider: latest?.provider ?? null,
    model: latest?.model ?? null,
    count: row._count._all,
  }
}

/** Usage totals per member; a member with no calls has no entry. */
export async function usageTotalsByUser(userIds: readonly string[]): Promise<Map<string, UsageTotals>> {
  if (userIds.length === 0) return new Map()
  const [groups, latest] = await Promise.all([
    prisma.lLMUsage.groupBy({
      by: ["userId"],
      where: { userId: { in: [...userIds] } },
      _sum: SUMS,
      _count: { _all: true },
    }),
    latestModelByUser(userIds),
  ])
  return new Map(groups.map((group) => [group.userId, toTotals(group, latest.get(group.userId))]))
}

/** Usage totals per Rewind (`PlexWrapped` id), regenerations included; a Rewind with no calls has no entry. */
export async function usageTotalsForWrapped(wrappedIds: readonly string[]): Promise<Map<string, UsageTotals>> {
  if (wrappedIds.length === 0) return new Map()
  const [groups, latest] = await Promise.all([
    prisma.lLMUsage.groupBy({
      by: ["wrappedId"],
      where: { wrappedId: { in: [...wrappedIds] } },
      _sum: SUMS,
      _count: { _all: true },
    }),
    prisma.lLMUsage.findMany({
      where: { wrappedId: { in: [...wrappedIds] } },
      distinct: ["wrappedId"],
      orderBy: [{ wrappedId: "asc" }, { createdAt: "desc" }],
      select: { wrappedId: true, provider: true, model: true },
    }),
  ])
  const latestByWrapped = new Map(latest.map((row) => [row.wrappedId, { provider: row.provider, model: row.model }]))
  const totals = new Map<string, UsageTotals>()
  for (const group of groups) {
    if (group.wrappedId) totals.set(group.wrappedId, toTotals(group, latestByWrapped.get(group.wrappedId)))
  }
  return totals
}
