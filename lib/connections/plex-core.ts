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

export interface PlexServerUser {
  id: string
  name: string
  email?: string
  thumb?: string
  restricted: boolean
  serverAdmin: boolean
}

export interface PlexUserServer {
  machineIdentifier: string
}

export interface PlexUser {
  id: string
  username: string
  email?: string
  thumb?: string
  servers: PlexUserServer[]
}

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

// XML parsing types
export interface ParsedXmlUser {
  "@_id": string
  "@_username"?: string
  "@_name"?: string
  "@_email"?: string
  "@_thumb"?: string
  Server?: ParsedXmlServer | ParsedXmlServer[]
}

export interface ParsedXmlServer {
  "@_machineIdentifier": string
}

export interface ParsedXmlUsersResponse {
  MediaContainer?: {
    User?: ParsedXmlUser | ParsedXmlUser[]
  }
}

export interface ParsedXmlServerUser {
  "@_id": string
  "@_title"?: string
  "@_name"?: string
  "@_username"?: string
  "@_email"?: string
  "@_thumb"?: string
  "@_restricted"?: string
  "@_serverAdmin"?: string
}

export interface ParsedXmlServerUsersResponse {
  MediaContainer?: {
    User?: ParsedXmlServerUser | ParsedXmlServerUser[]
    Account?: ParsedXmlServerUser | ParsedXmlServerUser[]
  }
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
