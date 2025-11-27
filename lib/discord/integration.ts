import { checkUserServerAccess } from "@/lib/connections/plex"
import { exchangeDiscordCode, fetchDiscordUserProfile, refreshDiscordToken, updateDiscordRoleConnection } from "@/lib/discord/api"
import { prisma } from "@/lib/prisma"
import { getBaseUrl } from "@/lib/utils"
import { createLogger } from "@/lib/utils/logger"
import { fetchTautulliStatistics } from "@/lib/wrapped/statistics"
import { randomBytes } from "crypto"

const logger = createLogger("DISCORD_INTEGRATION")
const DISCORD_REDIRECT_PATH = "/api/discord/callback"
const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

export function getDiscordRedirectUri(): string {
  return `${getBaseUrl()}${DISCORD_REDIRECT_PATH}`
}

export async function getDiscordIntegration(includeDisabled = false) {
  const integration = await prisma.discordIntegration.findUnique({
    where: { id: "discord" },
  })

  if (!integration) {
    return null
  }

  if (!includeDisabled && !integration.isEnabled) {
    return null
  }

  if (!integration.clientId || !integration.clientSecret) {
    return null
  }

  return integration
}

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

// PKCE functions - not currently used (role_connections.write scope doesn't work with PKCE)
// Kept for potential future use
// function createCodeVerifier(): string {
//   return toBase64Url(randomBytes(64))
// }

// function createCodeChallenge(verifier: string): string {
//   return toBase64Url(createHash("sha256").update(verifier).digest())
// }

function sanitizeRedirectPath(path?: string | null): string | undefined {
  if (!path) {
    return undefined
  }

  if (!path.startsWith("/")) {
    return undefined
  }

  if (path.startsWith("//")) {
    return undefined
  }

  return path === "/" ? "/" : path
}

export async function createDiscordAuthorizationUrl(userId: string, redirectTo?: string) {
  const integration = await getDiscordIntegration(true)
  if (!integration || !integration.isEnabled || !integration.clientId || !integration.clientSecret) {
    throw new Error("Discord integration is not configured")
  }

  const state = toBase64Url(randomBytes(24))
  const redirectPath = sanitizeRedirectPath(redirectTo) ?? "/"

  const expiresAt = new Date(Date.now() + STATE_TTL_MS)

  await prisma.$transaction(async (tx) => {
    // Cleanup expired states opportunistically
    await tx.discordOAuthState.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(Date.now() - 60 * 60 * 1000),
        },
      },
    })

    await tx.discordOAuthState.create({
      data: {
        userId,
        state,
        codeVerifier: "", // Not using PKCE
        redirectTo: redirectPath,
        expiresAt,
      },
    })
  })

  const authorizeUrl = new URL("https://discord.com/oauth2/authorize")
  authorizeUrl.searchParams.set("response_type", "code")
  authorizeUrl.searchParams.set("client_id", integration.clientId)
  authorizeUrl.searchParams.set("scope", "role_connections.write identify")
  authorizeUrl.searchParams.set("state", state)
  authorizeUrl.searchParams.set("redirect_uri", getDiscordRedirectUri())
  authorizeUrl.searchParams.set("prompt", "consent")

  return { url: authorizeUrl.toString(), state }
}

async function consumeOAuthState(state: string) {
  const record = await prisma.discordOAuthState.findUnique({
    where: { state },
  })

  if (!record || record.consumedAt) {
    throw new Error("Invalid or expired Discord state")
  }

  if (record.expiresAt.getTime() < Date.now()) {
    throw new Error("Discord authorization session has expired")
  }

  await prisma.discordOAuthState.update({
    where: { state },
    data: { consumedAt: new Date() },
  })

  return record
}

