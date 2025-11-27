import { createLogger } from "@/lib/utils/logger"

const DISCORD_API_BASE = "https://discord.com/api"
const logger = createLogger("DISCORD_API")

export interface DiscordTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
}

export interface DiscordUserProfile {
  id: string
  username: string
  discriminator?: string
  global_name?: string
  avatar?: string | null
}

interface TokenExchangeParams {
  clientId: string
  clientSecret: string
  code: string
  redirectUri: string
  codeVerifier?: string
}

export async function exchangeDiscordCode({
  clientId,
  clientSecret,
  code,
  redirectUri,
  codeVerifier,
}: TokenExchangeParams): Promise<DiscordTokenResponse> {
  const payload = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  })

  // Only include code_verifier if PKCE is being used
  if (codeVerifier) {
    payload.set("code_verifier", codeVerifier)
  }

  const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    let errorMessage = "Unable to exchange Discord authorization code"

    try {
      const errorJson = JSON.parse(errorText)
      if (errorJson.error_description) {
        errorMessage = errorJson.error_description
      } else if (errorJson.error) {
        errorMessage = errorJson.error
      }
    } catch {
      // If parsing fails, use the raw error text if available
      if (errorText) {
        errorMessage = errorText
      }
    }

    logger.error("Discord token exchange failed", undefined, {
      status: response.status,
      body: errorText,
    })
    throw new Error(errorMessage)
  }

  return (await response.json()) as DiscordTokenResponse
}

interface RefreshParams {
  clientId: string
  clientSecret: string
  refreshToken: string
}

export async function refreshDiscordToken({
  clientId,
  clientSecret,
  refreshToken,
}: RefreshParams): Promise<DiscordTokenResponse> {
  const payload = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  })

  const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    logger.error("Discord token refresh failed", undefined, {
      status: response.status,
      body: errorText,
    })
    throw new Error("Unable to refresh Discord access token")
  }

  return (await response.json()) as DiscordTokenResponse
}

export async function fetchDiscordUserProfile(accessToken: string): Promise<DiscordUserProfile> {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    logger.error("Failed to fetch Discord user profile", undefined, {
      status: response.status,
      body: errorText,
    })
    throw new Error("Unable to fetch Discord user profile")
  }

  return (await response.json()) as DiscordUserProfile
}

export interface RoleConnectionPayload {
  platform_name: string
  platform_username: string
  metadata: Record<string, number | string | boolean>
}

interface RoleConnectionParams extends RoleConnectionPayload {
  accessToken: string
  applicationId: string
}

export interface RoleConnectionMetadata {
  type: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 // See Discord docs for types
  key: string
  name: string
  name_localizations?: Record<string, string>
  description: string
  description_localizations?: Record<string, string>
}

/**
 * Fetch the current role connection metadata schema for your application.
 * Requires a bot token (not OAuth token).
 *
 * @param botToken - Your Discord bot token
 * @param applicationId - Your Discord application ID (same as client ID)
 * @returns Array of currently registered metadata fields, or empty array if none
 */
export async function getRoleConnectionMetadata(
  botToken: string,
  applicationId: string,
): Promise<RoleConnectionMetadata[]> {
  const response = await fetch(`${DISCORD_API_BASE}/applications/${applicationId}/role-connections/metadata`, {
    method: "GET",
    headers: {
      Authorization: `Bot ${botToken}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    if (response.status === 404) {
      // No metadata registered yet
      return []
    }
    logger.error("Failed to fetch Discord role connection metadata", undefined, {
      status: response.status,
      body: errorText,
    })
    throw new Error("Unable to fetch Discord role connection metadata schema")
  }

  return (await response.json()) as RoleConnectionMetadata[]
}

/**
 * Register role connection metadata schema for your application.
 * This MUST be called before you can use the role_connections.write scope.
 * Requires a bot token (not OAuth token).
 *
 * @param botToken - Your Discord bot token
 * @param applicationId - Your Discord application ID (same as client ID)
 * @param metadata - Array of metadata fields to register
 */
export async function registerRoleConnectionMetadata(
  botToken: string,
  applicationId: string,
  metadata: RoleConnectionMetadata[],
): Promise<void> {
  const response = await fetch(`${DISCORD_API_BASE}/applications/${applicationId}/role-connections/metadata`, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    logger.error("Failed to register Discord role connection metadata", undefined, {
      status: response.status,
      body: errorText,
    })
    throw new Error("Unable to register Discord role connection metadata schema")
  }
}

export async function updateDiscordRoleConnection({
  accessToken,
  applicationId,
  platform_name,
  platform_username,
  metadata,
}: RoleConnectionParams): Promise<void> {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me/applications/${applicationId}/role-connection`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      platform_name,
      platform_username,
      metadata,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    logger.error("Failed to update Discord role connection", undefined, {
      status: response.status,
      body: errorText,
    })
    throw new Error("Unable to update Discord linked role metadata")
  }
}

/**
 * Check if a Discord user is a member of a specific guild (server)
 * Requires a bot token with appropriate permissions
 *
 * @param botToken - Your Discord bot token
 * @param guildId - The Discord server (guild) ID
 * @param userId - The Discord user ID to check
 * @returns True if user is a member, false otherwise
 */
export async function checkGuildMembership(
  botToken: string,
  guildId: string,
  userId: string
): Promise<boolean> {
  try {
    const response = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}`, {
      method: "GET",
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    })

    if (response.status === 404) {
      // User is not a member of the guild
      return false
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "")
      logger.error("Failed to check Discord guild membership", undefined, {
        status: response.status,
        body: errorText,
        guildId,
        userId,
      })
      // If we can't determine, assume false to be safe
      return false
    }

    // User is a member (200 OK)
    return true
  } catch (error) {
    logger.error("Error checking Discord guild membership", error instanceof Error ? error : undefined, {
      guildId,
      userId,
    })
    // If we can't determine, assume false to be safe
    return false
  }
}

