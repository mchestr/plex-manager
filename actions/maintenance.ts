"use server"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/lib/generated/prisma/client"
import { createLogger } from "@/lib/utils/logger"
import {
  CreateMaintenanceRuleSchema,
  UpdateMaintenanceRuleSchema,
  CreateUserMediaMarkSchema,
  type ReviewStatus,
  type MediaType,
  type MarkType,
} from "@/lib/validations/maintenance"
import { maintenanceQueue, deletionQueue } from "@/lib/maintenance/queue"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"

const logger = createLogger("MAINTENANCE")

/**
 * Get all maintenance rules with scan counts (admin only)
 *
 * Performance Note (Issue #39):
 * This query uses Prisma's `include` with nested relations. Performance profiling
 * shows Prisma optimizes this into just 2 queries internally (no N+1 issue):
 * - 100 rules, 1000 scans: ~6ms avg
 * - 500 rules, 25000 scans: ~77ms avg
 *
 * Well under the 1s threshold. See scripts/profile-maintenance-query.ts for profiling.
 */
export async function getMaintenanceRules() {
  await requireAdmin()

  try {
    const rules = await prisma.maintenanceRule.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        scans: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            itemsScanned: true,
            itemsFlagged: true,
            completedAt: true,
          },
        },
        _count: {
          select: {
            scans: true,
          },
        },
      },
    })

    return { success: true, data: rules }
  } catch (error) {
    logger.error("Error fetching maintenance rules", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch maintenance rules",
    }
  }
}

/**
 * Create new maintenance rule (admin only)
 */
export async function createMaintenanceRule(data: unknown) {
  await requireAdmin()

  try {
    const validated = CreateMaintenanceRuleSchema.parse(data)

    const rule = await prisma.maintenanceRule.create({
      data: {
        name: validated.name,
        description: validated.description,
        enabled: validated.enabled,
        mediaType: validated.mediaType,
        criteria: validated.criteria as unknown as Prisma.InputJsonValue,
        actionType: validated.actionType,
        schedule: validated.schedule,
      },
    })

    revalidatePath("/admin/maintenance")
    return { success: true, data: rule }
  } catch (error) {
    logger.error("Error creating maintenance rule", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create maintenance rule",
    }
  }
}

/**
 * Update maintenance rule (admin only)
 */
export async function updateMaintenanceRule(id: string, data: unknown) {
  await requireAdmin()

  try {
    const validated = UpdateMaintenanceRuleSchema.parse(data)

    const rule = await prisma.maintenanceRule.update({
      where: { id },
      data: {
        name: validated.name,
        description: validated.description,
        enabled: validated.enabled,
        mediaType: validated.mediaType,
        criteria: validated.criteria as unknown as Prisma.InputJsonValue | undefined,
        actionType: validated.actionType,
        schedule: validated.schedule,
      },
    })

    revalidatePath("/admin/maintenance")
    return { success: true, data: rule }
  } catch (error) {
    logger.error("Error updating maintenance rule", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update maintenance rule",
    }
  }
}

/**
 * Delete maintenance rule (admin only)
 * Cascades to delete related scans and candidates
 */
export async function deleteMaintenanceRule(id: string) {
  await requireAdmin()

  try {
    await prisma.maintenanceRule.delete({
      where: { id },
    })

    revalidatePath("/admin/maintenance")
    return { success: true }
  } catch (error) {
    logger.error("Error deleting maintenance rule", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete maintenance rule",
    }
  }
}

/**
 * Toggle maintenance rule enabled status (admin only)
 */
export async function toggleMaintenanceRule(id: string, enabled: boolean) {
  await requireAdmin()

  try {
    const rule = await prisma.maintenanceRule.update({
      where: { id },
      data: { enabled },
    })

    revalidatePath("/admin/maintenance")
    return { success: true, data: rule }
  } catch (error) {
    logger.error("Error toggling maintenance rule", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to toggle maintenance rule",
    }
  }
}

/**
 * Get maintenance candidates with optional filters (admin only)
 */
export async function getMaintenanceCandidates(filters?: {
  reviewStatus?: ReviewStatus
  mediaType?: MediaType
  scanId?: string
}) {
  await requireAdmin()

  try {
    const where: {
      reviewStatus?: ReviewStatus
      mediaType?: MediaType
      scanId?: string
    } = {}

    if (filters?.reviewStatus) {
      where.reviewStatus = filters.reviewStatus
    }
    if (filters?.mediaType) {
      where.mediaType = filters.mediaType
    }
    if (filters?.scanId) {
      where.scanId = filters.scanId
    }

    const candidates = await prisma.maintenanceCandidate.findMany({
      where,
      orderBy: { flaggedAt: "desc" },
      include: {
        scan: {
          include: {
            rule: {
              select: {
                id: true,
                name: true,
                actionType: true,
              },
            },
          },
        },
      },
    })

    return { success: true, data: candidates }
  } catch (error) {
    logger.error("Error fetching maintenance candidates", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch maintenance candidates",
    }
  }
}

/**
 * Update candidate review status (admin only)
 */
export async function updateCandidateReviewStatus(
  candidateId: string,
  status: ReviewStatus,
  note?: string
) {
  const session = await requireAdmin()

  try {
    const candidate = await prisma.maintenanceCandidate.update({
      where: { id: candidateId },
      data: {
        reviewStatus: status,
        reviewedAt: new Date(),
        reviewedBy: session.user.id,
        reviewNote: note,
      },
    })

    revalidatePath("/admin/maintenance")
    return { success: true, data: candidate }
  } catch (error) {
    logger.error("Error updating candidate review status", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update candidate review status",
    }
  }
}

/**
 * Bulk update candidates review status (admin only)
 */
