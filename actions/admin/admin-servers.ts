"use server"

/**
 * Admin settings for the connected services (Plex, Tautulli, Overseerr,
 * Sonarr, Radarr).
 *
 * Every save runs the flow setup shares (`saveServiceConnection`, P10.24):
 * a blank token or API key means "keep the stored one", but only for the
 * address it was saved with (SEC-31); the connection test runs after that
 * rule and answers with code copy on a field (P10.20); the row becomes the
 * service's one active row; and the save is audited as `CONFIG_CHANGED`
 * with a redacted diff (SEC-55). A save also expires the cached connection
 * health, and a Plex save the cached app settings (the server name falls
 * back to Plex's, P11.19). A Plex save that changes the active server
 * turns the affiliate switch off (`turnOffForServerChange`).
 *
 * Sonarr and Radarr are optional, so they can also be removed
 * (`removeArrService`); nothing else depends on them being there.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { expireTag } from "@/lib/actions/invalidate"
import { adminAction } from "@/lib/actions/define-action"
import { ok } from "@/lib/actions/result"
import { turnOffForServerChange } from "@/lib/affiliates/switch"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import { SERVICE_DESCRIPTORS, type ServiceKind } from "@/lib/services/descriptors"
import { saveServiceConnection } from "@/lib/services/service-save"
import { APP_SETTINGS_TAG } from "@/lib/settings/app-settings"
import { CONNECTION_HEALTH_TAG } from "@/lib/settings/connection-status"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("admin-servers")

/** A settings save for one service (admin only). */
function serviceUpdate<K extends ServiceKind>(kind: K, fallbackError: string) {
  return adminAction({
    input: SERVICE_DESCRIPTORS[kind].input,
    fallbackError,
    handler: async (input, { userId }) => {
      const result = await saveServiceConnection(kind, input, { actor: userId, section: kind })
      if (result.success) {
        // The settings page re-renders and the cached health checks run again
        expireTag(CONNECTION_HEALTH_TAG)
        if (kind === "plex") expireTag(APP_SETTINGS_TAG)
        // A library key can name a different library on another server. The switch
        // already reads as off on a mismatch, so a failure here does not fail the save
        if (kind === "plex") await turnOffForServerChange(userId).catch((error: unknown) => logger.error("affiliate.server_change_off_failed", error))
        revalidatePath("/admin/settings")
      }
      return result
    },
  })
}

export const updatePlexServer = serviceUpdate("plex", "Failed to update Plex server configuration")

export const updateTautulli = serviceUpdate("tautulli", "Failed to update Tautulli configuration")

export const updateOverseerr = serviceUpdate("overseerr", "Failed to update Overseerr configuration")

export const updateSonarr = serviceUpdate("sonarr", "Failed to update Sonarr configuration")

export const updateRadarr = serviceUpdate("radarr", "Failed to update Radarr configuration")

const ACTIVE = { where: { isActive: true }, orderBy: { updatedAt: "desc" } } as const

const ARR_ROWS = {
  sonarr: { active: () => prisma.sonarr.findFirst(ACTIVE), removeAll: () => prisma.sonarr.deleteMany() },
  radarr: { active: () => prisma.radarr.findFirst(ACTIVE), removeAll: () => prisma.radarr.deleteMany() },
}

/**
 * Removes the Sonarr or Radarr connection (admin only): every stored row of
 * that service, including old inactive rows and their API keys, is deleted.
 * The assistant's tools, Rewind's returning shows and Discord's media links
 * work without it. Audited as `CONFIG_CHANGED`; removing a service that is
 * not set up succeeds and writes no audit entry.
 */
export const removeArrService = adminAction({
  input: z.object({ service: z.enum(["sonarr", "radarr"]) }),
  fallbackError: "Could not remove the service",
  handler: async ({ service }, { userId }) => {
    const stored = await ARR_ROWS[service].active()
    const { count } = await ARR_ROWS[service].removeAll()
    if (count === 0) return ok(null)

    const before = stored && { name: stored.name, url: stored.url, publicUrl: stored.publicUrl, secret: stored.apiKey }
    logAuditEvent(
      AuditEventType.CONFIG_CHANGED,
      userId,
      configDiff(service, before, { name: null, url: null, publicUrl: null, secret: null }, { secretFields: ["secret"], urlFields: ["url", "publicUrl"] })
    )
    expireTag(CONNECTION_HEALTH_TAG)
    revalidatePath("/admin/settings")
    return ok(null)
  },
})
