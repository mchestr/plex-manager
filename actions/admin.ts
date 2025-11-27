"use server"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("ADMIN")

// Server stats are now calculated on the fly - no database caching needed

/**
 * Get wrapped settings (public - no auth required)
 * Checks date range if configured, otherwise falls back to wrappedEnabled flag
 */
export async function getWrappedSettings() {
  try {
    const config = await prisma.config.findUnique({
      where: { id: "config" },
      select: {
        wrappedEnabled: true,
        wrappedGenerationStartDate: true,
        wrappedGenerationEndDate: true,
      },
    })

    // Return defaults if config doesn't exist
    if (!config) {
      return {
        wrappedEnabled: true,
        wrappedYear: new Date().getFullYear(),
      }
    }

    let isEnabled = config.wrappedEnabled ?? true

    // Check date range if both dates are set
    if (config.wrappedGenerationStartDate && config.wrappedGenerationEndDate) {
      const now = new Date()
      const startDate = new Date(config.wrappedGenerationStartDate)
      const endDate = new Date(config.wrappedGenerationEndDate)

      // Set time to start of day for comparison
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

      // Normalize dates to current year for comparison
      const start = new Date(now.getFullYear(), startDate.getMonth(), startDate.getDate())
      const end = new Date(now.getFullYear(), endDate.getMonth(), endDate.getDate())

      // Handle year rollover (e.g., Nov 20 - Jan 31)
      // If end date is before start date, it means it spans across years
      if (end < start) {
        // Check if we're after start date this year
        const isAfterStart = today >= start
        // Check if we're in next year and before end date
        // We're in the next year if the current year is one more than the start date's year
        const startYear = startDate.getFullYear()
        const isInNextYear = now.getFullYear() === startYear + 1
        if (isInNextYear) {
          const nextYearEnd = new Date(now.getFullYear(), endDate.getMonth(), endDate.getDate())
          const isBeforeNextYearEnd = today <= nextYearEnd
          isEnabled = isEnabled && isBeforeNextYearEnd
        } else {
          // We're in the same year as start date
          isEnabled = isEnabled && isAfterStart
        }
      } else {
        // Normal range within same year
        isEnabled = isEnabled && (today >= start && today <= end)
      }
    }

    // Determine year: use year from start date if available, otherwise use current year
    let wrappedYear = new Date().getFullYear()
    if (config.wrappedGenerationStartDate) {
      wrappedYear = new Date(config.wrappedGenerationStartDate).getFullYear()
    }

    return {
      wrappedEnabled: isEnabled,
      wrappedYear,
    }
  } catch (error) {
    logger.error("Error getting wrapped settings", error)
    // Return defaults on error
    return {
      wrappedEnabled: true,
      wrappedYear: new Date().getFullYear(),
    }
  }
}

/**
 * Get the current application configuration (admin only)
 */
export async function getConfig() {
  await requireAdmin()

  try {
    const config = await prisma.config.findUnique({
      where: { id: "config" },
    })

    // If config doesn't exist, create it with defaults
    if (!config) {
      return await prisma.config.create({
        data: {
          id: "config",
          llmDisabled: false,
          wrappedEnabled: true,
        },
      })
    }

    return config
  } catch (error) {
    logger.error("Error getting config", error)
    // Return default config if there's an error
    return {
      id: "config",
      llmDisabled: false,
      wrappedEnabled: true,
      wrappedGenerationStartDate: null,
      wrappedGenerationEndDate: null,
      updatedAt: new Date(),
      updatedBy: null,
    }
  }
}

/**
 * Update LLM disabled setting (admin only)
 */
export async function setLLMDisabled(disabled: boolean) {
  const session = await requireAdmin()

  try {
    const config = await prisma.config.upsert({
      where: { id: "config" },
      update: {
        llmDisabled: disabled,
        updatedBy: session.user.id,
      },
      create: {
        id: "config",
        llmDisabled: disabled,
        updatedBy: session.user.id,
      },
    })

    return { success: true, config }
  } catch (error) {
    logger.error("Error updating LLM disabled setting", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update configuration",
    }
  }
}

