"use server"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import {
  CandidatePaginationSchema,
  ReviewStatusEnum,
  type ReviewStatus,
  type MediaType,
} from "@/lib/validations/maintenance"
import { bulkIdsSchema } from "@/lib/validations/shared-schemas"
import { z } from "zod"
import type { PaginatedCandidatesResponse } from "@/types/maintenance"
import { revalidatePath } from "next/cache"

const logger = createLogger("MAINTENANCE-CANDIDATES")

/**
 * Get maintenance candidates with optional filters and pagination (admin only)
 */
export async function getMaintenanceCandidates(params?: {
  page?: number
  pageSize?: number
  reviewStatus?: ReviewStatus
  mediaType?: MediaType
  scanId?: string
}): Promise<{ success: true; data: PaginatedCandidatesResponse } | { success: false; error: string }> {
  await requireAdmin()

  try {
    // Parse and validate pagination parameters
    const validated = CandidatePaginationSchema.parse({
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 25,
      reviewStatus: params?.reviewStatus,
      mediaType: params?.mediaType,
      scanId: params?.scanId,
    })

    const { page, pageSize, reviewStatus, mediaType, scanId } = validated

    const where: {
      reviewStatus?: ReviewStatus
      mediaType?: MediaType
      scanId?: string
    } = {}

    if (reviewStatus) {
      where.reviewStatus = reviewStatus
    }
    if (mediaType) {
      where.mediaType = mediaType
    }
    if (scanId) {
      where.scanId = scanId
    }

    // Get total count and candidates in parallel
    const [totalCount, candidates] = await Promise.all([
      prisma.maintenanceCandidate.count({ where }),
      prisma.maintenanceCandidate.findMany({
        where,
        orderBy: { flaggedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
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
      }),
    ])

    const totalPages = Math.ceil(totalCount / pageSize)

    return {
      success: true,
      data: {
        candidates,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
    }
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

// Schema for bulkUpdateCandidates parameters
const bulkUpdateCandidatesSchema = z.object({
  candidateIds: bulkIdsSchema,
  reviewStatus: ReviewStatusEnum,
})

/**
 * Bulk update candidates review status (admin only)
 */
export async function bulkUpdateCandidates(candidateIds: string[], reviewStatus: ReviewStatus) {
  const session = await requireAdmin()

  // Validate input parameters
  const validated = bulkUpdateCandidatesSchema.safeParse({ candidateIds, reviewStatus })

  if (!validated.success) {
    logger.warn("Invalid bulkUpdateCandidates parameters", {
      errors: validated.error.issues,
    })
    return {
      success: false,
      error: validated.error.issues[0]?.message || "Invalid parameters",
    }
  }

  const { candidateIds: validIds, reviewStatus: validStatus } = validated.data

  try {
    const result = await prisma.maintenanceCandidate.updateMany({
      where: {
        id: { in: validIds },
      },
      data: {
        reviewStatus: validStatus,
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
