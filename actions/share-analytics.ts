"use server"

import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { daysSchema, limitSchema } from "@/lib/validations/shared-schemas"

const logger = createLogger("SHARE_ANALYTICS")

export interface ShareAnalyticsStats {
  totalShares: number
  totalVisits: number
  uniqueWrapsShared: number
  averageVisitsPerShare: number
}

export interface ShareTimeSeriesData {
  date: string
  shares: number
  visits: number
}

export interface TopSharedWrap {
  wrappedId: string
  userId: string
  userName: string | null
  userEmail: string | null
  year: number
  shareToken: string
  visitCount: number
  firstSharedAt: Date | null
  lastVisitedAt: Date | null
}

/**
 * Get overall share analytics statistics
 */
export async function getShareAnalyticsStats(): Promise<ShareAnalyticsStats> {
  try {
    const totalShares = await prisma.plexWrapped.count({
      where: {
        shareToken: {
          not: null,
        },
      },
    })

    const totalVisits = await prisma.wrappedShareVisit.count()

    const uniqueWrapsShared = totalShares

    const averageVisitsPerShare =
      totalShares > 0 ? totalVisits / totalShares : 0

    return {
      totalShares,
      totalVisits,
      uniqueWrapsShared,
      averageVisitsPerShare: Math.round(averageVisitsPerShare * 100) / 100,
    }
  } catch (error) {
    logger.error("Error getting share analytics stats", error)
    return {
      totalShares: 0,
      totalVisits: 0,
      uniqueWrapsShared: 0,
      averageVisitsPerShare: 0,
    }
  }
}

/**
 * Get share and visit data over time
 */
export async function getShareTimeSeriesData(
  days: number = 30
): Promise<ShareTimeSeriesData[]> {
  // Validate days parameter
  const validatedDays = daysSchema.safeParse(days)
  const safeDays = validatedDays.success ? validatedDays.data : 30

  try {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - safeDays)
    startDate.setHours(0, 0, 0, 0)

    // Get all shares created in the time period
    const shares = await prisma.plexWrapped.findMany({
      where: {
        shareToken: {
          not: null,
        },
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        createdAt: true,
      },
    })

    // Get all visits in the time period
    const visits = await prisma.wrappedShareVisit.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        createdAt: true,
      },
    })

    // Group by date
    const dateMap = new Map<string, { shares: number; visits: number }>()

    // Initialize all dates in range
    for (let i = 0; i < safeDays; i++) {
      const date = new Date(startDate)
      date.setDate(date.getDate() + i)
      const dateKey = date.toISOString().split("T")[0]
      dateMap.set(dateKey, { shares: 0, visits: 0 })
    }

    // Count shares by date
    for (const share of shares) {
      const dateKey = share.createdAt.toISOString().split("T")[0]
      const existing = dateMap.get(dateKey) || { shares: 0, visits: 0 }
      existing.shares += 1
      dateMap.set(dateKey, existing)
    }

    // Count visits by date
    for (const visit of visits) {
      const dateKey = visit.createdAt.toISOString().split("T")[0]
      const existing = dateMap.get(dateKey) || { shares: 0, visits: 0 }
      existing.visits += 1
      dateMap.set(dateKey, existing)
    }

    // Convert to array and sort by date
    return Array.from(dateMap.entries())
      .map(([date, counts]) => ({
        date,
        shares: counts.shares,
        visits: counts.visits,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch (error) {
    logger.error("Error getting share time series data", error)
    return []
  }
}

/**
 * Get top shared wraps by visit count
 */
export async function getTopSharedWraps(
  limit: number = 10
): Promise<TopSharedWrap[]> {
  // Validate limit parameter
  const validatedLimit = limitSchema.safeParse(limit)
  const safeLimit = validatedLimit.success ? validatedLimit.data : 10

  try {
    const wrapsWithVisits = await prisma.plexWrapped.findMany({
      where: {
        shareToken: {
          not: null,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        shareVisits: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
        _count: {
          select: {
            shareVisits: true,
          },
        },
      },
      orderBy: {
        shareVisits: {
          _count: "desc",
        },
      },
      take: safeLimit,
    })

    return wrapsWithVisits.map((wrap) => ({
      wrappedId: wrap.id,
      userId: wrap.userId,
      userName: wrap.user.name,
      userEmail: wrap.user.email,
      year: wrap.year,
      shareToken: wrap.shareToken!,
      visitCount: wrap._count.shareVisits,
      firstSharedAt: wrap.generatedAt || wrap.createdAt,
      lastVisitedAt:
        wrap.shareVisits.length > 0 ? wrap.shareVisits[0].createdAt : null,
    }))
  } catch (error) {
    logger.error("Error getting top shared wraps", error)
    return []
  }
}