/**
 * Update wrapped settings (admin only)
 */
export async function updateWrappedSettings(data: {
  enabled: boolean
  startDate?: Date | null
  endDate?: Date | null
}) {
  const session = await requireAdmin()

  try {
    // Validate date range: if one is set, both must be set
    if ((data.startDate && !data.endDate) || (!data.startDate && data.endDate)) {
      return {
        success: false,
        error: "Both start and end dates must be set, or both must be empty",
      }
    }

    // Validate that end date is after start date (or handle year rollover)
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate)
      const end = new Date(data.endDate)
      // Normalize to same year for comparison
      const startNormalized = new Date(2000, start.getMonth(), start.getDate())
      const endNormalized = new Date(2000, end.getMonth(), end.getDate())

      // If end is before start, it's a year rollover (e.g., Nov -> Jan), which is valid
      // But if they're the same or end is way before start, it's invalid
      if (startNormalized.getTime() === endNormalized.getTime()) {
        return {
          success: false,
          error: "Start and end dates cannot be the same",
        }
      }
    }

    const updateData: {
      wrappedEnabled: boolean
      wrappedGenerationStartDate?: Date | null
      wrappedGenerationEndDate?: Date | null
      updatedBy: string
    } = {
      wrappedEnabled: data.enabled,
      updatedBy: session.user.id,
    }

    if (data.startDate !== undefined) {
      updateData.wrappedGenerationStartDate = data.startDate || null
    }

    if (data.endDate !== undefined) {
      updateData.wrappedGenerationEndDate = data.endDate || null
    }

    const config = await prisma.config.upsert({
      where: { id: "config" },
      update: updateData,
      create: {
        id: "config",
        llmDisabled: false,
        wrappedEnabled: data.enabled,
        wrappedGenerationStartDate: data.startDate || null,
        wrappedGenerationEndDate: data.endDate || null,
        updatedBy: session.user.id,
      },
    })

    const { revalidatePath } = await import("next/cache")
    revalidatePath("/")
    revalidatePath("/wrapped")

    return { success: true, config }
  } catch (error) {
    logger.error("Error updating wrapped settings", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update wrapped settings",
    }
  }
}

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
 * Get user by ID (admin only)
 */
