"use server"

import { requireAdmin } from "@/lib/admin"
import { authOptions } from "@/lib/auth"
import { clearDiscordRoleForUser, syncDiscordRoleConnection } from "@/lib/discord/integration"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { discordIntegrationSchema } from "@/lib/validations/discord"
import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

const logger = createLogger("DISCORD_ACTIONS")

export async function updateDiscordIntegrationSettings(data: Record<string, unknown>) {
  const session = await requireAdmin()

  try {
    const parsed = discordIntegrationSchema.parse(data)
    const isEnabled = parsed.isEnabled ?? false
    const botEnabled = parsed.botEnabled ?? false

    if (isEnabled && (!parsed.clientId || !parsed.clientSecret)) {
      return {
        success: false,
        error: "Client ID and Client Secret are required when enabling Discord integration",
      }
    }

    await prisma.discordIntegration.upsert({
      where: { id: "discord" },
      update: {
        isEnabled,
        botEnabled,
        clientId: parsed.clientId,
        clientSecret: parsed.clientSecret,
        guildId: parsed.guildId,
        platformName: parsed.platformName,
        instructions: parsed.instructions,
        updatedBy: session.user.id,
      },
      create: {
        id: "discord",
        isEnabled,
        botEnabled,
        clientId: parsed.clientId,
        clientSecret: parsed.clientSecret,
        guildId: parsed.guildId,
        platformName: parsed.platformName,
        instructions: parsed.instructions,
        updatedBy: session.user.id,
      },
    })

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
    await clearDiscordRoleForUser(session.user.id)
    revalidatePath("/discord/link")
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

