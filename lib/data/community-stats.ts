/**
 * The admin reads for the Discord stat channels and the request-limit tiers
 * (the settings page, and a member's tier on their user page): server-only,
 * each admin-checked (P11.5).
 *
 * @module lib/data/community-stats
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { serverName } from "@/lib/brand"
import { channelsFromConfig, type StatChannels } from "@/lib/discord/channel-stats/config"
import { prisma } from "@/lib/prisma"
import { parseEntries, type RequestTierEntry } from "@/lib/request-tiers/entries"
import { checkMemberTier, type MemberTierCheck } from "@/lib/request-tiers/member-check"
import { tiersFromConfig, type RequestTier } from "@/lib/request-tiers/tiers"

export interface ChannelStatsSettingsData {
  enabled: boolean
  intervalMinutes: number
  channels: StatChannels
  serverName: string
}

export async function getChannelStatsSettings(): Promise<ChannelStatsSettingsData> {
  await assertAdmin()
  const [config, name] = await Promise.all([
    prisma.config.findUnique({
      where: { id: "config" },
      select: { discordStatsEnabled: true, discordStatsIntervalMinutes: true, discordStatsChannels: true },
    }),
    serverName(),
  ])
  return {
    enabled: config?.discordStatsEnabled ?? false,
    intervalMinutes: config?.discordStatsIntervalMinutes ?? 10,
    channels: channelsFromConfig(config?.discordStatsChannels),
    serverName: name,
  }
}

export interface RequestTierRunData {
  startedAt: Date
  finishedAt: Date | null
  trigger: string
  updated: number
  unchanged: number
  failed: number
  skipped: number
  error: string | null
  entries: RequestTierEntry[]
}

export interface RequestTierSettingsData {
  enabled: boolean
  runHour: number
  tiers: RequestTier[]
  lastRun: RequestTierRunData | null
}

export async function getRequestTierSettings(): Promise<RequestTierSettingsData> {
  await assertAdmin()
  const [config, run] = await Promise.all([
    prisma.config.findUnique({
      where: { id: "config" },
      select: { requestTiersEnabled: true, requestTiersRunHour: true, requestTiers: true },
    }),
    prisma.requestTierRun.findFirst({ orderBy: { startedAt: "desc" } }),
  ])
  return {
    enabled: config?.requestTiersEnabled ?? false,
    runHour: config?.requestTiersRunHour ?? 0,
    tiers: [...tiersFromConfig(config?.requestTiers)],
    lastRun: run && { ...run, entries: parseEntries(run.entries) },
  }
}

/** A member's tier and Overseerr quota, read live; null when they have no Plex account to match. */
export async function getMemberTierCheck(userId: string): Promise<MemberTierCheck | null> {
  await assertAdmin()
  return checkMemberTier(userId)
}