export async function getUserById(userId: string) {
  await requireAdmin()

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
    },
  })

  return user
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

  return llmUsageRecords.map((record, index) => {
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

/**
 * Get all admin settings (admin only)
 */
export async function getAdminSettings() {
  await requireAdmin()

  const [
    config,
    chatLLMProvider,
    wrappedLLMProvider,
    plexServer,
    tautulli,
    overseerr,
    sonarr,
    radarr,
    discordIntegration,
    discordLinkedCount,
  ] = await Promise.all([
    getConfig(),
    prisma.lLMProvider.findFirst({ where: { isActive: true, purpose: "chat" } }),
    prisma.lLMProvider.findFirst({ where: { isActive: true, purpose: "wrapped" } }),
    prisma.plexServer.findFirst({ where: { isActive: true } }),
    prisma.tautulli.findFirst({ where: { isActive: true } }),
    prisma.overseerr.findFirst({ where: { isActive: true } }),
    prisma.sonarr.findFirst({ where: { isActive: true } }),
    prisma.radarr.findFirst({ where: { isActive: true } }),
    prisma.discordIntegration.findUnique({ where: { id: "discord" } }),
    prisma.discordConnection.count({ where: { revokedAt: null } }),
  ])

  return {
    config,
    chatLLMProvider,
    wrappedLLMProvider,
    // Keep llmProvider for backward compatibility (returns wrapped provider)
    llmProvider: wrappedLLMProvider,
    plexServer,
    tautulli,
    overseerr,
    sonarr,
    radarr,
    discordIntegration,
    discordLinkedCount,
  }
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
 * Update Plex server configuration (admin only)
 */
export async function updatePlexServer(data: { name: string; url: string; token: string; publicUrl?: string }) {
  await requireAdmin()

  try {
    const { plexServerSchema } = await import("@/lib/validations/plex")
    const { testPlexConnection } = await import("@/lib/connections/plex")
    const { getPlexUserInfo } = await import("@/lib/connections/plex")
    const { revalidatePath } = await import("next/cache")

    const validated = plexServerSchema.parse(data)

    // Test connection before saving
    const connectionTest = await testPlexConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to Plex server" }
    }

    // Fetch the admin's Plex user ID from the token
    const userInfoResult = await getPlexUserInfo(validated.token)
    if (!userInfoResult.success || !userInfoResult.data) {
      return { success: false, error: "Failed to fetch user info from Plex token" }
    }

    const adminPlexUserId = userInfoResult.data.id

    await prisma.$transaction(async (tx) => {
      // Deactivate existing active server
      await tx.plexServer.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })

      // Update or create server
      const existing = await tx.plexServer.findFirst({
        where: {
          url: validated.url,
        },
      })

      if (existing) {
        await tx.plexServer.update({
          where: { id: existing.id },
          data: {
            name: validated.name,
            url: validated.url,
            token: validated.token,
            publicUrl: validated.publicUrl,
            adminPlexUserId,
            isActive: true,
          },
        })
      } else {
        await tx.plexServer.create({
          data: {
            name: validated.name,
            url: validated.url,
            token: validated.token,
            publicUrl: validated.publicUrl,
            adminPlexUserId,
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
    return { success: false, error: "Failed to update Plex server configuration" }
  }
}

/**
 * Update Tautulli configuration (admin only)
 */
export async function updateTautulli(data: { name: string; url: string; apiKey: string; publicUrl?: string }) {
  await requireAdmin()

  try {
    const { tautulliSchema } = await import("@/lib/validations/tautulli")
    const { testTautulliConnection } = await import("@/lib/connections/tautulli")
    const { revalidatePath } = await import("next/cache")

    const validated = tautulliSchema.parse(data)

    // Test connection before saving
    const connectionTest = await testTautulliConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to Tautulli server" }
    }

    await prisma.$transaction(async (tx) => {
      // Deactivate existing active server
      await tx.tautulli.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })

      // Update or create server
      const existing = await tx.tautulli.findFirst({
        where: {
          url: validated.url,
        },
      })

      if (existing) {
        await tx.tautulli.update({
          where: { id: existing.id },
          data: {
            name: validated.name,
            url: validated.url,
            apiKey: validated.apiKey,
            publicUrl: validated.publicUrl,
            isActive: true,
          },
        })
      } else {
        await tx.tautulli.create({
          data: {
            name: validated.name,
            url: validated.url,
            apiKey: validated.apiKey,
            publicUrl: validated.publicUrl,
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
    return { success: false, error: "Failed to update Tautulli configuration" }
  }
}

/**
 * Update Overseerr configuration (admin only)
 */
export async function updateOverseerr(data: { name: string; url: string; apiKey: string; publicUrl?: string }) {
  await requireAdmin()

  try {
    const { overseerrSchema } = await import("@/lib/validations/overseerr")
    const { testOverseerrConnection } = await import("@/lib/connections/overseerr")
    const { revalidatePath } = await import("next/cache")

    const validated = overseerrSchema.parse(data)

    // Test connection before saving
    const connectionTest = await testOverseerrConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to Overseerr server" }
    }

    await prisma.$transaction(async (tx) => {
      // Deactivate existing active server
      await tx.overseerr.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })

      // Update or create server
      const existing = await tx.overseerr.findFirst({
        where: {
          url: validated.url,
        },
      })

      if (existing) {
        await tx.overseerr.update({
          where: { id: existing.id },
          data: {
            name: validated.name,
            url: validated.url,
            apiKey: validated.apiKey,
            publicUrl: validated.publicUrl,
            isActive: true,
          },
        })
      } else {
        await tx.overseerr.create({
          data: {
            name: validated.name,
            url: validated.url,
            apiKey: validated.apiKey,
            publicUrl: validated.publicUrl,
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
    return { success: false, error: "Failed to update Overseerr configuration" }
  }
}

/**
 * Update Sonarr configuration (admin only)
 */
export async function updateSonarr(data: { name: string; url: string; apiKey: string; publicUrl?: string }) {
  await requireAdmin()

  try {
    const { sonarrSchema } = await import("@/lib/validations/sonarr")
    const { testSonarrConnection } = await import("@/lib/connections/sonarr")
    const { revalidatePath } = await import("next/cache")

    const validated = sonarrSchema.parse(data)

    // Test connection before saving
    const connectionTest = await testSonarrConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to Sonarr server" }
    }

    await prisma.$transaction(async (tx) => {
      // Deactivate existing active server
      await tx.sonarr.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })

      // Update or create server
      const existing = await tx.sonarr.findFirst({
        where: {
          url: validated.url,
        },
      })

      if (existing) {
        await tx.sonarr.update({
          where: { id: existing.id },
          data: {
            name: validated.name,
            url: validated.url,
            apiKey: validated.apiKey,
            publicUrl: validated.publicUrl,
            isActive: true,
          },
        })
      } else {
        await tx.sonarr.create({
          data: {
            name: validated.name,
            url: validated.url,
            apiKey: validated.apiKey,
            publicUrl: validated.publicUrl,
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
    return { success: false, error: "Failed to update Sonarr configuration" }
  }
}

/**
 * Update Radarr configuration (admin only)
 */
export async function updateRadarr(data: { name: string; url: string; apiKey: string; publicUrl?: string }) {
  await requireAdmin()

  try {
    const { radarrSchema } = await import("@/lib/validations/radarr")
    const { testRadarrConnection } = await import("@/lib/connections/radarr")
    const { revalidatePath } = await import("next/cache")

    const validated = radarrSchema.parse(data)

    // Test connection before saving
    const connectionTest = await testRadarrConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to Radarr server" }
    }

    await prisma.$transaction(async (tx) => {
      // Deactivate existing active server
      await tx.radarr.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })

      // Update or create server
      const existing = await tx.radarr.findFirst({
        where: {
          url: validated.url,
        },
      })

      if (existing) {
        await tx.radarr.update({
          where: { id: existing.id },
          data: {
            name: validated.name,
            url: validated.url,
            apiKey: validated.apiKey,
            publicUrl: validated.publicUrl,
            isActive: true,
          },
        })
      } else {
        await tx.radarr.create({
          data: {
            name: validated.name,
            url: validated.url,
            apiKey: validated.apiKey,
            publicUrl: validated.publicUrl,
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
    return { success: false, error: "Failed to update Radarr configuration" }
  }
}

/**
 * Update user admin status (admin only)
 */
export async function updateUserAdminStatus(userId: string, isAdmin: boolean) {
  const session = await requireAdmin()

  try {
    // Prevent users from removing their own admin status
    if (session.user.id === userId && !isAdmin) {
      return {
        success: false,
        error: "You cannot remove your own admin privileges",
      }
    }

    // Get current user to check if status is changing
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    })

    if (!currentUser) {
      return {
        success: false,
        error: "User not found",
      }
    }

    // Only update if status is actually changing
    if (currentUser.isAdmin === isAdmin) {
      return {
        success: true,
        message: `User is already ${isAdmin ? "an admin" : "a regular user"}`,
      }
    }

    // Update user admin status
    await prisma.user.update({
      where: { id: userId },
      data: { isAdmin },
    })

    // Log audit event
    const { logAuditEvent, AuditEventType } = await import("@/lib/security/audit-log")
    logAuditEvent(
      isAdmin ? AuditEventType.ADMIN_PRIVILEGE_GRANTED : AuditEventType.ADMIN_PRIVILEGE_REVOKED,
      session.user.id,
      {
        targetUserId: userId,
        previousAdminStatus: !isAdmin,
        newAdminStatus: isAdmin,
      }
    )

    const { revalidatePath } = await import("next/cache")
    revalidatePath(`/admin/users/${userId}`)
    revalidatePath("/admin/users")

    return { success: true }
  } catch (error) {
    logger.error("Error updating user admin status", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update user admin status",
    }
  }
}

