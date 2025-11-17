"use server"

import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin"

// Server stats are now calculated on the fly - no database caching needed

/**
 * Get the current application configuration
 */
export async function getConfig() {
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
        },
      })
    }

    return config
  } catch (error) {
    console.error("[CONFIG] Error getting config:", error)
    // Return default config if there's an error
    return {
      id: "config",
      llmDisabled: false,
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
    console.error("[CONFIG] Error updating LLM disabled setting:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update configuration",
    }
  }
}

/**
 * Get LLM usage records with pagination (admin only)
 */
export async function getLLMUsageRecords(page: number = 1, pageSize: number = 50, userId?: string) {
  await requireAdmin()

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
export async function getLLMUsageById(id: string) {
  await requireAdmin()

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
      const currentData = JSON.parse(wrapped.data)
      // Create a normalized hash of sections to identify the current version
      const sections = (currentData.sections || []).map((s: any) => ({
        id: s.id,
        type: s.type,
      }))
      currentSectionsHash = JSON.stringify(sections.sort((a: any, b: any) => a.id.localeCompare(b.id)))
    } catch (error) {
      console.error("[ADMIN] Failed to parse wrapped data for comparison:", error)
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
            const versionSections = (parsed.sections || []).map((s: any) => ({
              id: s.id,
              type: s.type,
            }))
            const versionSectionsHash = JSON.stringify(versionSections.sort((a: any, b: any) => a.id.localeCompare(b.id)))
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
          const parsed = JSON.parse(cleaned)
          const versionSections = (parsed.sections || []).map((s: any) => ({
            id: s.id,
            type: s.type,
          }))
          const versionSectionsHash = JSON.stringify(versionSections.sort((a: any, b: any) => a.id.localeCompare(b.id)))
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
export async function getHistoricalWrappedData(llmUsageId: string, wrappedId: string) {
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
    console.error("[ADMIN] Failed to parse current wrapped data for statistics:", error)
  }

  // Parse the LLM response
  try {
    const { parseWrappedResponse } = await import("@/lib/wrapped/prompt")

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
    console.error("[ADMIN] Failed to parse historical wrapped data:", error)
    return null
  }
}

