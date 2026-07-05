import { exchangeDiscordCode, fetchDiscordUserProfile, refreshDiscordToken, updateDiscordRoleConnection } from "@/lib/discord/api"
import { getDiscordBotToken } from "@/lib/discord/config"
import { computeRoleMetadata } from "@/lib/discord/role-metadata"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { getBaseUrl } from "@/lib/utils"
import { createLogger } from "@/lib/utils/logger"
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

    // Cap pending states per user: a fresh link attempt supersedes any of this
    // user's dangling un-consumed states, so they can't accumulate (each row is
    // one-shot and consumed on callback). Keeps the table bounded and prevents a
    // single user from piling up valid states.
    await tx.discordOAuthState.deleteMany({
      where: {
        userId,
        consumedAt: null,
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

  logAuditEvent(AuditEventType.DISCORD_ACCOUNT_LINKED, oauthState.userId, {
    discordUserId: profile.id,
  })

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

  const metadata = await computeRoleMetadata(user)

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
    logAuditEvent(AuditEventType.DISCORD_ACCOUNT_UNLINKED, userId, {
      source: "clear_role",
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

  // Check if user is on the Discord server (if enabled, and we have bot token +
  // guild ID). Gate on integration.isEnabled so disabling the integration in the
  // admin UI also stops this outbound Discord call (least privilege).
  // The bot token resolves from the DB row first, then env (see lib/discord/config).
  const canCheckMembership = Boolean(connection && integration?.isEnabled && integration?.guildId)
  const botToken = canCheckMembership ? await getDiscordBotToken() : undefined
  if (canCheckMembership && botToken) {
    try {
      const { checkGuildMembership } = await import("./api")
      // canCheckMembership guarantees connection + integration.guildId are set.
      isOnServer = await checkGuildMembership(
        botToken,
        integration!.guildId!,
        connection!.discordUserId
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

  // The Prisma extension DECRYPTS `clientSecret` and `botToken` on read (see
  // ENCRYPTED_FIELDS in lib/prisma.ts), so returning the row verbatim would leak
  // the plaintext secrets to any caller. Strip both and expose only
  // `hasClientSecret` / `hasBotToken` booleans — the established
  // secret-omission pattern (see admin-settings omitSecret).
  let sanitizedIntegration:
    | (Omit<NonNullable<typeof integration>, "clientSecret" | "botToken"> & {
        hasClientSecret: boolean
        hasBotToken: boolean
      })
    | null = null
  if (integration) {
    const { clientSecret, botToken, ...rest } = integration
    sanitizedIntegration = {
      ...rest,
      hasClientSecret: Boolean(clientSecret),
      hasBotToken: Boolean(botToken),
    }
  }

  return {
    integration: sanitizedIntegration,
    linkedCount,
  }
}