export async function completeDiscordLink(code: string, state: string) {
  const oauthState = await consumeOAuthState(state)
  const integration = await getDiscordIntegration(true)

  if (!integration || !integration.clientId || !integration.clientSecret) {
    throw new Error("Discord integration is not configured")
  }

  if (!integration.isEnabled) {
    throw new Error("Discord integration is disabled")
  }

  // Not using PKCE - codeVerifier is optional and not needed
  const params = {
    clientId: integration.clientId,
    clientSecret: integration.clientSecret,
    code,
    redirectUri: getDiscordRedirectUri(),
  } as const

  const tokenResponse = await exchangeDiscordCode(params as Parameters<typeof exchangeDiscordCode>[0])

  const profile = await fetchDiscordUserProfile(tokenResponse.access_token)

  const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000)

  await prisma.discordConnection.upsert({
    where: {
      userId: oauthState.userId,
    },
    update: {
      discordUserId: profile.id,
      username: profile.username,
      discriminator: profile.discriminator,
      globalName: profile.global_name,
      avatar: profile.avatar ?? undefined,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      scope: tokenResponse.scope,
      expiresAt,
      revokedAt: null,
      lastError: null,
    },
    create: {
      userId: oauthState.userId,
      discordUserId: profile.id,
      username: profile.username,
      discriminator: profile.discriminator,
      globalName: profile.global_name,
      avatar: profile.avatar ?? undefined,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      scope: tokenResponse.scope,
      expiresAt,
    },
  })

  // Only sync role connection if we have the required scope
  // Note: This will fail if role_connections.write scope is not included
  if (tokenResponse.scope?.includes("role_connections.write")) {
    try {
      await syncDiscordRoleConnection(oauthState.userId)
    } catch (error) {
      logger.error("Failed to sync Discord metadata after linking", error instanceof Error ? error : undefined, {
        userId: oauthState.userId,
      })

      await prisma.discordConnection.update({
        where: { userId: oauthState.userId },
        data: {
          lastError: error instanceof Error ? error.message : "Failed to sync Discord metadata",
        },
      })
    }
  } else {
    logger.info("Skipping role connection sync - role_connections.write scope not present", {
      userId: oauthState.userId,
      scope: tokenResponse.scope,
    })
  }

  return {
    redirectTo: oauthState.redirectTo ?? "/",
  }
}

async function ensureValidAccessToken(userId: string) {
  const integration = await getDiscordIntegration(true)
  if (!integration || !integration.clientId || !integration.clientSecret) {
    throw new Error("Discord integration is not configured")
  }

  const connection = await prisma.discordConnection.findUnique({
    where: { userId },
  })

  if (!connection || connection.revokedAt) {
    throw new Error("Discord account is not linked")
  }

  if (connection.expiresAt && connection.expiresAt.getTime() > Date.now() + 60 * 1000) {
    return { connection, integration }
  }

  if (!connection.refreshToken) {
    return { connection, integration }
  }

  try {
    const refreshed = await refreshDiscordToken({
      clientId: integration.clientId,
      clientSecret: integration.clientSecret,
      refreshToken: connection.refreshToken,
    })

    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000)

    const updated = await prisma.discordConnection.update({
      where: { userId },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? connection.refreshToken,
        scope: refreshed.scope ?? connection.scope,
        expiresAt,
      },
    })

    return { connection: updated, integration }
  } catch (error) {
    logger.error("Failed to refresh Discord token", error instanceof Error ? error : undefined, {
      userId,
    })
    throw new Error("Failed to refresh Discord access token")
  }
}

