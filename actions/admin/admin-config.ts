"use server"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { parseStripeLibrarySectionIds } from "@/lib/stripe/config"
import { clearOfferedPricesCache } from "@/lib/stripe/prices"
import { createLogger } from "@/lib/utils/logger"
import { z } from "zod"

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
 * Non-secret Config columns. Explicitly excludes `stripeSecretKey` and
 * `stripeWebhookSecret`: the Prisma extension decrypts those on read, so
 * selecting them would return plaintext secrets to callers (some of which pass
 * the result to client components). Secrets are read only via narrowly-scoped
 * selects within this module.
 */
const NON_SECRET_CONFIG_SELECT = {
  id: true,
  llmDisabled: true,
  wrappedEnabled: true,
  wrappedGenerationStartDate: true,
  wrappedGenerationEndDate: true,
  watchlistSyncEnabled: true,
  watchlistSyncIntervalMinutes: true,
  stripeEnabled: true,
  stripePriceIds: true,
  updatedAt: true,
  updatedBy: true,
} as const

/**
 * Get the current application configuration (admin only).
 *
 * Never returns the Stripe secret key or webhook secret (see
 * {@link NON_SECRET_CONFIG_SELECT}).
 */
export async function getConfig() {
  await requireAdmin()

  try {
    const config = await prisma.config.findUnique({
      where: { id: "config" },
      select: NON_SECRET_CONFIG_SELECT,
    })

    // If config doesn't exist, create it with defaults
    if (!config) {
      return await prisma.config.create({
        data: {
          id: "config",
          llmDisabled: false,
          wrappedEnabled: true,
        },
        select: NON_SECRET_CONFIG_SELECT,
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
      watchlistSyncEnabled: false,
      watchlistSyncIntervalMinutes: 60,
      stripeEnabled: false,
      stripePriceIds: null,
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
 * Non-secret view of the Stripe configuration used to determine whether the
 * feature can be enabled. Never contains raw secret values.
 */
export interface StripeConfigStatus {
  enabled: boolean
  hasSecretKey: boolean
  hasWebhookSecret: boolean
  priceIds: string[]
  librarySectionIds: number[]
}

/**
 * Parses the stored `stripePriceIds` JSON value into a clean array of strings.
 * @internal
 */
function parseStripePriceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
}

/**
 * Determines whether Stripe is fully configured (secret key, webhook secret, and
 * at least one price id present). Centralized so `setStripeEnabled` and the UI
 * agree on the requirement (FR-3).
 * @internal
 */
function getMissingStripeConfig(status: {
  hasSecretKey: boolean
  hasWebhookSecret: boolean
  priceIds: string[]
}): string[] {
  const missing: string[] = []
  if (!status.hasSecretKey) missing.push("secret key")
  if (!status.hasWebhookSecret) missing.push("webhook secret")
  if (status.priceIds.length === 0) missing.push("at least one price ID")
  return missing
}

const updateStripeSettingsSchema = z.object({
  secretKey: z.string().trim().min(1).optional(),
  webhookSecret: z.string().trim().min(1).optional(),
  priceIds: z.array(z.string().trim().min(1)),
  librarySectionIds: z.array(z.number().int().nonnegative()),
})

/**
 * Get the non-secret Stripe configuration status for the UI (admin only).
 *
 * Returns only booleans and the list of configured price ids — never the raw
 * secret key or webhook secret — so client components cannot receive secrets.
 */
export async function getStripeConfig(): Promise<StripeConfigStatus> {
  await requireAdmin()

  try {
    const config = await prisma.config.findUnique({
      where: { id: "config" },
      select: {
        stripeEnabled: true,
        stripeSecretKey: true,
        stripeWebhookSecret: true,
        stripePriceIds: true,
        stripeLibrarySectionIds: true,
      },
    })

    if (!config) {
      return {
        enabled: false,
        hasSecretKey: false,
        hasWebhookSecret: false,
        priceIds: [],
        librarySectionIds: [],
      }
    }

    return {
      enabled: config.stripeEnabled,
      hasSecretKey: Boolean(config.stripeSecretKey),
      hasWebhookSecret: Boolean(config.stripeWebhookSecret),
      priceIds: parseStripePriceIds(config.stripePriceIds),
      librarySectionIds: parseStripeLibrarySectionIds(config.stripeLibrarySectionIds),
    }
  } catch (error) {
    logger.error("Error getting Stripe config", error)
    return {
      enabled: false,
      hasSecretKey: false,
      hasWebhookSecret: false,
      priceIds: [],
      librarySectionIds: [],
    }
  }
}

/**
 * Save Stripe credentials and price ids (admin only).
 *
 * Secrets are encrypted at rest by the Prisma extension. `secretKey` and
 * `webhookSecret` are optional so admins can update price ids without
 * re-entering secrets (leave blank to keep the existing value). `priceIds` is
 * always persisted as a JSON array of strings.
 */
export async function updateStripeSettings(data: {
  secretKey?: string
  webhookSecret?: string
  priceIds: string[]
  librarySectionIds: number[]
}) {
  const session = await requireAdmin()

  const validated = updateStripeSettingsSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: "Invalid Stripe settings input" }
  }

  const { secretKey, webhookSecret, priceIds, librarySectionIds } = validated.data

  try {
    const updateData: {
      stripePriceIds: string[]
      stripeLibrarySectionIds: number[]
      stripeSecretKey?: string
      stripeWebhookSecret?: string
      updatedBy: string
    } = {
      stripePriceIds: priceIds,
      stripeLibrarySectionIds: librarySectionIds,
      updatedBy: session.user.id,
    }

    // Only overwrite secrets when a new value is provided (leave-blank-to-keep)
    if (secretKey !== undefined) {
      updateData.stripeSecretKey = secretKey
    }
    if (webhookSecret !== undefined) {
      updateData.stripeWebhookSecret = webhookSecret
    }

    // Do NOT return the upserted row: the Prisma extension decrypts the Stripe
    // secret fields on read, so returning it would leak the plaintext secret key
    // and webhook secret into the Server Action's RSC response to the client.
    await prisma.config.upsert({
      where: { id: "config" },
      update: updateData,
      create: {
        id: "config",
        stripePriceIds: priceIds,
        stripeLibrarySectionIds: librarySectionIds,
        stripeSecretKey: secretKey,
        stripeWebhookSecret: webhookSecret,
        updatedBy: session.user.id,
      },
    })

    // Invalidate the offered-prices cache so a price-id change is reflected on
    // /subscribe immediately rather than after the TTL.
    clearOfferedPricesCache()

    const { revalidatePath } = await import("next/cache")
    revalidatePath("/admin/settings")

    return { success: true }
  } catch (error) {
    logger.error("Error updating Stripe settings", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update Stripe settings",
    }
  }
}

/**
 * Flip the master Stripe toggle (admin only).
 *
 * Enabling is blocked (FR-3) unless Stripe is fully configured: a secret key, a
 * webhook secret, and at least one price id must all be present. When any are
 * missing, returns `{error}` naming what is missing and does NOT set
 * `stripeEnabled = true`. Disabling is always allowed.
 */
export async function setStripeEnabled(enabled: boolean) {
  const session = await requireAdmin()

  if (typeof enabled !== "boolean") {
    return { success: false, error: "Invalid input: enabled must be a boolean" }
  }

  try {
    if (enabled) {
      const config = await prisma.config.findUnique({
        where: { id: "config" },
        select: {
          stripeSecretKey: true,
          stripeWebhookSecret: true,
          stripePriceIds: true,
        },
      })

      const missing = getMissingStripeConfig({
        hasSecretKey: Boolean(config?.stripeSecretKey),
        hasWebhookSecret: Boolean(config?.stripeWebhookSecret),
        priceIds: parseStripePriceIds(config?.stripePriceIds),
      })

      if (missing.length > 0) {
        return {
          success: false,
          error: `Stripe cannot be enabled until it is fully configured. Missing: ${missing.join(", ")}.`,
        }
      }
    }

    // Do NOT return the upserted row: the Prisma extension decrypts the Stripe
    // secret fields on read, which would leak them to the client via the Server
    // Action response.
    await prisma.config.upsert({
      where: { id: "config" },
      update: {
        stripeEnabled: enabled,
        updatedBy: session.user.id,
      },
      create: {
        id: "config",
        stripeEnabled: enabled,
        updatedBy: session.user.id,
      },
    })

    // Invalidate the offered-prices cache so enabling/disabling takes effect on
    // /subscribe immediately (a stale cache could otherwise offer prices for up
    // to the TTL after disabling).
    clearOfferedPricesCache()

    const { revalidatePath } = await import("next/cache")
    revalidatePath("/admin/settings")
    revalidatePath("/")

    return { success: true }
  } catch (error) {
    logger.error("Error updating Stripe enabled setting", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update Stripe configuration",
    }
  }
}
