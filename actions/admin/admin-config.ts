"use server"

import { Prisma } from "@/lib/generated/prisma/client"
import type { SavedSecret } from "@/lib/security/saved-secret"
import { describeSecret } from "@/lib/security/secret-reuse"
import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { APP_SETTINGS_TAG } from "@/lib/settings/app-settings"
import { CONNECTION_HEALTH_TAG } from "@/lib/settings/connection-status"
import { isRedisConfigured } from "@/lib/queue/connection"
import { parseStripeLibrarySectionIds, parseStripePriceIds } from "@/lib/stripe/config"
import { clearOfferedPricesCache } from "@/lib/stripe/prices"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import { createLogger } from "@/lib/utils/logger"
import { normalizeTimeZone } from "@/lib/utils/zoned-time"
import { REWIND_SETTINGS_SELECT } from "@/lib/wrapped/config"
import { DEFAULT_SEASON, getSeasonState, seasonStateAt } from "@/lib/wrapped/season"
import { revalidatePath, updateTag } from "next/cache"
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
  ...REWIND_SETTINGS_SELECT,
  timezone: true,
  watchlistSyncEnabled: true,
  watchlistSyncIntervalMinutes: true,
  stripeEnabled: true,
  stripePriceIds: true,
  llmDailyCapPerUserUsd: true,
  llmDailyCapAdminUsd: true,
  llmDailyCapServerUsd: true,
  lightThemeEnabled: true,
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
      rewindEnabled: false,
      rewindAudience: "admins",
      rewindSeasonOpens: DEFAULT_SEASON.opens,
      rewindSeasonCloses: DEFAULT_SEASON.closes,
      rewindLlmMode: "standard",
      rewindLlmBudgetUsd: new Prisma.Decimal(10),
      rewindPublicLinks: true,
      rewindPublicCounts: false,
      rewindShowServerNameOnCards: true,
      rewindAllowArtOnCards: true,
      rewindExcludedSectionIds: null,
      rewindExcludedContentRatings: null,
      rewindIncludeManagedUsers: false,
      rewindDisabledPages: null,
      rewindNotifyChannels: ["discord", "banner"],
      timezone: null,
      watchlistSyncEnabled: false,
      watchlistSyncIntervalMinutes: 60,
      stripeEnabled: false,
      stripePriceIds: null,
      llmDailyCapPerUserUsd: 0.5,
      llmDailyCapAdminUsd: 5,
      llmDailyCapServerUsd: 5,
      lightThemeEnabled: false,
      updatedAt: new Date(),
      updatedBy: null,
    }
  }
}

/**
 * Update LLM disabled setting (admin only)
 */
export const setLLMDisabled = adminAction({
  input: z.boolean(),
  fallbackError: "Failed to update configuration",
  handler: async (disabled, { userId }) => {
    const before = await prisma.config.findUnique({ where: { id: "config" }, select: { llmDisabled: true } })
    await prisma.config.upsert({
      where: { id: "config" },
      update: { llmDisabled: disabled, updatedBy: userId },
      create: { id: "config", llmDisabled: disabled, updatedBy: userId },
      select: { id: true },
    })

    logAuditEvent(AuditEventType.CONFIG_CHANGED, userId, configDiff("llm", before, { llmDisabled: disabled }))
    // The cached AI check reads the flag too (P10.19)
    updateTag(CONNECTION_HEALTH_TAG)
    return ok(null)
  },
})

/** A daily cap in US dollars. 0 refuses every assistant call for that tier. */
const dailyCapSchema = z.number().min(0, "A cap cannot be negative").max(1000, "A cap can be at most 1000 USD a day")

const llmCapsSchema = z.object({
  llmDailyCapPerUserUsd: dailyCapSchema,
  llmDailyCapAdminUsd: dailyCapSchema,
  llmDailyCapServerUsd: dailyCapSchema,
})

/**
 * Set the assistant's daily spend caps (admin only): per member, per admin and
 * for the whole server, in US dollars per server-zone day. `lib/llm/budget.ts`
 * checks them before every assistant LLM call.
 */
