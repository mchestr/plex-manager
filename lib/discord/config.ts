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
 */
export async function getSupportThreadIds(): Promise<string[]> {
  const row = await getRow()
  const fromDb = normalizeThreadIdJson(row?.supportThreadIds)
  if (fromDb.length > 0) return fromDb
  return parseThreadIdCsv(process.env.DISCORD_SUPPORT_THREAD_IDS)
}

/**
 * The account-linking portal URL shown in "link your account" nudges. Mirrors the
 * resolution `bot.ts` uses at startup: `DISCORD_PORTAL_URL` if set, else
 * `<base>/discord/link`. Synchronous (env-only) so nudges can build it cheaply.
 */
export function getDiscordPortalUrl(): string {
  const base =
    process.env.PLEX_WRAPPED_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  return process.env.DISCORD_PORTAL_URL || `${base}/discord/link`
}
