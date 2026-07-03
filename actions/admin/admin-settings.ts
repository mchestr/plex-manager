"use server"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { getConfig } from "./admin-config"

/**
 * Removes a decrypted secret field from a row and replaces it with a
 * `has<Field>` boolean.
 *
 * The Prisma extension decrypts secret columns (API keys, tokens, client
 * secrets) on read, so returning a row verbatim from this Server Action would
 * leak the plaintext secret into the RSC payload sent to the client settings
 * forms. The admin UI only needs to know whether a secret is set (to render a
 * "leave blank to keep current value" field), never the value itself.
 *
 * @internal
 */
function omitSecret<T extends Record<string, unknown>, K extends keyof T, F extends string>(
  row: T | null,
  secretField: K,
  flag: F,
): (Omit<T, K> & { [P in F]: boolean }) | null {
  if (!row) return null
  const { [secretField]: secret, ...rest } = row
  return { ...rest, [flag]: Boolean(secret) } as Omit<T, K> & { [P in F]: boolean }
}

/**
 * Get all admin settings (admin only).
 *
 * Never returns raw secrets (server tokens/API keys, LLM API keys, the Discord
 * client secret). Each secret-bearing row has its secret stripped and replaced
 * with a `has*` boolean (see {@link omitSecret}) so client settings forms can
 * indicate a secret is configured without receiving its value.
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

  const sanitizedChatLLMProvider = omitSecret(chatLLMProvider, "apiKey", "hasApiKey")
  const sanitizedWrappedLLMProvider = omitSecret(wrappedLLMProvider, "apiKey", "hasApiKey")

  return {
    config,
    chatLLMProvider: sanitizedChatLLMProvider,
    wrappedLLMProvider: sanitizedWrappedLLMProvider,
    // Keep llmProvider for backward compatibility (returns wrapped provider)
    llmProvider: sanitizedWrappedLLMProvider,
    plexServer: omitSecret(plexServer, "token", "hasToken"),
    jellyfinServer: omitSecret(jellyfinServer, "apiKey", "hasApiKey"),
    tautulli: omitSecret(tautulli, "apiKey", "hasApiKey"),
    overseerr: omitSecret(overseerr, "apiKey", "hasApiKey"),
    sonarr: omitSecret(sonarr, "apiKey", "hasApiKey"),
    radarr: omitSecret(radarr, "apiKey", "hasApiKey"),
    prometheus,
    discordIntegration: omitSecret(discordIntegration, "clientSecret", "hasClientSecret"),
    discordLinkedCount,
  }
}
