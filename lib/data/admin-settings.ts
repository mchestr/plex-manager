/**
 * The settings page's reads (P11.5, BP-06): server-only, each admin-checked
 * next to its data. None returns a stored secret: secrets come back as their
 * last four and the origin they may go to (`describeSecret`, SEC-31).
 *
 * @module lib/data/admin-settings
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { Prisma } from "@/lib/generated/prisma/client"
import { llmKeyDestination } from "@/lib/llm/provider-presets"
import { prisma } from "@/lib/prisma"
import { isRedisConfigured } from "@/lib/queue/connection"
import type { SavedSecret } from "@/lib/security/saved-secret"
import { describeSecret } from "@/lib/security/secret-reuse"
import { isUnreadable } from "@/lib/security/unreadable-secrets"
import { parseStripeLibrarySectionIds, parseStripePriceIds } from "@/lib/stripe/config"
import { createLogger } from "@/lib/utils/logger"
import { REWIND_SETTINGS_SELECT } from "@/lib/wrapped/config"
import { DEFAULT_SEASON } from "@/lib/wrapped/season"
import type { StripeConfigStatus } from "@/types/admin"

const logger = createLogger("ADMIN_SETTINGS")

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
 *
 * @internal
 */
export async function getConfig() {
  await assertAdmin()

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
 * Get the non-secret Stripe configuration status for the UI (admin only).
 *
 * Returns only booleans and the list of configured price ids — never the raw
 * secret key or webhook secret — so client components cannot receive secrets.
 */
export async function getStripeConfig(): Promise<StripeConfigStatus> {
  await assertAdmin()

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
      saved: {
        secretKey: describeSecret(config.stripeSecretKey, undefined, isUnreadable("Config", "stripeSecretKey", "config")),
        webhookSecret: describeSecret(config.stripeWebhookSecret, undefined, isUnreadable("Config", "stripeWebhookSecret", "config")),
      },
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
 * Replaces a row's decrypted secret with what the form may know about it:
 * `secret: { last4, origin } | null` (`describeSecret`, SEC-31).
 *
 * The Prisma extension decrypts secret columns (API keys, tokens) on read, so
 * returning a row verbatim from this loader would leak the plaintext
 * into the RSC payload sent to the settings forms. `destination` gives the
 * address the secret may be sent to, whose origin `SecretInput` compares with
 * the URL being typed. A secret the current encryption key cannot read comes
 * back as `{ unreadable: true }`, so the form asks for it again (P11.1).
 *
 * @internal
 */
function omitSecret<T extends Record<string, unknown> & { id: string }, K extends keyof T & string>(
  model: string,
  row: T | null,
  secretField: K,
  destination: (row: T) => string | null
): (Omit<T, K> & { secret: SavedSecret | null }) | null {
  if (!row) return null
  const { [secretField]: secret, ...rest } = row
  const unreadable = isUnreadable(model, secretField, row.id)
  return { ...rest, secret: describeSecret(typeof secret === "string" ? secret : null, destination(row), unreadable) }
}

const serverUrl = (row: { url: string }) => row.url
const llmDestination = (row: { provider: string; baseUrl: string | null }) => llmKeyDestination(row.provider, row.baseUrl)

/**
 * Get all admin settings (admin only).
 *
 * Never returns raw secrets (server tokens/API keys, LLM API keys, the Discord
 * client secret and bot token). Each one is replaced by its last four and the
 * origin it may be sent to (see {@link omitSecret}), so `SecretInput` can show
 * that one is saved without receiving its value.
 */
export async function getAdminSettings() {
  await assertAdmin()

  const [
    config,
    chatLLMProvider,
    wrappedLLMProvider,
    plexServer,
    jellyfinServer,
    tautulli,
    overseerr,
    sonarr,
    radarr,
    prometheus,
    discordIntegration,
    discordLinkedCount,
  ] = await Promise.all([
    getConfig(),
    prisma.lLMProvider.findFirst({ where: { isActive: true, purpose: "chat" } }),
    prisma.lLMProvider.findFirst({ where: { isActive: true, purpose: "wrapped" } }),
    prisma.plexServer.findFirst({ where: { isActive: true } }),
    prisma.jellyfinServer.findFirst({ where: { isActive: true } }),
    prisma.tautulli.findFirst({ where: { isActive: true } }),
    prisma.overseerr.findFirst({ where: { isActive: true } }),
    prisma.sonarr.findFirst({ where: { isActive: true } }),
    prisma.radarr.findFirst({ where: { isActive: true } }),
    prisma.prometheus.findFirst({ where: { isActive: true } }),
    prisma.discordIntegration.findUnique({ where: { id: "discord" } }),
    prisma.discordConnection.count({ where: { revokedAt: null } }),
  ])

  const sanitizedChatLLMProvider = omitSecret("LLMProvider", chatLLMProvider, "apiKey", llmDestination)
  const sanitizedWrappedLLMProvider = omitSecret("LLMProvider", wrappedLLMProvider, "apiKey", llmDestination)

  // Both Discord secrets go only to Discord (a fixed destination), so neither
  // carries an origin. The support channel and threads are not secret.
  const sanitizedDiscordIntegration = discordIntegration
    ? (() => {
        const { clientSecret, botToken, ...rest } = discordIntegration
        const unreadable = (field: string) => isUnreadable("DiscordIntegration", field, discordIntegration.id)
        return {
          ...rest,
          secrets: {
            clientSecret: describeSecret(clientSecret, undefined, unreadable("clientSecret")),
            botToken: describeSecret(botToken, undefined, unreadable("botToken")),
          },
        }
      })()
    : null

  return {
    config,
    chatLLMProvider: sanitizedChatLLMProvider,
    wrappedLLMProvider: sanitizedWrappedLLMProvider,
    // Keep llmProvider for backward compatibility (returns wrapped provider)
    llmProvider: sanitizedWrappedLLMProvider,
    plexServer: omitSecret("PlexServer", plexServer, "token", serverUrl),
    jellyfinServer: omitSecret("JellyfinServer", jellyfinServer, "apiKey", serverUrl),
    tautulli: omitSecret("Tautulli", tautulli, "apiKey", serverUrl),
    overseerr: omitSecret("Overseerr", overseerr, "apiKey", serverUrl),
    sonarr: omitSecret("Sonarr", sonarr, "apiKey", serverUrl),
    radarr: omitSecret("Radarr", radarr, "apiKey", serverUrl),
    prometheus,
    discordIntegration: sanitizedDiscordIntegration,
    discordLinkedCount,
  }
}
