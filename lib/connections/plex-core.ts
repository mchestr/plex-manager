/**
 * Core utilities and types for Plex API connections
 */

import { createLogger, sanitizeUrlForLogging } from "@/lib/utils/logger"

export const logger = createLogger("PLEX_CONNECTION")
export { sanitizeUrlForLogging }

export interface PlexUserInfo {
  id: string
  username: string
  email: string
  thumb?: string
}

/** A user with an accepted or pending share of this server, or one of the owner's managed users. */
export interface PlexServerUser {
  id: string
  name: string
  email?: string
  thumb?: string
  restricted: boolean
  /** A Plex Home managed user: no plex.tv account and no email. */
  managed: boolean
  /** Invited but not accepted yet: no access until they accept. */
  pending: boolean
}

export type { PlexTvUser as PlexUser } from "./plex-tv-users"

export interface PlexMediaItem {
  ratingKey: string
  title: string
  type: string
  year?: number
  parentTitle?: string
  grandparentTitle?: string
  index?: number
  parentIndex?: number
  thumb?: string
  viewCount?: number
  lastViewedAt?: number
}

export interface InviteSettings {
  librarySectionIds?: number[] // If undefined/null, all libraries are shared
  allowDownloads?: boolean // Default: false
}

/**
 * Get client identifier from environment
 */
export function getClientIdentifier(): string {
  const clientId = process.env.PLEX_CLIENT_IDENTIFIER
  if (!clientId) {
    throw new Error("PLEX_CLIENT_IDENTIFIER is not set in environment variables")
  }
  return clientId
}
