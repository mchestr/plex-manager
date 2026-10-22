"use server"

import { revalidatePath, updateTag } from "next/cache"

import { adminAction, memberAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { clearDiscordRoleForUser, syncDiscordRoleConnection } from "@/lib/discord/integration"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { CONNECTION_HEALTH_TAG } from "@/lib/settings/connection-status"
import { discordIntegrationSchema } from "@/lib/validations/discord"

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

/**
 * Save the Discord integration (admin only). A blank client secret or bot
 * token keeps the stored one: both go only to Discord, a fixed destination,
 * so a kept secret cannot be redirected (P4.6's exception to SEC-31). The
 * change is audited as `DISCORD_INTEGRATION_CONFIG_CHANGED` with
 * `section: "discord"` and a redacted diff; secret values are never logged.
 */
export const updateDiscordIntegrationSettings = adminAction({
  input: discordIntegrationSchema,
  fallbackError: "Failed to update Discord settings",
  handler: async (parsed, { userId }) => {
    const isEnabled = parsed.isEnabled ?? false
    const botEnabled = parsed.botEnabled ?? false

    // A blank secret keeps the stored (decrypted) one, so re-enabling without
    // re-typing it works and the write preserves it.
    const existing = await prisma.discordIntegration.findUnique({ where: { id: "discord" } })
    const clientSecret = parsed.clientSecret ?? existing?.clientSecret ?? undefined
    const botToken = parsed.botToken ?? existing?.botToken ?? undefined

    if (isEnabled && (!parsed.clientId || !clientSecret)) {
      const message = "Client ID and client secret are required to turn on linked roles"
      return fail("VALIDATION", message, {
        fieldErrors: { ...(!parsed.clientId && { clientId: [message] }), ...(!clientSecret && { clientSecret: [message] }) },
      })
    }

    // Bump configVersion on every update so the bot's rotation-bounce sees
    // that config (including a rotated bot token) changed and cycles the bot.
    const nextConfigVersion = (existing?.configVersion ?? 0) + 1

    // A REDACTED diff for the audit trail: a secret counts as changed only
    // when a value was supplied that differs from the stored one, and only
    // its name and a boolean are recorded.
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
    const clientSecretChanged = parsed.clientSecret !== undefined && parsed.clientSecret !== existing?.clientSecret
    const botTokenChanged = parsed.botToken !== undefined && parsed.botToken !== existing?.botToken
    if (clientSecretChanged) changedFields.push("clientSecret")
    if (botTokenChanged) changedFields.push("botToken")

    const values = {
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
      updatedBy: userId,
    }
    // Never return the row: the Prisma extension decrypts its secrets on read
    await prisma.discordIntegration.upsert({
      where: { id: "discord" },
      update: values,
      create: { id: "discord", ...values },
      select: { id: true },
    })

    logAuditEvent(AuditEventType.DISCORD_INTEGRATION_CONFIG_CHANGED, userId, {
      section: "discord",
      changedFields,
      secretsChanged: { clientSecret: clientSecretChanged, botToken: botTokenChanged },
      configVersion: nextConfigVersion,
    })

    // configVersion is bumped on every write and the bot bounces to pick up a
    // rotated token, so treat any bot-token change or version bump as a rotation.
    if (botTokenChanged || nextConfigVersion !== existing?.configVersion) {
      logAuditEvent(AuditEventType.DISCORD_TOKEN_ROTATED, userId, {
        configVersion: nextConfigVersion,
        botTokenChanged,
      })
    }

    // The Discord section's status follows the switches
    updateTag(CONNECTION_HEALTH_TAG)
    revalidatePath("/admin/settings")
    revalidatePath("/discord/link")
    return ok(null)
  },
})

export const disconnectDiscordAccount = memberAction({
  fallbackError: "Failed to disconnect Discord account",
  handler: async (_input, { userId }) => {
    // clearDiscordRoleForUser emits the DISCORD_ACCOUNT_UNLINKED audit event, so
    // this action does not log it again (avoids a duplicate on the disconnect
    // path).
    await clearDiscordRoleForUser(userId)
    revalidatePath("/discord/link")
    revalidatePath("/")
    return ok(null)
  },
})

export const resyncDiscordRole = memberAction({
  entitlement: "full",
  rateLimit: { name: "discord:resync", by: "user" },
  fallbackError: "Failed to resync Discord role",
  handler: async (_input, { userId }) => {
    await syncDiscordRoleConnection(userId)
    revalidatePath("/discord/link")
    return ok(null)
  },
})
