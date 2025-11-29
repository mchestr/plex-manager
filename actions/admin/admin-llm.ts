"use server"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import type { Prisma } from "@/lib/generated/prisma/client"

// Type for LLMUsage records with included user
type LLMUsageWithUser = Prisma.LLMUsageGetPayload<{
  include: { user: { select: { id: true; name: true; email: true } } }
}>

const logger = createLogger("ADMIN")

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

  const skip = (page - 1) * pageSize

  const where: { userId?: string; chatConversationId?: string } = {}
  if (userId) {
    where.userId = userId
  }
  if (conversationId) {
    where.chatConversationId = conversationId
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
 * Get a single LLM usage record by ID (admin only)
 */
export async function getLLMUsageById(id: string | undefined) {
  await requireAdmin()

  if (!id) {
    throw new Error("LLM usage ID is required")
  }

  const record = await prisma.lLMUsage.findUnique({
    where: { id },
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

/**
 * Get LLM usage statistics (admin only)
 */
export async function getLLMUsageStats(startDate?: Date, endDate?: Date, userId?: string) {
  await requireAdmin()

  const { getLLMUsageStats: getStats } = await import("@/lib/wrapped/usage")
  return getStats(startDate, endDate, userId)
}

/**
 * Update LLM provider configuration (admin only)
 * @deprecated Use updateChatLLMProvider or updateWrappedLLMProvider instead
 */
export async function updateLLMProvider(data: { provider: string; apiKey: string; model: string; temperature?: number; maxTokens?: number }) {
  // For backward compatibility, update wrapped provider
  return updateWrappedLLMProvider(data)
}

/**
 * Update chat LLM provider configuration (admin only)
 */
export async function updateChatLLMProvider(data: { provider: string; apiKey: string; model: string; temperature?: number; maxTokens?: number }) {
  await requireAdmin()

  try {
    const { llmProviderSchema } = await import("@/lib/validations/llm-provider")
    const { testLLMProviderConnection } = await import("@/lib/connections/llm-provider")
    const { revalidatePath } = await import("next/cache")

    // Ensure model is provided
    if (!data.model) {
      return { success: false, error: "Model is required" }
    }

    const validated = llmProviderSchema.parse({ ...data, model: data.model })

    // Test connection before saving
    const connectionTest = await testLLMProviderConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to LLM provider" }
    }

    // Type assertion: we've already checked that data.model exists
    const model = validated.model!

    await prisma.$transaction(async (tx) => {
      // Deactivate any existing chat providers
      await tx.lLMProvider.updateMany({
        where: { isActive: true, purpose: "chat" },
        data: { isActive: false },
      })

      // Check if there's an existing provider with same config
      const existing = await tx.lLMProvider.findFirst({
        where: {
          provider: validated.provider,
          purpose: "chat",
          apiKey: validated.apiKey,
          model: model,
        },
      })

      if (existing) {
        // Reactivate existing provider and update temperature and maxTokens
        await tx.lLMProvider.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            temperature: validated.temperature ?? null,
            maxTokens: validated.maxTokens ?? null,
          },
        })
      } else {
        // Create new provider configuration
        await tx.lLMProvider.create({
          data: {
            provider: validated.provider,
            purpose: "chat",
            apiKey: validated.apiKey,
            model: model,
            temperature: validated.temperature ?? null,
            maxTokens: validated.maxTokens ?? null,
            isActive: true,
          },
        })
      }
    })

    revalidatePath("/admin/settings")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to update chat LLM provider configuration" }
  }
}

/**
 * Update wrapped LLM provider configuration (admin only)
 */
