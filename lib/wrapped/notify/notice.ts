/**
 * "Your Rewind is ready" on the dashboard (design 9.7, P7.14): the AppShell
 * notice, and the unread rule it shares with the home RewindCard's pip.
 *
 * ## Unread
 *
 * A completed Rewind is unread until a `RewindView` exists from on or after
 * its `generatedAt`, so a regeneration makes it unread again. The card keeps
 * its ready state either way; only the pip and the notice follow the rule.
 *
 * ## The notice
 *
 * It shows while the season year's Rewind is completed and unread, the
 * member may view it (`rewindEnabled`, and the audience is everyone or they
 * are an admin), their `RewindPrefs.notify` is on (a missing row reads as
 * on, the column default), and `banner` is one of `rewindNotifyChannels`.
 * After the final cut, a member who read the season issue gets the final
 * cut's copy ("now includes December", P8.5).
 *
 * @module lib/wrapped/notify/notice
 */

import "server-only"

import { z } from "zod"

import type { MemberNotice } from "@/lib/member/notice-rules"
import { prisma } from "@/lib/prisma"
import { serverZone } from "@/lib/utils/server-zone"
import { REWIND_NOTIFY_CHANNELS } from "@/lib/validations/rewind-settings"
import { DEFAULT_SEASON, seasonStateAt } from "@/lib/wrapped/season"

export type RewindNotifyChannel = (typeof REWIND_NOTIFY_CHANNELS)[number]

const ChannelsSchema = z.array(z.string()).catch([])

/** The known channels a stored `rewindNotifyChannels` value holds. */
export function notifyChannels(value: unknown): RewindNotifyChannel[] {
  const stored = ChannelsSchema.parse(value ?? [])
  return REWIND_NOTIFY_CHANNELS.filter((channel) => stored.includes(channel))
}

/** Whether a Rewind generated at `generatedAt` has no view since; see the module rule. */
export function isRewindUnread(generatedAt: Date | null, viewedAt: readonly Date[]): boolean {
  return !viewedAt.some((at) => !generatedAt || at >= generatedAt)
}

/** The ready notice for `userId`, or null; see the module rule. */
export async function getRewindNotice(userId: string, now: Date = new Date()): Promise<MemberNotice | null> {
  const [config, user, zone] = await Promise.all([
    prisma.config.findUnique({
      where: { id: "config" },
      select: { rewindEnabled: true, rewindAudience: true, rewindNotifyChannels: true, rewindSeasonOpens: true, rewindSeasonCloses: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } }),
    serverZone(),
  ])
  if (!config?.rewindEnabled || !user) return null
  if (config.rewindAudience !== "all" && !user.isAdmin) return null
  if (!notifyChannels(config.rewindNotifyChannels).includes("banner")) return null

  const year = seasonStateAt(now, config.rewindSeasonOpens ?? DEFAULT_SEASON.opens, config.rewindSeasonCloses ?? DEFAULT_SEASON.closes, zone).seasonYear
  const [rewind, prefs] = await Promise.all([
    prisma.plexWrapped.findUnique({ where: { userId_year: { userId, year } }, select: { id: true, status: true, generatedAt: true, finalCutAt: true } }),
    prisma.rewindPrefs.findUnique({ where: { userId_year: { userId, year } }, select: { notify: true } }),
  ])
  if (rewind?.status !== "completed" || prefs?.notify === false) return null

  const views = await prisma.rewindView.findMany({
    where: { wrappedId: rewind.id, ...(rewind.generatedAt && { createdAt: { gte: rewind.generatedAt } }) },
    select: { createdAt: true },
    take: 1,
  })
  if (!isRewindUnread(rewind.generatedAt, views.map((view) => view.createdAt))) return null
  // December's readers get the final cut's copy, the same as its DM (P8.5).
  const readSeason = rewind.finalCutAt && (await prisma.rewindView.count({ where: { wrappedId: rewind.id, createdAt: { lt: rewind.finalCutAt } } })) > 0
  return readSeason ? { kind: "rewind-ready", year, finalCut: true } : { kind: "rewind-ready", year }
}
