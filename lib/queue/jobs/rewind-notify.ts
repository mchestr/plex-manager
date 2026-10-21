/**
 * The "your Rewind is ready" Discord DM: `REWIND_NOTIFY` on `rewind-aux`
 * (design 9.1, 9.7, P7.14).
 *
 * ```
 * afterRewindCompleted (kind season | member, member in the live audience) ─┐
 * afterRewindCompleted (kind final-cut, a member who read the season issue) ─┤
 * updateRewindSettings: audience becomes everyone ─ enqueueSeasonReadyNotifications ─┤
 *                                                                           ▼
 *   REWIND_NOTIFY { wrappedId, userId, year, kind }, dedup rewind:notify:{year}:{userId}:{kind}
 *     ├─ outside 09:00-20:00 in the member's Rewind zone ─► delays itself to the next 09:00
 *     │    (final-cut: never before 09:00 on 2 January there)
 *     ├─ re-checks: viewable, entitlement, RewindPrefs.notify, `discord` channel, bot on, linked
 *     ├─ claims PlexWrapped.notifiedAt (null → now; final-cut: null or before finalCutAt → now)
 *     │    no row updated ─► another job sent it
 *     └─ sendDiscordDirectMessage ─► DMs closed (50007): logged, not retried
 * ```
 *
 * ## Special cases
 *
 * - Admin regenerations and dry runs never notify: only `season`, `member`
 *   and `final-cut` generations enqueue.
 * - `final-cut` (P8.5, design 9.6 step 5) says "Your {serverName} Rewind
 *   {year} now includes December." to members with a `RewindView` from
 *   before the final cut, December's readers, once each. The season send
 *   already set `notifiedAt`, so its claim compares two columns (a Prisma
 *   field reference) and needs no new column.
 * - A completion while the member cannot view Rewind yet (admins-only
 *   audience) enqueues nothing. The audience switch fans out instead, so a
 *   member east of the server is not skipped for good by a job that ran in
 *   their night before the switch.
 * - A failed send other than 50007 releases the claim and throws, so one of
 *   the three attempts can retry it. The banner does not use `notifiedAt`.
 *
 * @module lib/queue/jobs/rewind-notify
 */

import { DelayedError, type Job } from "bullmq"

import { getAccessLevel } from "@/lib/access"
import { rewindName } from "@/lib/brand"
import { DiscordApiError, DISCORD_DMS_CLOSED, sendDiscordDirectMessage } from "@/lib/discord/api"
import { isDiscordBotEnabled } from "@/lib/discord/lock"
import { getBaseUrl } from "@/lib/env"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { prisma } from "@/lib/prisma"
import { getRewindQueue } from "@/lib/queue/rewind-producers"
import { JOB_TYPES, type RewindNotifyPayload } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"
import { serverZone } from "@/lib/utils/server-zone"
import { wallTimeToInstant } from "@/lib/utils/zoned-time"
import { notifyChannels } from "@/lib/wrapped/notify/notice"
import { nextSendWindow } from "@/lib/wrapped/notify/window"
import { onRewindCompleted, type CompletedRewind } from "@/lib/wrapped/pipeline/after-complete"
import { resolveZone } from "@/lib/wrapped/time/zone"

const logger = createLogger("REWIND_NOTIFY")

const SEND_LIMIT_MS = 60_000

type NotifySkip =
  | "NOT_READY"
  | "ALREADY_SENT"
  | "NOT_IN_AUDIENCE"
  | "NOT_ENTITLED"
  | "NOTIFY_OFF"
  | "CHANNEL_OFF"
  | "BOT_DISABLED"
  | "NOT_LINKED"
  | "DMS_CLOSED"

export type NotifyResult = { sent: true } | { sent: false; skipped: NotifySkip }

const skipped = (reason: NotifySkip): NotifyResult => ({ sent: false, skipped: reason })

