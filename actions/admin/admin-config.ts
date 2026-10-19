"use server"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { parseStripeLibrarySectionIds } from "@/lib/stripe/config"
import { clearOfferedPricesCache } from "@/lib/stripe/prices"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"
import { normalizeTimeZone } from "@/lib/utils/zoned-time"
import { DEFAULT_SEASON, getSeasonState, parseMonthDay, seasonStateAt } from "@/lib/wrapped/season"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const logger = createLogger("ADMIN")

/**
 * The Rewind generation settings (public, no auth required).
 *
 * - `featureEnabled`: the admin's on/off switch (`Config.wrappedEnabled`).
 * - `seasonOpen`: the season window is open now, in the server zone.
 * - `wrappedEnabled`: both, so members may generate now. Admins regenerate
 *   whenever the feature is on, inside the window or not.
 * - `wrappedYear`: the season year (`lib/wrapped/season.ts`).
 */
export async function getWrappedSettings() {
  try {
    const [config, season] = await Promise.all([
      prisma.config.findUnique({ where: { id: "config" }, select: { wrappedEnabled: true } }),
      getSeasonState(),
    ])
    const featureEnabled = config?.wrappedEnabled ?? true
    return {
      featureEnabled,
      seasonOpen: season.isOpen,
      wrappedEnabled: featureEnabled && season.isOpen,
      wrappedYear: season.seasonYear,
    }
  } catch (error) {
    logger.error("Error getting wrapped settings", error)
    // Fail as the default configuration would: the default window, in UTC
    const season = seasonStateAt(new Date(), DEFAULT_SEASON.opens, DEFAULT_SEASON.closes, "UTC")
    return {
      featureEnabled: true,
      seasonOpen: season.isOpen,
      wrappedEnabled: season.isOpen,
      wrappedYear: season.seasonYear,
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
  rewindSeasonOpens: true,
  rewindSeasonCloses: true,
  timezone: true,
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
      rewindSeasonOpens: DEFAULT_SEASON.opens,
      rewindSeasonCloses: DEFAULT_SEASON.closes,
      timezone: null,
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
      // The full row holds secrets and Decimal columns, which must not reach the client
      select: NON_SECRET_CONFIG_SELECT,
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

const monthDaySchema = z.string().refine((value) => parseMonthDay(value) !== null, {
  message: "Season dates must be real month-day values (MM-DD)",
})

const wrappedSettingsSchema = z
  .object({ enabled: z.boolean(), opens: monthDaySchema, closes: monthDaySchema })
  .refine((data) => data.opens !== data.closes, { message: "The season cannot open and close on the same day" })

/**
 * Update the Rewind switch and season window (admin only). `opens` and
 * `closes` are `MM-DD` values in the server zone; a window may cross the new
 * year (`12-01` to `01-31`).
 */
export async function updateWrappedSettings(data: { enabled: boolean; opens: string; closes: string }) {
  const session = await requireAdmin()

  const validated = wrappedSettingsSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message ?? "Invalid season settings" }
  }
  const { enabled, opens, closes } = validated.data

  try {
    const values = {
      wrappedEnabled: enabled,
      rewindSeasonOpens: opens,
      rewindSeasonCloses: closes,
      updatedBy: session.user.id,
    }
    const config = await prisma.config.upsert({
      where: { id: "config" },
      update: values,
      create: { id: "config", llmDisabled: false, ...values },
      select: NON_SECRET_CONFIG_SELECT,
    })

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

const serverTimeZoneSchema = z
  .string()
  .max(64)
  .transform((value) => normalizeTimeZone(value.trim()))
  .refine((zone): zone is string => zone !== null, { message: "Choose a time zone from the list" })

/**
 * Set the server time zone, `Config.timezone` (admin only). The value is
 * stored under its canonical IANA name, so `US/Pacific` is saved as
 * `America/Los_Angeles`; it overrides the `TZ` environment variable.
 */
export async function updateServerTimeZone(timezone: string) {
  const session = await requireAdmin()

  const validated = serverTimeZoneSchema.safeParse(timezone)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message ?? "Invalid time zone" }
  }
  const zone = validated.data

  try {
    const previous = await prisma.config.findUnique({ where: { id: "config" }, select: { timezone: true } })
    await prisma.config.upsert({
      where: { id: "config" },
      update: { timezone: zone, updatedBy: session.user.id },
      create: { id: "config", timezone: zone, updatedBy: session.user.id },
      select: { id: true },
    })

    logAuditEvent(AuditEventType.SERVER_TIMEZONE_CHANGED, session.user.id, {
      from: previous?.timezone ?? null,
      to: zone,
    })
    // Every page that shows a time or the season reads the zone
    revalidatePath("/", "layout")

    return { success: true, timezone: zone }
  } catch (error) {
    logger.error("Error updating the server time zone", error)
    return { success: false, error: "Failed to update the server time zone" }
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