export async function bulkUpdateCandidates(candidateIds: string[], reviewStatus: ReviewStatus) {
  const session = await requireAdmin()

  try {
    const result = await prisma.maintenanceCandidate.updateMany({
      where: {
        id: { in: candidateIds },
      },
      data: {
        reviewStatus,
        reviewedAt: new Date(),
        reviewedBy: session.user.id,
      },
    })

    revalidatePath("/admin/maintenance")
    return { success: true, data: { count: result.count } }
  } catch (error) {
    logger.error("Error bulk updating candidates", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to bulk update candidates",
    }
  }
}

/**
 * Trigger manual scan for a maintenance rule (admin only)
 */
export async function triggerManualScan(ruleId: string) {
  await requireAdmin()

  try {
    // Verify rule exists and is enabled
    const rule = await prisma.maintenanceRule.findUnique({
      where: { id: ruleId },
    })

    if (!rule) {
      return { success: false, error: "Maintenance rule not found" }
    }

    if (!rule.enabled) {
      return { success: false, error: "Maintenance rule is disabled" }
    }

    // Queue the scan job
    const job = await maintenanceQueue.add(
      `manual-scan-${ruleId}`,
      {
        ruleId,
        manualTrigger: true,
      },
      {
        priority: 1, // Higher priority for manual scans
      }
    )

    logger.info("Manual scan queued", { ruleId, jobId: job.id })

    revalidatePath("/admin/maintenance")
    return { success: true, data: { jobId: job.id } }
  } catch (error) {
    logger.error("Error triggering manual scan", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to trigger manual scan",
    }
  }
}

/**
 * Trigger deletion job for candidates (admin only)
 */
export async function triggerDeletion(candidateIds: string[], deleteFiles: boolean) {
  const session = await requireAdmin()

  try {
    // Verify candidates exist and are approved for deletion
    const candidates = await prisma.maintenanceCandidate.findMany({
      where: {
        id: { in: candidateIds },
      },
      select: {
        id: true,
        reviewStatus: true,
      },
    })

    if (candidates.length === 0) {
      return { success: false, error: "No candidates found" }
    }

    if (candidates.length !== candidateIds.length) {
      return { success: false, error: "Some candidates were not found" }
    }

    // Check if all candidates are approved
    const unapprovedCandidates = candidates.filter((c) => c.reviewStatus !== "APPROVED")
    if (unapprovedCandidates.length > 0) {
      return {
        success: false,
        error: `${unapprovedCandidates.length} candidate(s) are not approved for deletion`,
      }
    }

    // Queue the deletion job
    const job = await deletionQueue.add(
      `deletion-${Date.now()}`,
      {
        candidateIds,
        deleteFiles,
        userId: session.user.id,
      },
      {
        priority: 1,
      }
    )

    logger.info("Deletion job queued", {
      candidateCount: candidateIds.length,
      deleteFiles,
      userId: session.user.id,
      jobId: job.id,
    })

    revalidatePath("/admin/maintenance")
    return { success: true, data: { jobId: job.id } }
  } catch (error) {
    logger.error("Error triggering deletion", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to trigger deletion",
    }
  }
}

/**
 * Get user's media marks with optional filters
 */
export async function getUserMediaMarks(filters?: {
  mediaType?: MediaType
  markType?: MarkType
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    const where: {
      userId: string
      mediaType?: MediaType
      markType?: MarkType
    } = {
      userId: session.user.id,
    }

    if (filters?.mediaType) {
      where.mediaType = filters.mediaType
    }
    if (filters?.markType) {
      where.markType = filters.markType
    }

    const marks = await prisma.userMediaMark.findMany({
      where,
      orderBy: { markedAt: "desc" },
    })

    return { success: true, data: marks }
  } catch (error) {
    logger.error("Error fetching user media marks", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch user media marks",
    }
  }
}

/**
 * Create a user media mark
 */
export async function createUserMediaMark(data: unknown) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    const validated = CreateUserMediaMarkSchema.parse(data)

    // Check if mark already exists for this media
    const existing = await prisma.userMediaMark.findFirst({
      where: {
        userId: session.user.id,
        plexRatingKey: validated.plexRatingKey,
        markType: validated.markType,
      },
    })

    if (existing) {
      return { success: false, error: "Mark already exists for this media" }
    }

    const mark = await prisma.userMediaMark.create({
      data: {
        userId: session.user.id,
        mediaType: validated.mediaType,
        plexRatingKey: validated.plexRatingKey,
        radarrId: validated.radarrId,
        sonarrId: validated.sonarrId,
        title: validated.title,
        year: validated.year,
        seasonNumber: validated.seasonNumber,
        episodeNumber: validated.episodeNumber,
        parentTitle: validated.parentTitle,
        markType: validated.markType,
        note: validated.note,
        markedVia: validated.markedVia,
        discordChannelId: validated.discordChannelId,
      },
    })

    revalidatePath("/media")
    return { success: true, data: mark }
  } catch (error) {
    logger.error("Error creating user media mark", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create user media mark",
    }
  }
}

/**
 * Delete a user media mark
 */
export async function deleteUserMediaMark(id: string) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    // Verify mark belongs to user
    const mark = await prisma.userMediaMark.findUnique({
      where: { id },
      select: { userId: true },
    })

    if (!mark) {
      return { success: false, error: "Mark not found" }
    }

    if (mark.userId !== session.user.id) {
      return { success: false, error: "Unauthorized to delete this mark" }
    }

    await prisma.userMediaMark.delete({
      where: { id },
    })

    revalidatePath("/media")
    return { success: true }
  } catch (error) {
    logger.error("Error deleting user media mark", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete user media mark",
    }
  }
}

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
