"use server"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("ADMIN")

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
    // First try to find existing config (fast path for most requests)
    let config = await prisma.config.findUnique({
      where: { id: "config" },
    })

    // If config exists, return it
    if (config) {
      return config
    }

    // Config doesn't exist, try to create it with upsert
    try {
      config = await prisma.config.upsert({
        where: { id: "config" },
        update: {},
        create: {
          id: "config",
          llmDisabled: false,
          wrappedEnabled: true,
        },
      })
      return config
    } catch (upsertError) {
      // Handle race condition: another request created it between our check and upsert
      // Just fetch the now-existing record
      const existingConfig = await prisma.config.findUnique({
        where: { id: "config" },
      })

      if (existingConfig) {
        return existingConfig
      }

      // If we still can't find it, something is wrong
      throw upsertError
    }
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