export const updateLlmCaps = adminAction({
  input: llmCapsSchema,
  fallbackError: "Failed to update the assistant spend caps",
  handler: async (caps, { userId }) => {
    const before = await prisma.config.findUnique({
      where: { id: "config" },
      select: { llmDailyCapPerUserUsd: true, llmDailyCapAdminUsd: true, llmDailyCapServerUsd: true },
    })
    await prisma.config.upsert({
      where: { id: "config" },
      update: { ...caps, updatedBy: userId },
      create: { id: "config", ...caps, updatedBy: userId },
      select: { id: true },
    })

    logAuditEvent(AuditEventType.CONFIG_CHANGED, userId, configDiff("llm.caps", before, caps))
    revalidatePath("/admin/settings")
    return ok(null)
  },
})

const serverTimeZoneSchema = z
  .string()
  .max(64)
  .transform((value) => normalizeTimeZone(value.trim()))
  .refine((zone): zone is string => zone !== null, { message: "Choose a time zone from the list" })

/**
 * Set the server time zone, `Config.timezone` (admin only). The value is
 * stored under its canonical IANA name, so `US/Pacific` is saved as
 * `America/Los_Angeles`; it overrides the `TZ` environment variable. Audited
 * as `SERVER_TIMEZONE_CHANGED` with `section: "timezone"`, which the settings
 * footer reads (P10.20).
 */
export const updateServerTimeZone = adminAction({
  input: serverTimeZoneSchema,
  fallbackError: "Failed to update the server time zone",
  handler: async (zone, { userId }) => {
    const previous = await prisma.config.findUnique({ where: { id: "config" }, select: { timezone: true } })
    await prisma.config.upsert({
      where: { id: "config" },
      update: { timezone: zone, updatedBy: userId },
      create: { id: "config", timezone: zone, updatedBy: userId },
      select: { id: true },
    })

    logAuditEvent(AuditEventType.SERVER_TIMEZONE_CHANGED, userId, {
      section: "timezone",
      from: previous?.timezone ?? null,
      to: zone,
    })
    // Every page that shows a time or the season reads the zone
    updateTag(APP_SETTINGS_TAG)
    revalidatePath("/", "layout")
    return ok({ timezone: zone })
  },
})

/**
 * Non-secret view of the Stripe configuration used to determine whether the
 * feature can be enabled. Never contains raw secret values.
 */
export interface StripeConfigStatus {
  enabled: boolean
  hasSecretKey: boolean
  hasWebhookSecret: boolean
  /** The stored keys' last four for `SecretInput` (P10.20); both go only to Stripe, so no origin. */
  saved: { secretKey: SavedSecret | null; webhookSecret: SavedSecret | null }
  /** Whether `REDIS_URL` is set, so the queue that processes webhooks can run. */
  hasJobQueue: boolean
  priceIds: string[]
  librarySectionIds: number[]
}

/** The missing-config entry for the job queue; the settings form shows the same words. */
const STRIPE_QUEUE_REQUIREMENT = "job queue (REDIS_URL)"

/**
 * Determines whether Stripe is fully configured (secret key, webhook secret, at
 * least one price id, and the job queue that processes webhooks, GAP-15).
 * `setStripeEnabled` refuses on the same list the settings form shows (FR-3).
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
  if (!isRedisConfigured()) missing.push(STRIPE_QUEUE_REQUIREMENT)
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
      return emptyStripeConfigStatus()
    }

    return {
      enabled: config.stripeEnabled,
      hasSecretKey: Boolean(config.stripeSecretKey),
      hasWebhookSecret: Boolean(config.stripeWebhookSecret),
      saved: { secretKey: describeSecret(config.stripeSecretKey), webhookSecret: describeSecret(config.stripeWebhookSecret) },
      hasJobQueue: isRedisConfigured(),
      priceIds: parseStripePriceIds(config.stripePriceIds),
      librarySectionIds: parseStripeLibrarySectionIds(config.stripeLibrarySectionIds),
    }
  } catch (error) {
    logger.error("Error getting Stripe config", error)
    return emptyStripeConfigStatus()
  }
}

/** @internal */
function emptyStripeConfigStatus(): StripeConfigStatus {
  return {
    enabled: false,
    hasSecretKey: false,
    hasWebhookSecret: false,
    saved: { secretKey: null, webhookSecret: null },
    hasJobQueue: isRedisConfigured(),
    priceIds: [],
    librarySectionIds: [],
  }
}

/**
 * Save Stripe credentials and price ids (admin only).
 *
 * Secrets are encrypted at rest by the Prisma extension. `secretKey` and
 * `webhookSecret` are optional so admins can update price ids without
 * re-entering secrets (leave blank to keep the existing value): both go only
 * to Stripe, so a kept secret cannot be redirected. `priceIds` is always
 * persisted as a JSON array of strings.
 */