export async function updateWrappedLLMProvider(data: { provider: string; apiKey: string; model: string; temperature?: number; maxTokens?: number }) {
  await requireAdmin()

  try {
    const { llmProviderSchema } = await import("@/lib/validations/llm-provider")
    const { testLLMProviderConnection } = await import("@/lib/connections/llm-provider")
    const { revalidatePath } = await import("next/cache")

    // Ensure model is provided
    if (!data.model) {
      return { success: false, error: "Model is required" }
    }

    const validated = llmProviderSchema.parse({ ...data, model: data.model })

    // Test connection before saving
    const connectionTest = await testLLMProviderConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to LLM provider" }
    }

    // Type assertion: we've already checked that data.model exists
    const model = validated.model!

    await prisma.$transaction(async (tx) => {
      // Deactivate any existing wrapped providers
      await tx.lLMProvider.updateMany({
        where: { isActive: true, purpose: "wrapped" },
        data: { isActive: false },
      })

      // Check if there's an existing provider with same config
      const existing = await tx.lLMProvider.findFirst({
        where: {
          provider: validated.provider,
          purpose: "wrapped",
          apiKey: validated.apiKey,
          model: model,
        },
      })

      if (existing) {
        // Reactivate existing provider and update temperature and maxTokens
        await tx.lLMProvider.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            temperature: validated.temperature ?? null,
            maxTokens: validated.maxTokens ?? null,
          },
        })
      } else {
        // Create new provider configuration
        await tx.lLMProvider.create({
          data: {
            provider: validated.provider,
            purpose: "wrapped",
            apiKey: validated.apiKey,
            model: model,
            temperature: validated.temperature ?? null,
            maxTokens: validated.maxTokens ?? null,
            isActive: true,
          },
        })
      }
    })

    revalidatePath("/admin/settings")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to update wrapped LLM provider configuration" }
  }
}

/**
 * Get historical wrapped versions from LLM usage records (admin only)
 */
