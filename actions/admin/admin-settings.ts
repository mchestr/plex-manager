"use server"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import {
  toLegacyPlexServer,
  toLegacyApiKeyService,
  toLegacyLLMProvider,
  toLegacyDiscordIntegration,
  getActivePlexService,
  getActiveTautulliService,
  getActiveOverseerrService,
  getActiveSonarrService,
  getActiveRadarrService,
  getActiveLLMProvider,
  getDiscordService,
} from "@/lib/services/service-helpers"
import { getConfig } from "./admin-config"

/**
 * Get all admin settings (admin only)
 * Returns settings in legacy format for backwards compatibility with existing UI
 */
export async function getAdminSettings() {
  await requireAdmin()

  const [
    config,
    chatLLMProviderService,
    wrappedLLMProviderService,
    plexService,
    tautulliService,
    overseerrService,
    sonarrService,
    radarrService,
    discordService,
    discordLinkedCount,
  ] = await Promise.all([
    getConfig(),
    getActiveLLMProvider("chat"),
    getActiveLLMProvider("wrapped"),
    getActivePlexService(),
    getActiveTautulliService(),
    getActiveOverseerrService(),
    getActiveSonarrService(),
    getActiveRadarrService(),
    getDiscordService(),
    prisma.discordConnection.count({ where: { revokedAt: null } }),
  ])

  // Convert to legacy format for backwards compatibility
  const chatLLMProvider = toLegacyLLMProvider(chatLLMProviderService)
  const wrappedLLMProvider = toLegacyLLMProvider(wrappedLLMProviderService)
  const plexServer = toLegacyPlexServer(plexService)
  const tautulli = toLegacyApiKeyService(tautulliService)
  const overseerr = toLegacyApiKeyService(overseerrService)
  const sonarr = toLegacyApiKeyService(sonarrService)
  const radarr = toLegacyApiKeyService(radarrService)
  const discordIntegration = toLegacyDiscordIntegration(discordService)

  return {
    config,
    chatLLMProvider,
    wrappedLLMProvider,
    // Keep llmProvider for backward compatibility (returns wrapped provider)
    llmProvider: wrappedLLMProvider,
    plexServer,
    tautulli,
    overseerr,
    sonarr,
    radarr,
    discordIntegration,
    discordLinkedCount,
  }
}
