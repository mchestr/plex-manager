/**
 * Core utilities and types for Jellyfin API connections
 */

import { createLogger, sanitizeUrlForLogging } from "@/lib/utils/logger"

export const logger = createLogger("JELLYFIN_CONNECTION")
export { sanitizeUrlForLogging }

/**
 * Configuration for Jellyfin API requests
 */
export interface JellyfinConfig {
  url: string
  apiKey: string
}

/**
 * Settings for creating Jellyfin users via invite
 */
export interface JellyfinInviteSettings {
  /** Library IDs to grant access to (null = all libraries) */
  libraryIds?: string[]
  /** Whether to allow content downloading */
  allowDownloads?: boolean
  /** Whether to enable remote access */
  enableRemoteAccess?: boolean
}

/**
 * Common headers for Jellyfin API requests
 */
export function getJellyfinHeaders(apiKey: string): HeadersInit {
  return {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Authorization": `MediaBrowser Token="${apiKey}"`,
  }
}

/**
 * Common headers for Jellyfin API requests with client info
 * Used for authentication requests
 */
export function getJellyfinAuthHeaders(): HeadersInit {
  const clientName = "Plex Wrapped"
  const clientVersion = "1.0.0"
  const deviceId = process.env.JELLYFIN_DEVICE_ID || "plex-wrapped-server"
  const device = "Server"

  return {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "X-Emby-Authorization": `MediaBrowser Client="${clientName}", Device="${device}", DeviceId="${deviceId}", Version="${clientVersion}"`,
  }
}
