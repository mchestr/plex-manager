/**
 * Core utilities and types for Jellyfin API connections
 */

import { createHash } from "node:crypto"

import packageJson from "@/package.json"
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
  /** Whether the account is disabled (default false) */
  isDisabled?: boolean
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

/** The DeviceId sent when neither JELLYFIN_DEVICE_ID nor PLEX_CLIENT_IDENTIFIER is set. */
const FALLBACK_DEVICE_ID = "plex-manager-server"
let warnedDeviceIdFallback = false

/**
 * The DeviceId Jellyfin records for this install's sign-ins:
 * `JELLYFIN_DEVICE_ID` when set, otherwise `plex-manager-` plus the first 16
 * hex characters of the SHA-256 of `PLEX_CLIENT_IDENTIFIER`, so it is stable
 * across restarts and differs between installs.
 *
 * With neither variable set, Jellyfin sign-in still works with the fixed
 * `plex-manager-server`, and the first sign-in logs
 * `jellyfin.auth.device_id_fallback` at warn.
 */
function getJellyfinDeviceId(): string {
  const configured = process.env.JELLYFIN_DEVICE_ID
  if (configured) {
    return configured
  }
  const clientIdentifier = process.env.PLEX_CLIENT_IDENTIFIER
  if (!clientIdentifier) {
    if (!warnedDeviceIdFallback) {
      warnedDeviceIdFallback = true
      logger.warn("jellyfin.auth.device_id_fallback", { deviceId: FALLBACK_DEVICE_ID })
    }
    return FALLBACK_DEVICE_ID
  }
  const digest = createHash("sha256").update(clientIdentifier).digest("hex")
  return `plex-manager-${digest.slice(0, 16)}`
}

/**
 * The `MediaBrowser` client description for sign-in requests, built the way
 * `@jellyfin/sdk` builds it: each value `encodeURIComponent`-encoded inside
 * quotes. `accessToken` adds `Token="..."`, which a logout needs.
 */
function getMediaBrowserAuthorization(accessToken?: string): string {
  const params: Array<[string, string]> = [
    ["Client", "Plex Manager"],
    ["Device", "Server"],
    ["DeviceId", getJellyfinDeviceId()],
    ["Version", packageJson.version],
  ]
  if (accessToken) {
    params.push(["Token", accessToken])
  }
  return `MediaBrowser ${params.map(([key, value]) => `${key}="${encodeURIComponent(value)}"`).join(", ")}`
}

/**
 * Headers for user sign-in (`/Users/AuthenticateByName`) and its logout.
 *
 * The client description goes in `Authorization`. Jellyfin 12.0 reads the
 * legacy `X-Emby-Authorization` header only when the server's
 * EnableLegacyAuthorization option is on, which is off by default.
 */
export function getJellyfinAuthHeaders(accessToken?: string): HeadersInit {
  return {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Authorization": getMediaBrowserAuthorization(accessToken),
  }
}

/**
 * The same client description in the legacy `X-Emby-Authorization` header,
 * for servers that answer the `Authorization` header with 400.
 */
export function getLegacyJellyfinAuthHeaders(accessToken?: string): HeadersInit {
  return {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "X-Emby-Authorization": getMediaBrowserAuthorization(accessToken),
  }
}
