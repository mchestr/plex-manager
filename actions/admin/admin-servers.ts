"use server"

/**
 * Admin settings for the connected services (Plex, Jellyfin, Tautulli,
 * Overseerr, Sonarr, Radarr, Prometheus).
 *
 * Every save runs the flow setup shares (`saveServiceConnection`, P10.24):
 * a blank token or API key means "keep the stored one", but only for the
 * address it was saved with (SEC-31); the connection test runs after that
 * rule and answers with code copy on a field (P10.20); the row becomes the
 * service's one active row; and the save is audited as `CONFIG_CHANGED`
 * with a redacted diff (SEC-55). A save also expires the cached connection
 * health, a Plex or Jellyfin save the cached app settings (the server name
 * falls back to theirs) and a Prometheus save the cached status (P11.19).
 */

import { revalidatePath, updateTag } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { ok } from "@/lib/actions/result"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import { SERVICE_DESCRIPTORS, type ServiceKind } from "@/lib/services/descriptors"
import { saveServiceConnection } from "@/lib/services/service-save"
import { APP_SETTINGS_TAG } from "@/lib/settings/app-settings"
import { CONNECTION_HEALTH_TAG, PROMETHEUS_STATUS_TAG } from "@/lib/settings/connection-status"

/** A settings save for one service (admin only). */
function serviceUpdate<K extends ServiceKind>(kind: K, fallbackError: string) {
  return adminAction({
    input: SERVICE_DESCRIPTORS[kind].input,
    fallbackError,
    handler: async (input, { userId }) => {
      const result = await saveServiceConnection(kind, input, { actor: userId, section: kind })
      if (result.success) {
        // The settings page re-renders and the cached health checks run again
        updateTag(CONNECTION_HEALTH_TAG)
        if (kind === "plex" || kind === "jellyfin") updateTag(APP_SETTINGS_TAG)
        if (kind === "prometheus") updateTag(PROMETHEUS_STATUS_TAG)
        revalidatePath("/admin/settings")
        if (kind === "prometheus") revalidatePath("/") // The home page shows the status
      }
      return result
    },
  })
}

export const updatePlexServer = serviceUpdate("plex", "Failed to update Plex server configuration")

export const updateJellyfinServer = serviceUpdate("jellyfin", "Failed to update Jellyfin server configuration")

export const updateTautulli = serviceUpdate("tautulli", "Failed to update Tautulli configuration")

export const updateOverseerr = serviceUpdate("overseerr", "Failed to update Overseerr configuration")

export const updateSonarr = serviceUpdate("sonarr", "Failed to update Sonarr configuration")

export const updateRadarr = serviceUpdate("radarr", "Failed to update Radarr configuration")

export const updatePrometheus = serviceUpdate("prometheus", "Failed to update Prometheus configuration")

/**
 * Allow Jellyfin sign-in, or turn it off (admin only)
 * When off, the Jellyfin provider refuses every sign-in and the home page
 * shows no Jellyfin login option
 */
export const toggleJellyfinLogin = adminAction({
  input: z.boolean({ message: "Invalid input: enabled must be a boolean" }),
  fallbackError: "Failed to toggle Jellyfin login setting",
  handler: async (enabled, { userId }) => {
    const stored = await prisma.jellyfinServer.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
      select: { enabledForLogin: true },
    })
    await prisma.jellyfinServer.updateMany({
      where: { isActive: true },
      data: { enabledForLogin: enabled },
    })

    logAuditEvent(
      AuditEventType.CONFIG_CHANGED,
      userId,
      configDiff("jellyfin.login", stored, { enabledForLogin: enabled })
    )
    revalidatePath("/admin/settings")
    revalidatePath("/")
    return ok(null)
  },
})
