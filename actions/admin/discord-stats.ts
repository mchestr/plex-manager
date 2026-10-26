"use server"

/**
 * The Discord stat channels settings (admin only, audited as `CONFIG_CHANGED`
 * section `discord.stats`). A save moves the BullMQ schedule at once; "Run now"
 * queues one job, or without Redis renames the channels in the request.
 *
 * @module actions/admin/discord-stats
 */

import { revalidatePath } from "next/cache"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { channelStatsSettingsSchema } from "@/lib/discord/channel-stats/config"
import { ensureChannelStatsSchedule } from "@/lib/discord/channel-stats/schedule"
import { runChannelStats } from "@/lib/discord/channel-stats/run"
import { getDiscordBotToken } from "@/lib/discord/config"
import { prisma } from "@/lib/prisma"
import { addJob } from "@/lib/queue/client"
import { isRedisConfigured } from "@/lib/queue/connection"
import { JOB_TYPES } from "@/lib/queue/types"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"

export const updateChannelStatsSettings = adminAction({
  input: channelStatsSettingsSchema,
  fallbackError: "Failed to update the channel stats",
  handler: async ({ enabled, intervalMinutes, channels }, { userId }) => {
    if (enabled && !(await getDiscordBotToken())) {
      return fail("VALIDATION", "Add a Discord bot token in the Discord settings before turning this on")
    }

    const before = await prisma.config.findUnique({
      where: { id: "config" },
      select: { discordStatsEnabled: true, discordStatsIntervalMinutes: true, discordStatsChannels: true },
    })
    const values = { discordStatsEnabled: enabled, discordStatsIntervalMinutes: intervalMinutes, discordStatsChannels: channels }
    await prisma.config.upsert({
      where: { id: "config" },
      create: { id: "config", ...values, updatedBy: userId },
      update: { ...values, updatedBy: userId },
    })

    logAuditEvent(AuditEventType.CONFIG_CHANGED, userId, configDiff("discord.stats", before, values))
    revalidatePath("/admin/settings")

    const schedule = await ensureChannelStatsSchedule()
    if (!schedule.ok) {
      return fail(
        "UPSTREAM_UNAVAILABLE",
        "Settings saved, but the job queue did not answer, so the schedule was not updated. Save again once the queue is back."
      )
    }
    return ok(null)
  },
})

export const runChannelStatsNow = adminAction({
  rateLimit: { name: "admin" },
  fallbackError: "Could not update the channels",
  handler: async () => {
    if (isRedisConfigured()) {
      await addJob(JOB_TYPES.DISCORD_CHANNEL_STATS, { triggeredBy: "admin" }, { attempts: 1, removeOnComplete: true })
      return ok({ queued: true })
    }
    await runChannelStats("admin", { signal: AbortSignal.timeout(20_000) })
    revalidatePath("/admin/settings")
    return ok({ queued: false })
  },
})
