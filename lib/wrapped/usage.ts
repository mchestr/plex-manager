/**
 * Helper functions for querying LLM usage and cost analysis
 */

import { prisma } from "@/lib/prisma"

export interface LLMUsageStats {
  totalRequests: number
  totalTokens: number
  totalCost: number
  averageCostPerRequest: number
  averageTokensPerRequest: number
  byProvider: Array<{
    provider: string
    requests: number
    tokens: number
    cost: number
  }>
  byModel: Array<{
    model: string
    requests: number
    tokens: number
    cost: number
  }>
  byUser: Array<{
    userId: string
    userName: string | null
    requests: number
    tokens: number
    cost: number
  }>
  byDate: Array<{
    date: string
    requests: number
    tokens: number
    cost: number
  }>
}

/**
 * Get LLM usage statistics for cost analysis
 */
export async function getLLMUsageStats(
  startDate?: Date,
  endDate?: Date,
  userId?: string
): Promise<LLMUsageStats> {
  const where: any = {}

  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) where.createdAt.gte = startDate
    if (endDate) where.createdAt.lt = endDate
  }

  if (userId) {
    where.userId = userId
  }

  const usageRecords = await prisma.lLMUsage.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  const totalRequests = usageRecords.length
  const totalTokens = usageRecords.reduce((sum, record) => sum + record.totalTokens, 0)
  const totalCost = usageRecords.reduce((sum, record) => sum + record.cost, 0)

  // Group by provider
  const byProviderMap = new Map<string, { requests: number; tokens: number; cost: number }>()
  for (const record of usageRecords) {
    const existing = byProviderMap.get(record.provider) || {
      requests: 0,
      tokens: 0,
      cost: 0,
    }
    existing.requests += 1
    existing.tokens += record.totalTokens
    existing.cost += record.cost
    byProviderMap.set(record.provider, existing)
  }

  const byProvider = Array.from(byProviderMap.entries())
    .map(([provider, stats]) => ({
      provider,
      ...stats,
    }))
    .sort((a, b) => b.cost - a.cost)

  // Group by model
  const byModelMap = new Map<string, { requests: number; tokens: number; cost: number }>()
  for (const record of usageRecords) {
    const model = record.model || "unknown"
    const existing = byModelMap.get(model) || {
      requests: 0,
      tokens: 0,
      cost: 0,
    }
    existing.requests += 1
    existing.tokens += record.totalTokens
    existing.cost += record.cost
    byModelMap.set(model, existing)
  }

  const byModel = Array.from(byModelMap.entries())
    .map(([model, stats]) => ({
      model,
      ...stats,
    }))
    .sort((a, b) => b.cost - a.cost)

  // Group by user
  const byUserMap = new Map<
    string,
    { userName: string | null; requests: number; tokens: number; cost: number }
  >()
  for (const record of usageRecords) {
    const existing = byUserMap.get(record.userId) || {
      userName: record.user.name || record.user.email,
      requests: 0,
      tokens: 0,
      cost: 0,
    }
    existing.requests += 1
    existing.tokens += record.totalTokens
    existing.cost += record.cost
    byUserMap.set(record.userId, existing)
  }

  const byUser = Array.from(byUserMap.entries())
    .map(([userId, stats]) => ({
      userId,
      ...stats,
    }))
    .sort((a, b) => b.cost - a.cost)

  // Group by date
  const byDateMap = new Map<string, { requests: number; tokens: number; cost: number }>()
  for (const record of usageRecords) {
    const date = record.createdAt.toISOString().split("T")[0] // YYYY-MM-DD
    const existing = byDateMap.get(date) || {
      requests: 0,
      tokens: 0,
      cost: 0,
    }
    existing.requests += 1
    existing.tokens += record.totalTokens
    existing.cost += record.cost
    byDateMap.set(date, existing)
  }

  const byDate = Array.from(byDateMap.entries())
    .map(([date, stats]) => ({
      date,
      ...stats,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))

  return {
    totalRequests,
    totalTokens,
    totalCost,
    averageCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0,
    averageTokensPerRequest: totalRequests > 0 ? totalTokens / totalRequests : 0,
    byProvider,
    byModel,
    byUser,
    byDate,
  }
}

/**
 * Get LLM usage records with pagination
 */
export async function getLLMUsageRecords(
  page: number = 1,
  pageSize: number = 50,
  userId?: string
) {
  const skip = (page - 1) * pageSize

  const where: any = {}
  if (userId) {
    where.userId = userId
  }

  const [records, total] = await Promise.all([
    prisma.lLMUsage.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        wrapped: {
          select: {
            id: true,
            year: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: pageSize,
    }),
    prisma.lLMUsage.count({ where }),
  ])

  return {
    records,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

/**
 * Get cost summary for a specific time period
 */
export async function getCostSummary(startDate: Date, endDate: Date) {
  const stats = await getLLMUsageStats(startDate, endDate)

  return {
    period: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
    summary: {
      totalCost: stats.totalCost,
      totalRequests: stats.totalRequests,
      averageCostPerRequest: stats.averageCostPerRequest,
    },
    breakdown: {
      byProvider: stats.byProvider,
      byModel: stats.byModel,
      byUser: stats.byUser,
      byDate: stats.byDate,
    },
  }
}