export async function syncDiscordRoleConnection(userId: string) {
  const { connection, integration } = await ensureValidAccessToken(userId)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      plexUserId: true,
    },
  })

  if (!user) {
    throw new Error("User not found")
  }

  if (!integration.clientId) {
    throw new Error("Discord integration client ID is not configured")
  }

  const platformName = integration.platformName || "Plex Wrapped"
  const platformUsername = user.name || user.email || user.plexUserId || "Plex User"

  // --- Compute real subscription + watch time metadata ---
  const metadataKey = "is_subscribed" // Hardcoded metadata key (metadataKey field was removed from schema)
  const metadata: Record<string, boolean | number> = {}

  // 1) Determine "is_subscribed" from Plex server access (same logic as admin user list)
  let resolvedSubscribed: boolean | null = null
  try {
    const plexServer = await prisma.plexServer.findFirst({
      where: { isActive: true },
    })

    if (plexServer && user.plexUserId) {
      const accessResult = await checkUserServerAccess(
        {
          url: plexServer.url,
          token: plexServer.token,
          adminPlexUserId: plexServer.adminPlexUserId,
        },
        user.plexUserId
      )

      if (accessResult.success) {
        resolvedSubscribed = accessResult.hasAccess
      }
    }
  } catch (error) {
    logger.warn("Failed to determine Plex access for Discord metadata", {
      userId,
      error: error instanceof Error ? error.message : "unknown",
    })
  }

  // If we can't determine access from Plex, treat as not subscribed
  metadata[metadataKey] = resolvedSubscribed ?? false

  // 2) Determine watched_hours from real Tautulli statistics (if configured)
  try {
    const tautulli = await prisma.tautulli.findFirst({
      where: { isActive: true },
    })

    if (tautulli && user.plexUserId) {
      const year = new Date().getFullYear()
      const stats = await fetchTautulliStatistics(
        {
          url: tautulli.url,
          apiKey: tautulli.apiKey,
        },
        user.plexUserId,
        user.email,
        year
      )

      if (stats.success && stats.data) {
        // totalWatchTime is in MINUTES – convert to integer hours
        const watchedHours = Math.floor(stats.data.totalWatchTime / 60)
        metadata["watched_hours"] = watchedHours
      }
    }
  } catch (error) {
    logger.warn("Failed to determine Tautulli watch time for Discord metadata", {
      userId,
      error: error instanceof Error ? error.message : "unknown",
    })
  }

  await updateDiscordRoleConnection({
    accessToken: connection.accessToken,
    applicationId: integration.clientId,
    platform_name: platformName,
    platform_username: platformUsername,
    metadata,
  })

  await prisma.discordConnection.update({
    where: { userId },
    data: {
      metadataSyncedAt: new Date(),
      lastError: null,
    },
  })
}

export async function clearDiscordRoleForUser(userId: string) {
  try {
    const { connection, integration } = await ensureValidAccessToken(userId)

    if (!integration.clientId) {
      throw new Error("Discord integration client ID is not configured")
    }

    await updateDiscordRoleConnection({
      accessToken: connection.accessToken,
      applicationId: integration.clientId,
      platform_name: integration.platformName || "Plex Wrapped",
      platform_username: "Unlinked",
      metadata: {},
    })
  } catch (error) {
    logger.warn("Failed to clear Discord role connection", {
      userId,
      error: error instanceof Error ? error.message : "unknown",
    })
  } finally {
    await prisma.discordConnection.deleteMany({
      where: { userId },
    })
  }
}

export async function getDiscordLinkStatus(userId: string) {
  const [integration, connection] = await Promise.all([
    getDiscordIntegration(true),
    prisma.discordConnection.findUnique({
      where: { userId },
    }),
  ])

  let isOnServer: boolean | null = null

  // Check if user is on the Discord server (if we have bot token and guild ID)
  if (connection && integration?.guildId && process.env.DISCORD_BOT_TOKEN) {
    try {
      const { checkGuildMembership } = await import("./api")
      isOnServer = await checkGuildMembership(
        process.env.DISCORD_BOT_TOKEN,
        integration.guildId,
        connection.discordUserId
      )
    } catch (error) {
      logger.warn("Failed to check Discord server membership", {
        userId,
        error: error instanceof Error ? error.message : "unknown",
      })
      // Leave as null if we can't determine
    }
  }

  return {
    isEnabled: Boolean(integration?.isEnabled && integration?.clientId && integration?.clientSecret),
    connection: connection
      ? {
          username: connection.username,
          discriminator: connection.discriminator,
          globalName: connection.globalName,
          avatar: connection.avatar,
          linkedAt: connection.linkedAt,
          metadataSyncedAt: connection.metadataSyncedAt,
          lastError: connection.lastError,
        }
      : null,
    isOnServer,
  }
}

export async function getDiscordStats() {
  const [integration, linkedCount] = await Promise.all([
    prisma.discordIntegration.findUnique({ where: { id: "discord" } }),
    prisma.discordConnection.count({
      where: { revokedAt: null },
    }),
  ])

  return {
    integration,
    linkedCount,
  }
}

