"use server"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { getConfig } from "./admin-config"

/**
 * Get all admin settings (admin only)
 */
export async function getAdminSettings() {
  await requireAdmin()

  const [
    config,
    chatLLMProvider,
    wrappedLLMProvider,
    plexServer,
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
    prisma.tautulli.findFirst({ where: { isActive: true } }),
    prisma.overseerr.findFirst({ where: { isActive: true } }),
    prisma.sonarr.findFirst({ where: { isActive: true } }),
    prisma.radarr.findFirst({ where: { isActive: true } }),
    prisma.prometheus.findFirst({ where: { isActive: true } }),
    prisma.discordIntegration.findUnique({ where: { id: "discord" } }),
    prisma.discordConnection.count({ where: { revokedAt: null } }),
  ])

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
    prometheus,
    discordIntegration,
    discordLinkedCount,
  }
}