export const updateStripeSettings = adminAction({
  input: updateStripeSettingsSchema,
  fallbackError: "Failed to update Stripe settings",
  handler: async ({ secretKey, webhookSecret, priceIds, librarySectionIds }, { userId }) => {
    // Read only for the audit diff, which records whether a secret changed, never its value
    const before = await prisma.config.findUnique({
      where: { id: "config" },
      select: { stripeSecretKey: true, stripeWebhookSecret: true, stripePriceIds: true, stripeLibrarySectionIds: true },
    })

    // Only overwrite secrets when a new value is provided (leave-blank-to-keep)
    const updateData = {
      stripePriceIds: priceIds,
      stripeLibrarySectionIds: librarySectionIds,
      ...(secretKey !== undefined && { stripeSecretKey: secretKey }),
      ...(webhookSecret !== undefined && { stripeWebhookSecret: webhookSecret }),
    }

    // Do NOT return the upserted row: the Prisma extension decrypts the Stripe
    // secret fields on read, so returning it would leak the plaintext secret key
    // and webhook secret into the Server Action's RSC response to the client.
    await prisma.config.upsert({
      where: { id: "config" },
      update: { ...updateData, updatedBy: userId },
      create: { id: "config", ...updateData, updatedBy: userId },
      select: { id: true },
    })

    logAuditEvent(
      AuditEventType.CONFIG_CHANGED,
      userId,
      configDiff(
        "stripe",
        before,
        { ...updateData, stripeSecretKey: secretKey, stripeWebhookSecret: webhookSecret },
        { secretFields: ["stripeSecretKey", "stripeWebhookSecret"] }
      )
    )

    // Invalidate the offered-prices cache so a price-id change is reflected on
    // /subscribe immediately rather than after the TTL.
    clearOfferedPricesCache()
    revalidatePath("/admin/settings")
    return ok(null)
  },
})

/**
 * Flip the master Stripe toggle (admin only).
 *
 * Enabling is blocked (FR-3) unless Stripe is fully configured: a secret key, a
 * webhook secret, at least one price id and the job queue (`REDIS_URL`, without
 * which no webhook is ever processed) must all be present. When any are
 * missing, returns `{error}` naming what is missing and does NOT set
 * `stripeEnabled = true`. Disabling is always allowed.
 */
export const setStripeEnabled = adminAction({
  input: z.boolean({ message: "Invalid input: enabled must be a boolean" }),
  fallbackError: "Failed to update Stripe configuration",
  handler: async (enabled, { userId }) => {
    // Disabling reads only the flag (for the audit diff), never the secrets
    const config = await prisma.config.findUnique({
      where: { id: "config" },
      select: enabled
        ? { stripeEnabled: true, stripeSecretKey: true, stripeWebhookSecret: true, stripePriceIds: true }
        : { stripeEnabled: true },
    })

    if (enabled) {
      const missing = getMissingStripeConfig({
        hasSecretKey: Boolean(config?.stripeSecretKey),
        hasWebhookSecret: Boolean(config?.stripeWebhookSecret),
        priceIds: parseStripePriceIds(config?.stripePriceIds),
      })

      if (missing.length > 0) {
        return fail(
          "VALIDATION",
          `Stripe cannot be enabled until it is fully configured. Missing: ${missing.join(", ")}.`
        )
      }
    }

    // Do NOT return the upserted row: the Prisma extension decrypts the Stripe
    // secret fields on read, which would leak them to the client via the Server
    // Action response.
    await prisma.config.upsert({
      where: { id: "config" },
      update: { stripeEnabled: enabled, updatedBy: userId },
      create: { id: "config", stripeEnabled: enabled, updatedBy: userId },
      select: { id: true },
    })

    logAuditEvent(
      AuditEventType.CONFIG_CHANGED,
      userId,
      configDiff("stripe.enabled", config && { stripeEnabled: config.stripeEnabled }, { stripeEnabled: enabled })
    )

    // Invalidate the offered-prices cache so enabling/disabling takes effect on
    // /subscribe immediately (a stale cache could otherwise offer prices for up
    // to the TTL after disabling).
    clearOfferedPricesCache()
    revalidatePath("/admin/settings")
    revalidatePath("/")
    return ok(null)
  },
})
