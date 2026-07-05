"use server"

import { requireAdmin } from "@/lib/admin"
import { authOptions } from "@/lib/auth"
import { clearDiscordRoleForUser, syncDiscordRoleConnection } from "@/lib/discord/integration"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"
import { discordIntegrationSchema } from "@/lib/validations/discord"
import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

const logger = createLogger("DISCORD_ACTIONS")

/**
 * Non-secret Discord integration fields compared in the audit diff. The two
 * secret fields (`clientSecret`, `botToken`) are handled separately and only
 * ever recorded as booleans — their values are NEVER logged.
 */
const AUDITED_CONFIG_FIELDS = [
  "isEnabled",
  "botEnabled",
  "clientId",
  "supportChannelId",
  "guildId",
  "serverInviteCode",
  "platformName",
  "instructions",
] as const

export async function updateDiscordIntegrationSettings(data: Record<string, unknown>) {
  const session = await requireAdmin()

  try {
    const parsed = discordIntegrationSchema.parse(data)
    const isEnabled = parsed.isEnabled ?? false
    const botEnabled = parsed.botEnabled ?? false

    // Secrets (client secret + bot token) are never sent to the client; a blank
    // value means "keep the currently-stored secret". Resolve each against the
    // stored (decrypted) value so re-enabling without re-typing the secret works
    // and the stored secret is preserved on write.
    const existing = await prisma.discordIntegration.findUnique({ where: { id: "discord" } })
    const clientSecret = parsed.clientSecret ?? existing?.clientSecret ?? undefined
    const botToken = parsed.botToken ?? existing?.botToken ?? undefined

    if (isEnabled && (!parsed.clientId || !clientSecret)) {
      return {
        success: false,
        error: "Client ID and Client Secret are required when enabling Discord integration",
      }
    }

    // Bump configVersion on every update so Step 18's rotation-bounce can detect
    // that config (including a rotated bot token) changed and cycle the bot.
    const nextConfigVersion = (existing?.configVersion ?? 0) + 1

    // Build a REDACTED diff for the audit trail. A blank secret input means
    // "keep the stored secret", so a secret only counts as changed when the
    // parsed input supplied a value that differs from the stored one. Secret
    // VALUES are never recorded — only the boolean touch flags below.
    const nextValues: Record<string, unknown> = {
      isEnabled,
      botEnabled,
      clientId: parsed.clientId,
      supportChannelId: parsed.supportChannelId,
      guildId: parsed.guildId,
      serverInviteCode: parsed.serverInviteCode,
      platformName: parsed.platformName,
      instructions: parsed.instructions,
    }
    const changedFields: string[] = AUDITED_CONFIG_FIELDS.filter(
      (field) => (existing as Record<string, unknown> | null)?.[field] !== nextValues[field]
    )
    const clientSecretChanged =
      parsed.clientSecret !== undefined && parsed.clientSecret !== existing?.clientSecret
    const botTokenChanged =
      parsed.botToken !== undefined && parsed.botToken !== existing?.botToken
    if (clientSecretChanged) changedFields.push("clientSecret")
    if (botTokenChanged) changedFields.push("botToken")

    await prisma.discordIntegration.upsert({
      where: { id: "discord" },
      update: {
        isEnabled,
        botEnabled,
        clientId: parsed.clientId,
        clientSecret,
        botToken,
        supportChannelId: parsed.supportChannelId,
        supportThreadIds: parsed.supportThreadIds ?? [],
        configVersion: nextConfigVersion,
        guildId: parsed.guildId,
        serverInviteCode: parsed.serverInviteCode,
        platformName: parsed.platformName,
        instructions: parsed.instructions,
        updatedBy: session.user.id,
      },
      create: {
        id: "discord",
        isEnabled,
        botEnabled,
        clientId: parsed.clientId,
        clientSecret,
        botToken,
        supportChannelId: parsed.supportChannelId,
        supportThreadIds: parsed.supportThreadIds ?? [],
        configVersion: nextConfigVersion,
        guildId: parsed.guildId,
        serverInviteCode: parsed.serverInviteCode,
        platformName: parsed.platformName,
        instructions: parsed.instructions,
        updatedBy: session.user.id,
      },
    })

    logAuditEvent(AuditEventType.DISCORD_INTEGRATION_CONFIG_CHANGED, session.user.id, {
      changedFields,
      secretsChanged: {
        clientSecret: clientSecretChanged,
        botToken: botTokenChanged,
      },
      configVersion: nextConfigVersion,
    })

    // configVersion is bumped on every write and the bot bounces to pick up a
    // rotated token, so treat any bot-token change or version bump as a rotation.
    if (botTokenChanged || nextConfigVersion !== existing?.configVersion) {
      logAuditEvent(AuditEventType.DISCORD_TOKEN_ROTATED, session.user.id, {
        configVersion: nextConfigVersion,
        botTokenChanged,
      })
    }

    revalidatePath("/admin/settings")
    revalidatePath("/discord/link")

    return { success: true }
  } catch (error) {
    logger.error("Failed to update Discord settings", error instanceof Error ? error : undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update Discord settings",
    }
  }
}

export async function disconnectDiscordAccount() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    // clearDiscordRoleForUser emits the DISCORD_ACCOUNT_UNLINKED audit event, so
    // this action does not log it again (avoids a duplicate on the disconnect
    // path).
    await clearDiscordRoleForUser(session.user.id)
    revalidatePath("/discord/link")
    revalidatePath("/")
    return { success: true }
  } catch (error) {
    logger.error("Failed to disconnect Discord account", error instanceof Error ? error : undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to disconnect Discord account",
    }
  }
}

export async function resyncDiscordRole() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    await syncDiscordRoleConnection(session.user.id)
    revalidatePath("/discord/link")
    return { success: true }
  } catch (error) {
    logger.error("Failed to resync Discord role", error instanceof Error ? error : undefined, {
      userId: session.user.id,
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to resync Discord role",
    }
  }
}

