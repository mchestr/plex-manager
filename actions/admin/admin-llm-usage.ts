"use server"

/**
 * LLM usage tracking and statistics
 *
 * Functions for viewing and analyzing LLM usage records
 */

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import {
  llmUsageIdSchema,
  userIdSchema,
} from "@/lib/validations/shared-schemas"
import { z } from "zod"

const logger = createLogger("ADMIN")

// Schema for getLLMUsageRecords parameters
const llmUsageRecordsParamsSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
  userId: userIdSchema.optional(),
  conversationId: z.string().min(1).max(100).optional(),
})

/**
 * Get LLM usage records with pagination (admin only)
 */
export async function getLLMUsageRecords(
  page: number = 1,
  pageSize: number = 50,
  userId?: string,
  conversationId?: string
) {
  await requireAdmin()

  // Validate input parameters
  const validated = llmUsageRecordsParamsSchema.safeParse({
    page,
    pageSize,
    userId,
    conversationId,
  })

  if (!validated.success) {
    logger.warn("Invalid getLLMUsageRecords parameters", {
      errors: validated.error.issues,
    })
    return {
      records: [],
      pagination: {
        page: 1,
        pageSize: 50,
        total: 0,
        totalPages: 0,
      },
    }
  }

  const {
    page: validPage,
    pageSize: validPageSize,
    userId: validUserId,
    conversationId: validConversationId,
  } = validated.data

  const skip = (validPage - 1) * validPageSize

  const where: { userId?: string; chatConversationId?: string } = {}
  if (validUserId) {
    where.userId = validUserId
  }
  if (validConversationId) {
    where.chatConversationId = validConversationId
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
            image: true,
          },
        },
        wrapped: {
          select: {
            id: true,
            year: true,
            status: true,
          },
        },
        chatConversation: {
          select: {
            id: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: validPageSize,
    }),
    prisma.lLMUsage.count({ where }),
  ])

  return {
    records,
    pagination: {
      page: validPage,
      pageSize: validPageSize,
      total,
      totalPages: Math.ceil(total / validPageSize),
    },
  }
}

/**
 * Get a single LLM usage record by ID (admin only)
 */
export async function getLLMUsageById(id: string | undefined) {
  await requireAdmin()

  if (!id) {
    throw new Error("LLM usage ID is required")
  }

  // Validate ID format
  const validatedId = llmUsageIdSchema.safeParse(id)
  if (!validatedId.success) {
    throw new Error("Invalid LLM usage ID format")
  }

  const record = await prisma.lLMUsage.findUnique({
    where: { id: validatedId.data },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
      wrapped: {
        select: {
          id: true,
          year: true,
          status: true,
          generatedAt: true,
        },
      },
      chatConversation: {
        select: {
          id: true,
          createdAt: true,
        },
      },
    },
  })

  return record
}

// Schema for getLLMUsageStats parameters
const llmUsageStatsParamsSchema = z.object({
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  userId: userIdSchema.optional(),
})

/**
 * Get LLM usage statistics (admin only)
 */
export async function getLLMUsageStats(startDate?: Date, endDate?: Date, userId?: string) {
  await requireAdmin()

  // Validate input parameters
  const validated = llmUsageStatsParamsSchema.safeParse({
    startDate,
    endDate,
    userId,
  })

  if (!validated.success) {
    logger.warn("Invalid getLLMUsageStats parameters", {
      errors: validated.error.issues,
    })
    // Return empty stats on validation failure - must match LLMUsageStats type
    return {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      averageCostPerRequest: 0,
      averageTokensPerRequest: 0,
      byProvider: [],
      byModel: [],
      byUser: [],
      byDate: [],
    }
  }

  const { startDate: validStartDate, endDate: validEndDate, userId: validUserId } = validated.data

  const { getLLMUsageStats: getStats } = await import("@/lib/wrapped/usage")
  return getStats(validStartDate, validEndDate, validUserId)
}