/** Whether members like this one can open Rewind now: it is on, and the audience is everyone or they are an admin. */
function inLiveAudience(config: { rewindEnabled: boolean; rewindAudience: string } | null, isAdmin: boolean): boolean {
  return Boolean(config?.rewindEnabled) && (config?.rewindAudience === "all" || isAdmin)
}

function jobOptions(data: RewindNotifyPayload) {
  return {
    attempts: 3,
    backoff: { type: "exponential", delay: 60_000 },
    deduplication: { id: `rewind:notify:${data.year}:${data.userId}:${data.kind}` },
  }
}

/** Enqueues one ready notification; the job finds its own send time. */
async function enqueueRewindNotify(data: RewindNotifyPayload): Promise<void> {
  await getRewindQueue("rewind-aux").add(JOB_TYPES.REWIND_NOTIFY, data, jobOptions(data))
}

/**
 * The season-open fan-out: one `season` notification per completed Rewind
 * of `year` whose member has not been told yet. `updateRewindSettings` calls
 * it when the audience becomes everyone. Returns how many it enqueued.
 */
export async function enqueueSeasonReadyNotifications(year: number): Promise<number> {
  const rows = await prisma.plexWrapped.findMany({
    where: { year, status: "completed", notifiedAt: null },
    select: { id: true, userId: true },
  })
  if (rows.length === 0) return 0
  await getRewindQueue("rewind-aux").addBulk(
    rows.map((row) => {
      const data: RewindNotifyPayload = { wrappedId: row.id, userId: row.userId, year, kind: "season" }
      return { name: JOB_TYPES.REWIND_NOTIFY, data, opts: jobOptions(data) }
    })
  )
  return rows.length
}

/** Whether the member opened the season issue before the final cut replaced it: December's readers. */
async function readSeasonIssue(wrappedId: string): Promise<boolean> {
  const row = await prisma.plexWrapped.findUnique({ where: { id: wrappedId }, select: { finalCutAt: true } })
  if (!row?.finalCutAt) return false
  return (await prisma.rewindView.count({ where: { wrappedId, createdAt: { lt: row.finalCutAt } } })) > 0
}

/** The `afterRewindCompleted()` hook: a `season`, `member` or `final-cut` run of a member in the live audience. */
async function notifyOnCompletion(rewind: CompletedRewind): Promise<void> {
  const [generation, config, user] = await Promise.all([
    prisma.rewindGeneration.findUnique({ where: { id: rewind.generationId }, select: { kind: true } }),
    prisma.config.findUnique({ where: { id: "config" }, select: { rewindEnabled: true, rewindAudience: true } }),
    prisma.user.findUnique({ where: { id: rewind.userId }, select: { isAdmin: true } }),
  ])
  const kind = generation?.kind
  if (kind !== "season" && kind !== "member" && kind !== "final-cut") return
  if (!user || !inLiveAudience(config, user.isAdmin)) return
  if (kind === "final-cut" && !(await readSeasonIssue(rewind.wrappedId))) return
  await enqueueRewindNotify({ wrappedId: rewind.wrappedId, userId: rewind.userId, year: rewind.year, kind })
}

/** The final-cut message goes out from 09:00 on 2 January of the next year in the member's zone. */
const finalCutSendsFrom = (year: number, zone: string) => wallTimeToInstant(`${year + 1}-01-02T09:00`, zone)

/** Whether this kind's message already went out: once per Rewind, and once more after its final cut. */
function alreadySent(kind: RewindNotifyPayload["kind"], row: { notifiedAt: Date | null; finalCutAt: Date | null }): boolean {
  if (!row.notifiedAt) return false
  return kind !== "final-cut" || (row.finalCutAt !== null && row.notifiedAt >= row.finalCutAt)
}

/** Registers the completion hook; the Rewind Workers call it once. */
export function registerNotifyJobs(): void {
  onRewindCompleted("ready-notify", notifyOnCompletion)
}

