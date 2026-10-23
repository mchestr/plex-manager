"use server"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok, type ActionResult } from "@/lib/actions/result"
import { prisma } from "@/lib/prisma"
import { APP_SETTINGS_TAG } from "@/lib/settings/app-settings"
import { CONNECTION_HEALTH_TAG } from "@/lib/settings/connection-status"
import { isRedisConfigured } from "@/lib/queue/connection"
import { parseStripePriceIds } from "@/lib/stripe/config"
import { clearOfferedPricesCache } from "@/lib/stripe/prices"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import { normalizeTimeZone } from "@/lib/utils/zoned-time"
import { revalidatePath, updateTag } from "next/cache"
import { z } from "zod"

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

/** How many names the turn-on confirmation lists; the count covers the rest. */
const JELLYFIN_CONFIRM_NAMES = 10

/**
 * Members who sign in with Jellyfin only and are neither admins, exempt nor
 * disabled: turning Stripe on asks them to subscribe. Their accounts were
 * usually made in Jellyfin itself, not through an app invite, so the owner
 * sees them first and can mark them exempt (P11.11).
 *
 * @internal
 */
async function jellyfinMembersToGate(): Promise<{ count: number; names: string[] }> {
  const where = { jellyfinUserId: { not: null }, plexUserId: null, isAdmin: false, isExempt: false, disabledAt: null }
  const [count, members] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, select: { name: true, email: true }, orderBy: { name: "asc" }, take: JELLYFIN_CONFIRM_NAMES }),
  ])
  return { count, names: members.map((member) => member.name ?? member.email ?? "Unnamed member") }
}

/** `saved`, or the confirmation step turning Stripe on waits for. */
export type StripeToggleResult =
  | { status: "saved" }
  | { status: "confirm"; jellyfinMembers: { count: number; names: string[] } }

const stripeToggleInput = z.union([
  z.boolean({ message: "Invalid input: enabled must be a boolean" }),
  z.object({ enabled: z.literal(true), confirmJellyfinMembers: z.literal(true) }),
])

/**
 * Flip the master Stripe toggle (admin only).
 *
 * Enabling is blocked (FR-3) unless Stripe is fully configured: a secret key, a
 * webhook secret, at least one price id and the job queue (`REDIS_URL`, without
 * which no webhook is ever processed) must all be present. When any are
 * missing, returns `{error}` naming what is missing and does NOT set
 * `stripeEnabled = true`. Disabling is always allowed.
 *
 * Turning Stripe on while it is off, with Jellyfin-only members who are not
 * exempt, saves nothing and returns `{ status: "confirm" }` listing them
 * ("3 Jellyfin members will be asked to subscribe"); the form confirms with
 * `{ enabled: true, confirmJellyfinMembers: true }` (P11.11).
 */
export const setStripeEnabled = adminAction({
  input: stripeToggleInput,
  fallbackError: "Failed to update Stripe configuration",
  handler: async (input, { userId }): Promise<ActionResult<StripeToggleResult>> => {
    const enabled = typeof input === "boolean" ? input : input.enabled
    const confirmed = typeof input !== "boolean"
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

      if (!config?.stripeEnabled && !confirmed) {
        const jellyfinMembers = await jellyfinMembersToGate()
        if (jellyfinMembers.count > 0) return ok({ status: "confirm", jellyfinMembers })
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
    return ok({ status: "saved" })
  },
})
