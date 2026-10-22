"use server"

import { requireAdmin } from "@/lib/admin"
import { llmKeyDestination } from "@/lib/llm/provider-presets"
import { prisma } from "@/lib/prisma"
import type { SavedSecret } from "@/lib/security/saved-secret"
import { describeSecret } from "@/lib/security/secret-reuse"
import { getConfig } from "./admin-config"

/**
 * Replaces a row's decrypted secret with what the form may know about it:
 * `secret: { last4, origin } | null` (`describeSecret`, SEC-31).
 *
 * The Prisma extension decrypts secret columns (API keys, tokens) on read, so
 * returning a row verbatim from this Server Action would leak the plaintext
 * into the RSC payload sent to the settings forms. `destination` gives the
 * address the secret may be sent to, whose origin `SecretInput` compares with
 * the URL being typed.
 *
 * @internal
 */
function omitSecret<T extends Record<string, unknown>, K extends keyof T>(
  row: T | null,
  secretField: K,
  destination: (row: T) => string | null
): (Omit<T, K> & { secret: SavedSecret | null }) | null {
  if (!row) return null
  const { [secretField]: secret, ...rest } = row
  return { ...rest, secret: describeSecret(typeof secret === "string" ? secret : null, destination(row)) }
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
  await requireAdmin()

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

  const sanitizedChatLLMProvider = omitSecret(chatLLMProvider, "apiKey", llmDestination)
  const sanitizedWrappedLLMProvider = omitSecret(wrappedLLMProvider, "apiKey", llmDestination)

  // Both Discord secrets go only to Discord (a fixed destination), so neither
  // carries an origin. The support channel and threads are not secret.
  const sanitizedDiscordIntegration = discordIntegration
    ? (() => {
        const { clientSecret, botToken, ...rest } = discordIntegration
        return { ...rest, secrets: { clientSecret: describeSecret(clientSecret), botToken: describeSecret(botToken) } }
      })()
    : null

  return {
    config,
    chatLLMProvider: sanitizedChatLLMProvider,
    wrappedLLMProvider: sanitizedWrappedLLMProvider,
    // Keep llmProvider for backward compatibility (returns wrapped provider)
    llmProvider: sanitizedWrappedLLMProvider,
    plexServer: omitSecret(plexServer, "token", serverUrl),
    jellyfinServer: omitSecret(jellyfinServer, "apiKey", serverUrl),
    tautulli: omitSecret(tautulli, "apiKey", serverUrl),
    overseerr: omitSecret(overseerr, "apiKey", serverUrl),
    sonarr: omitSecret(sonarr, "apiKey", serverUrl),
    radarr: omitSecret(radarr, "apiKey", serverUrl),
    prometheus,
    discordIntegration: sanitizedDiscordIntegration,
    discordLinkedCount,
  }
}