export async function getHistoricalWrappedVersions(wrappedId: string) {
  await requireAdmin()

  // Get the wrapped to compare with current data
  const wrapped = await prisma.plexWrapped.findUnique({
    where: { id: wrappedId },
    select: { data: true, generatedAt: true },
  })

  let currentSectionsHash: string | null = null
  if (wrapped?.data) {
    try {
      const currentData = JSON.parse(wrapped.data) as { sections?: Array<{ id: string; type: string }> }
      // Create a normalized hash of sections to identify the current version
      const sections = (currentData.sections || []).map((s) => ({
        id: s.id,
        type: s.type,
      }))
      currentSectionsHash = JSON.stringify(sections.sort((a, b) => a.id.localeCompare(b.id)))
    } catch (error) {
      logger.error("Failed to parse wrapped data for comparison", error)
    }
  }

  const llmUsageRecords = await prisma.lLMUsage.findMany({
    where: {
      wrappedId,
      // Only include records that have a response (exclude mock/empty responses)
      response: {
        not: "",
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
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  // Get current summary for comparison
  let currentSummary: string | null = null
  if (wrapped?.data) {
    try {
      const currentData = JSON.parse(wrapped.data)
      currentSummary = currentData.summary || null
    } catch (error) {
      // Ignore
    }
  }

  return llmUsageRecords.map((record: LLMUsageWithUser, index: number) => {
    // Check if this version matches the current wrapped data
    let isCurrent = false

    // Try multiple comparison methods
    if (index === 0) {
      // The most recent version is typically the current one
      // Try comparing summary first (most reliable)
      if (currentSummary) {
        try {
          let cleaned = record.response.trim()
          if (cleaned.startsWith("```json")) {
            cleaned = cleaned.replace(/^```json\n?/, "").replace(/\n?```$/, "")
          } else if (cleaned.startsWith("```")) {
            cleaned = cleaned.replace(/^```\n?/, "").replace(/\n?```$/, "")
          }
          const parsed = JSON.parse(cleaned)
          if (parsed.summary === currentSummary) {
            isCurrent = true
          } else if (currentSectionsHash) {
            // Fallback to section comparison
            const versionSections = (parsed.sections || []).map((s: { id: string; type: string }) => ({
              id: s.id,
              type: s.type,
            }))
            const versionSectionsHash = JSON.stringify(versionSections.sort((a: { id: string; type: string }, b: { id: string; type: string }) => a.id.localeCompare(b.id)))
            isCurrent = versionSectionsHash === currentSectionsHash
          } else {
            // If no comparison possible, assume most recent is current
            isCurrent = true
          }
        } catch (error) {
          // If parsing fails, but it's the most recent, assume it's current
          isCurrent = true
        }
      } else if (currentSectionsHash) {
        // Try section comparison if no summary
        try {
          let cleaned = record.response.trim()
          if (cleaned.startsWith("```json")) {
            cleaned = cleaned.replace(/^```json\n?/, "").replace(/\n?```$/, "")
          } else if (cleaned.startsWith("```")) {
            cleaned = cleaned.replace(/^```\n?/, "").replace(/\n?```$/, "")
          }
          const parsed = JSON.parse(cleaned) as { sections?: Array<{ id: string; type: string }> }
          const versionSections = (parsed.sections || []).map((s) => ({
            id: s.id,
            type: s.type,
          }))
          const versionSectionsHash = JSON.stringify(versionSections.sort((a, b) => a.id.localeCompare(b.id)))
          isCurrent = versionSectionsHash === currentSectionsHash
        } catch (error) {
          isCurrent = true
        }
      } else {
        // If we can't compare, mark the most recent one as current
        isCurrent = true
      }
    }

    return {
      id: record.id,
      createdAt: record.createdAt,
      provider: record.provider,
      model: record.model,
      cost: record.cost,
      totalTokens: record.totalTokens,
      response: record.response,
      userId: record.userId,
      userName: record.user.name || record.user.email || "Unknown",
      isCurrent,
    }
  })
}

/**
 * Get a historical wrapped data from an LLM usage record (admin only)
 */
export async function getHistoricalWrappedData(llmUsageId: string, _wrappedId: string) {
  await requireAdmin()

  // Get the LLM usage record
  const llmUsage = await prisma.lLMUsage.findUnique({
    where: { id: llmUsageId },
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
          data: true,
        },
      },
    },
  })

  if (!llmUsage || !llmUsage.wrapped) {
    return null
  }

  // Get the current wrapped data to extract statistics (they don't change between regenerations)
  let statistics = null
  try {
    const currentWrappedData = JSON.parse(llmUsage.wrapped.data)
    statistics = currentWrappedData.statistics
  } catch (error) {
    logger.error("Failed to parse current wrapped data for statistics", error)
  }

  // Parse the LLM response
  try {
    // Clean the response - remove markdown code blocks if present
    let cleaned = llmUsage.response.trim()
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\n?/, "").replace(/\n?```$/, "")
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\n?/, "").replace(/\n?```$/, "")
    }

    const parsed = JSON.parse(cleaned)

    // Build wrapped data using statistics from current wrapped (if available)
    // or create minimal statistics if not available
    const wrappedData = {
      year: llmUsage.wrapped.year,
      userId: llmUsage.userId,
      userName: llmUsage.user.name || llmUsage.user.email || "User",
      generatedAt: llmUsage.createdAt.toISOString(),
      statistics: statistics || {
        totalWatchTime: { total: 0, movies: 0, shows: 0 },
        moviesWatched: 0,
        showsWatched: 0,
        episodesWatched: 0,
        topMovies: [],
        topShows: [],
      },
      sections: parsed.sections || [],
      insights: parsed.insights || {
        personality: "Viewer",
        topGenre: "Various",
        bingeWatcher: false,
        discoveryScore: 50,
        funFacts: [],
      },
      summary: parsed.summary || undefined,
      metadata: {
        totalSections: parsed.sections?.length || 0,
        generationTime: 0,
      },
    }

    return {
      wrappedData,
      llmUsage: {
        id: llmUsage.id,
        createdAt: llmUsage.createdAt,
        provider: llmUsage.provider,
        model: llmUsage.model,
        cost: llmUsage.cost,
        totalTokens: llmUsage.totalTokens,
      },
    }
  } catch (error) {
    logger.error("Failed to parse historical wrapped data", error)
    return null
  }
}
