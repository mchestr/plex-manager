"use server"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { type MediaType } from "@/lib/validations/maintenance"

const logger = createLogger("MAINTENANCE-STATS")

/**
 * Get maintenance overview statistics (admin only)
 */
export async function getMaintenanceStats() {
  await requireAdmin()

  try {
    const [
      totalRules,
      enabledRules,
      totalCandidates,
      pendingCandidates,
      approvedCandidates,
      rejectedCandidates,
      recentScans,
      totalDeletions,
    ] = await Promise.all([
      prisma.maintenanceRule.count(),
      prisma.maintenanceRule.count({ where: { enabled: true } }),
      prisma.maintenanceCandidate.count(),
      prisma.maintenanceCandidate.count({ where: { reviewStatus: "PENDING" } }),
      prisma.maintenanceCandidate.count({ where: { reviewStatus: "APPROVED" } }),
      prisma.maintenanceCandidate.count({ where: { reviewStatus: "REJECTED" } }),
      prisma.maintenanceScan.findMany({
        where: { status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        take: 5,
        include: {
          rule: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.maintenanceDeletionLog.count(),
    ])

    return {
      success: true,
      data: {
        rules: {
          total: totalRules,
          enabled: enabledRules,
          disabled: totalRules - enabledRules,
        },
        candidates: {
          total: totalCandidates,
          pending: pendingCandidates,
          approved: approvedCandidates,
          rejected: rejectedCandidates,
        },
        recentScans,
        totalDeletions,
      },
    }
  } catch (error) {
    logger.error("Error fetching maintenance stats", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch maintenance stats",
    }
  }
}

/**
 * Get deletion history with optional filters and pagination (admin only)
 */
export async function getDeletionHistory(filters?: {
  mediaType?: MediaType
  deletedBy?: string
  filesDeleted?: boolean
  startDate?: Date
  endDate?: Date
  page?: number
  pageSize?: number
}) {
  await requireAdmin()

  try {
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || 50
    const skip = (page - 1) * pageSize

    const where: {
      mediaType?: MediaType
      deletedBy?: string
      filesDeleted?: boolean
      deletedAt?: {
        gte?: Date
        lte?: Date
      }
    } = {}

    if (filters?.mediaType) {
      where.mediaType = filters.mediaType
    }
    if (filters?.deletedBy) {
      where.deletedBy = filters.deletedBy
    }
    if (filters?.filesDeleted !== undefined) {
      where.filesDeleted = filters.filesDeleted
    }
    if (filters?.startDate || filters?.endDate) {
      where.deletedAt = {}
      if (filters.startDate) {
        where.deletedAt.gte = filters.startDate
      }
      if (filters.endDate) {
        where.deletedAt.lte = filters.endDate
      }
    }

    const [deletions, total] = await Promise.all([
      prisma.maintenanceDeletionLog.findMany({
        where,
        orderBy: { deletedAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.maintenanceDeletionLog.count({ where }),
    ])

    return {
      success: true,
      data: {
        deletions,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    }
  } catch (error) {
    logger.error("Error fetching deletion history", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch deletion history",
    }
  }
}

/**
 * Get deletion statistics (admin only)
 */
export async function getDeletionStats(filters?: {
  startDate?: Date
  endDate?: Date
}) {
  await requireAdmin()

  try {
    const where: {
      deletedAt?: {
        gte?: Date
        lte?: Date
      }
    } = {}

    if (filters?.startDate || filters?.endDate) {
      where.deletedAt = {}
      if (filters.startDate) {
        where.deletedAt.gte = filters.startDate
      }
      if (filters.endDate) {
        where.deletedAt.lte = filters.endDate
      }
    }

    const [totalDeletions, deletions, deletionsByMediaType, deletionsByUser] = await Promise.all([
      prisma.maintenanceDeletionLog.count({ where }),
      prisma.maintenanceDeletionLog.findMany({
        where,
        select: {
          fileSize: true,
          filesDeleted: true,
          deletedAt: true,
        },
      }),
      prisma.maintenanceDeletionLog.groupBy({
        by: ["mediaType"],
        where,
        _count: {
          id: true,
        },
      }),
      prisma.maintenanceDeletionLog.groupBy({
        by: ["deletedBy"],
        where,
        _count: {
          id: true,
        },
      }),
    ])

    // Calculate total space reclaimed
    const totalSpaceReclaimed = deletions.reduce((acc, deletion) => {
      return acc + (deletion.fileSize ? Number(deletion.fileSize) : 0)
    }, 0)

    // Count files actually deleted vs just removed from Plex
    const filesActuallyDeleted = deletions.filter((d) => d.filesDeleted).length

    // Get deletions this month
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const deletionsThisMonth = deletions.filter(
      (d) => d.deletedAt >= startOfMonth
    ).length

    return {
      success: true,
      data: {
        totalDeletions,
        totalSpaceReclaimed,
        filesActuallyDeleted,
        deletionsThisMonth,
        byMediaType: deletionsByMediaType.map((item) => ({
          mediaType: item.mediaType,
          count: item._count.id,
        })),
        byUser: deletionsByUser.map((item) => ({
          userId: item.deletedBy,
          count: item._count.id,
        })),
      },
    }
  } catch (error) {
    logger.error("Error fetching deletion stats", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch deletion stats",
    }
  }
}
