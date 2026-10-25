/**
 * # Discord runtime-config resolver
 *
 * Single source of truth for the Discord bot's runtime secrets and support
 * channel/thread configuration. Each getter prefers the value stored on the
 * `DiscordIntegration` DB row and falls back to the historical `process.env`
 * variable so existing deployments keep working after migration (NFR-5).
 *
 * The bot token is stored encrypted on the row (see `ENCRYPTED_FIELDS` in
 * `lib/prisma.ts`); the Prisma read extension transparently decrypts it, so
 * callers here receive plaintext. Channel/thread IDs are non-secret and stored
 * plaintext.
 *
 * These are intentionally small, side-effect-free reads so they stay easy to
 * test. Step 18's rotation-bounce reads `configVersion` from the same row.
 */

import { getBaseUrl } from "@/lib/env"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("discord-config")

/**
 * Loads the DiscordIntegration row (or null). Kept private so the getters share
 * a single query shape; callers that need multiple values should read the row
 * once themselves rather than calling several getters in a row.
 *
 * @internal
 */
async function getRow() {
  return prisma.discordIntegration.findUnique({ where: { id: "discord" } })
}

/**
 * Splits a comma-separated env string (e.g. "111,222") into a trimmed,
 * non-empty string array. Returns [] for empty/undefined input.
 *
 * @internal
 */
function parseThreadIdCsv(value: string | undefined | null): string[] {
  if (!value) return []
  return value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
}

/**
 * Normalizes the stored `supportThreadIds` JSON column into a string array.
 * The column is `Json?`, so guard for the array-of-strings shape.
 *
 * @internal
 */
function normalizeThreadIdJson(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
}

/**
 * Resolves the Discord bot token: DB `botToken` (decrypted) ?? env
 * `DISCORD_BOT_TOKEN`. Returns undefined when neither is set.
 */
export async function getDiscordBotToken(): Promise<string | undefined> {
  const row = await getRow()
  if (row?.botToken) return row.botToken
  if (process.env.DISCORD_BOT_TOKEN) {
    // Surface the env fallback so a stray/rotated-away-from env var silently
    // reactivating the bot (e.g. after a bad restore) is easy to spot in logs.
    logger.warn("Using DISCORD_BOT_TOKEN from env fallback; no botToken on the DiscordIntegration row")
    return process.env.DISCORD_BOT_TOKEN
  }
  return undefined
}

/**
 * Resolves the support channel id: DB `supportChannelId` ?? env
 * `DISCORD_SUPPORT_CHANNEL_ID`. Returns undefined when neither is set.
 */
export async function getSupportChannelId(): Promise<string | undefined> {
  const row = await getRow()
  return row?.supportChannelId ?? process.env.DISCORD_SUPPORT_CHANNEL_ID ?? undefined
}

/**
 * Resolves the support thread ids as a string array. Prefers the DB
 * `supportThreadIds` JSON column when present and non-empty, otherwise falls
 * back to the comma-separated env `DISCORD_SUPPORT_THREAD_IDS`.
 *
 * @internal
 */
export async function getSupportThreadIds(): Promise<string[]> {
  const row = await getRow()
  const fromDb = normalizeThreadIdJson(row?.supportThreadIds)
  if (fromDb.length > 0) return fromDb
  return parseThreadIdCsv(process.env.DISCORD_SUPPORT_THREAD_IDS)
}

/**
 * The app's base URL for links in bot replies, without a trailing slash:
 * `PLEX_WRAPPED_BASE_URL`, else {@link getBaseUrl} (`NEXT_PUBLIC_APP_URL`, then
 * `NEXTAUTH_URL`), so a domain move needs no Discord-only variable. Env-only.
 */
function appBaseUrl(): string {
  return (process.env.PLEX_WRAPPED_BASE_URL || getBaseUrl()).replace(/\/$/, "")
}

/**
 * The account-linking portal URL shown in "link your account" nudges. Mirrors the
 * resolution `bot.ts` uses at startup: `DISCORD_PORTAL_URL` if set, else
 * `<base>/discord/link`. Synchronous (env-only) so nudges can build it cheaply.
 */
export function getDiscordPortalUrl(): string {
  return process.env.DISCORD_PORTAL_URL || `${appBaseUrl()}/discord/link`
}

/** The member's account page, where they delete marks and download their data (P11.15). */
export function getAccountUrl(): string {
  return `${appBaseUrl()}/account`
}

/**
 * Whether the Discord bot is switched on (`DiscordIntegration.botEnabled`).
 * The bot runs under the `discord-bot` lease (`lib/locks/`). A failed read
 * counts as off.
 */
export async function isDiscordBotEnabled(): Promise<boolean> {
  try {
    const integration = await prisma.discordIntegration.findUnique({
      where: { id: "discord" },
      select: { botEnabled: true },
    })
    return integration?.botEnabled ?? false
  } catch (error) {
    logger.debug("Error checking if the Discord bot is enabled", { error })
    return false
  }
}

/** The stored bot token and application id, for `scripts/register-discord-commands.ts`. */
export async function getStoredBotCredentials(): Promise<{ token?: string; clientId?: string }> {
  const row = await getRow()
  return { token: row?.botToken ?? undefined, clientId: row?.clientId ?? undefined }
}

type BotReadiness = "waiting_for_enable" | "waiting_for_token" | "ready"

const READINESS_WARN_INTERVAL_MS = 60_000
let lastReadiness: BotReadiness | undefined
let lastReadinessWarnAt = Number.NEGATIVE_INFINITY

/**
 * Whether this process should run the bot now (GAP-12): "Bot enabled" is on
 * and a token exists, stored or in `DISCORD_BOT_TOKEN`. The bot's lease poller
 * calls it on every tick, so turning the bot on or saving a token takes effect
 * within one poll, with no restart. Each change of state is logged at info
 * (`discord.waiting_for_enable`, `discord.waiting_for_token`, `discord.ready`).
 *
 * A database error answers false for that tick only, warning at most once a
 * minute; the next tick reads again.
 */
export async function isDiscordBotReady(): Promise<boolean> {
  let row: { botEnabled: boolean; botToken: string | null } | null
  try {
    row = await prisma.discordIntegration.findUnique({
      where: { id: "discord" },
      select: { botEnabled: true, botToken: true },
    })
  } catch (error) {
    const now = Date.now()
    if (now - lastReadinessWarnAt >= READINESS_WARN_INTERVAL_MS) {
      lastReadinessWarnAt = now
      logger.warn("discord.readiness_check_failed", { error })
    }
    return false
  }

  const readiness: BotReadiness = !row?.botEnabled
    ? "waiting_for_enable"
    : row.botToken || process.env.DISCORD_BOT_TOKEN
      ? "ready"
      : "waiting_for_token"
  if (readiness !== lastReadiness) {
    lastReadiness = readiness
    logger.info(`discord.${readiness}`)
  }
  return readiness === "ready"
}