/** Why the DM cannot go to this member now, or null when it can. */
async function sendBlocker(userId: string, year: number, isAdmin: boolean, linked: boolean): Promise<NotifySkip | null> {
  const [config, prefs] = await Promise.all([
    prisma.config.findUnique({ where: { id: "config" }, select: { rewindEnabled: true, rewindAudience: true, rewindNotifyChannels: true } }),
    prisma.rewindPrefs.findUnique({ where: { userId_year: { userId, year } }, select: { notify: true } }),
  ])
  if (!inLiveAudience(config, isAdmin)) return "NOT_IN_AUDIENCE"
  if ((await getAccessLevel(userId)) !== "full") return "NOT_ENTITLED"
  if (prefs?.notify === false) return "NOTIFY_OFF"
  if (!notifyChannels(config?.rewindNotifyChannels).includes("discord")) return "CHANNEL_OFF"
  if (!(await isDiscordBotEnabled())) return "BOT_DISABLED"
  if (!linked) return "NOT_LINKED"
  return null
}

/** Sends one ready DM; see the module comment. */
export async function processRewindNotify(job: Job<RewindNotifyPayload>, token?: string): Promise<NotifyResult> {
  const { wrappedId, userId } = job.data
  const row = await prisma.plexWrapped.findUnique({
    where: { id: wrappedId },
    select: {
      userId: true,
      year: true,
      status: true,
      notifiedAt: true,
      finalCutAt: true,
      user: { select: { timezone: true, isAdmin: true, discordConnection: { select: { discordUserId: true } } } },
    },
  })
  const { kind } = job.data
  if (!row || row.userId !== userId || row.status !== "completed") return skipped("NOT_READY")
  if (kind === "final-cut" && !row.finalCutAt) return skipped("NOT_READY")
  if (alreadySent(kind, row)) return skipped("ALREADY_SENT")

  const now = new Date()
  const zone = resolveZone(row.user, await serverZone()).zone
  const earliest = kind === "final-cut" ? new Date(Math.max(now.getTime(), finalCutSendsFrom(row.year, zone).getTime())) : now
  const sendAt = nextSendWindow(earliest, zone)
  if (sendAt.getTime() > now.getTime()) {
    await job.moveToDelayed(sendAt.getTime(), token)
    throw new DelayedError()
  }

  const discordUserId = row.user.discordConnection?.discordUserId ?? null
  const blocker = await sendBlocker(userId, row.year, row.user.isAdmin, discordUserId !== null)
  if (blocker || !discordUserId) return skipped(blocker ?? "NOT_LINKED")

  const unclaimed =
    kind === "final-cut"
      ? { OR: [{ notifiedAt: null }, { notifiedAt: { lt: prisma.plexWrapped.fields.finalCutAt } }] }
      : { notifiedAt: null }
  const claim = await prisma.plexWrapped.updateMany({ where: { id: wrappedId, ...unclaimed }, data: { notifiedAt: now } })
  if (claim.count === 0) return skipped("ALREADY_SENT")

  const name = await rewindName(row.year)
  const content = `${kind === "final-cut" ? `Your ${name} now includes December.` : `Your ${name} is ready.`}\n${getBaseUrl()}/rewind`
  try {
    await sendDiscordDirectMessage(discordUserId, content, AbortSignal.any([AbortSignal.timeout(SEND_LIMIT_MS), shutdownSignal]))
  } catch (error) {
    if (error instanceof DiscordApiError && error.code === DISCORD_DMS_CLOSED) {
      logger.info("The member's Discord DMs are closed; not retrying", { wrappedId, userId })
      return skipped("DMS_CLOSED")
    }
    await prisma.plexWrapped.updateMany({ where: { id: wrappedId, notifiedAt: now }, data: { notifiedAt: row.notifiedAt } })
    throw error
  }
  logger.info("Sent the Rewind ready DM", { wrappedId, userId, kind })
  return { sent: true }
}
