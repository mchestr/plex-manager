/**
 * The season open's audience switch (P8.2, design 9.1): Rewind opens to
 * everyone at 08:00 on the opening day, in the server zone, after the
 * overnight season-open Prepare (00:15 in the westernmost zone, data through
 * 30 November; `ensureSeasonPrepareScheduled`).
 *
 * ```
 * 08:00 REWIND_SEASON_OPEN (rewind-aux, dedup rewind:open:{year})
 *   ├─ audience already all ───────────────────────────► ALREADY_OPEN
 *   ├─ Rewind off ─────────────────────────────────────► REWIND_OFF
 *   ├─ +season.auto-open not set (the owner's opt-in) ─► NOT_ENABLED: the owner switches by hand
 *   ├─ Prepare or a generation still running ─────────► re-check every 10 minutes, until 12:00
 *   │                                                     then STILL_GENERATING
 *   ├─ the season-open Prepare did not complete ──────► NOT_PREPARED: the owner checks and switches
 *   ├─ a member's Rewind failed ──────────────────────► FAILURES: Retry failed, then switch in Settings
 *   └─ otherwise ──────────────────────────────────────► SWITCHED: audience all, CONFIG_CHANGED,
 *                                                         the ready notifications fan out (P7.14)
 * ```
 *
 * The switch is the same change as P7.12's save: a compare-and-set from
 * `admins` to `all` with Rewind on, one `CONFIG_CHANGED` entry (section
 * `rewind`, actor `system`) and `enqueueSeasonReadyNotifications`. The job is
 * kept scheduled at worker start and by the stale sweep, like the
 * season-open Prepare.
 *
 * @module lib/rewind/season-open
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { enqueueSeasonReadyNotifications } from "@/lib/queue/jobs/rewind-notify"
import { sanitizeJobId } from "@/lib/queue/job-id"
import { getRewindQueue } from "@/lib/queue/rewind-producers"
import { JOB_TYPES, type RewindSeasonOpenPayload } from "@/lib/queue/types"
import { keepDelayedRun, seasonPrepareDeduplicationId } from "@/lib/rewind/season-runs"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import { serverZone } from "@/lib/utils/server-zone"
import { getSeasonCounts } from "@/lib/wrapped/admin/season"
import { DEFAULT_SEASON, getSeasonYear, parseMonthDay } from "@/lib/wrapped/season"
import { latestLocalInstant } from "@/lib/wrapped/time/zone"

/** When the audience switches, and when it stops waiting for a run still going, in the server zone. */
const AUDIENCE_SWITCH_TIME = "08:00"
const SWITCH_GIVES_UP_AT = "12:00"

/** The opening day of `year`'s season as `YYYY-MM-DD`. */
function openingDay(year: number, opens: string): string {
  const md = parseMonthDay(opens) ?? parseMonthDay(DEFAULT_SEASON.opens)!
  return `${year}-${String(md.month).padStart(2, "0")}-${String(md.day).padStart(2, "0")}`
}

/**
 * 08:00 on the season's opening day in the server zone.
 *
 * @example
 * ```ts
 * seasonAudienceSwitchAt(2026, "12-01", "America/Chicago").toISOString() // "2026-12-01T14:00:00.000Z"
 * ```
 */
export function seasonAudienceSwitchAt(year: number, opens: string, zone: string): Date {
  return latestLocalInstant(openingDay(year, opens), AUDIENCE_SWITCH_TIME, [zone])
}

/** 12:00 on the opening day in the server zone: the scheduled switch stops waiting then. */
export function seasonAudienceSwitchGivesUpAt(year: number, opens: string, zone: string): Date {
  return latestLocalInstant(openingDay(year, opens), SWITCH_GIVES_UP_AT, [zone])
}

/**
 * Keeps one delayed `REWIND_SEASON_OPEN` for {@link seasonAudienceSwitchAt},
 * replaced when the season dates or the server zone move. Returns the
 * instant, or null once it has passed.
 *
 * @internal callers use {@link scheduleSeasonAudienceSwitch}, which picks the season year
 */
export async function ensureSeasonAudienceSwitchScheduled(year: number, now: number = Date.now()): Promise<Date | null> {
  const config = await prisma.config.findUnique({ where: { id: "config" }, select: { rewindSeasonOpens: true } })
  const at = seasonAudienceSwitchAt(year, config?.rewindSeasonOpens ?? DEFAULT_SEASON.opens, await serverZone())
  const data: RewindSeasonOpenPayload = { year, triggeredBy: "scheduled" }
  return keepDelayedRun(
    {
      queue: "rewind-aux",
      name: JOB_TYPES.REWIND_SEASON_OPEN,
      data,
      at,
      deduplicationId: `rewind:open:${year}`,
      jobId: sanitizeJobId(`rewind:open:${year}:${at.getTime()}`),
      options: { attempts: 3, backoff: { type: "exponential", delay: 60_000 } },
    },
    now
  )
}

/** {@link ensureSeasonAudienceSwitchScheduled} for the current season year: at worker start and in the stale sweep. */
export async function scheduleSeasonAudienceSwitch(): Promise<Date | null> {
  return ensureSeasonAudienceSwitchScheduled(await getSeasonYear())
}

export type SeasonOpenReadiness =
  | { state: "ready"; ready: number }
  | { state: "running"; prepare: boolean; generating: number }
  | { state: "not-prepared"; prepare: string | null }
  | { state: "failures"; failed: number }

/**
 * Whether the season-open generation is done and clean: the dashboard's
 * counts and the season-open Prepare's job. With `requirePrepare` (the 08:00
 * job) that Prepare must have completed; the staging rehearsal, which runs a
 * Prepare of its own, passes false.
 */
export async function seasonOpenReadiness(year: number, { requirePrepare = true, now = Date.now() } = {}): Promise<SeasonOpenReadiness> {
  const queue = getRewindQueue("rewind-batch")
  const prepareId = await queue.getDeduplicationJobId(seasonPrepareDeduplicationId(year))
  const prepareJob = prepareId ? await queue.getJob(prepareId) : undefined
  const prepareState = prepareJob ? await prepareJob.getState() : null
  // A delayed Prepare has not started: nothing to wait for.
  const prepare = prepareState !== null && !["completed", "failed", "delayed", "unknown"].includes(prepareState)
  const counts = await getSeasonCounts(year, now)
  const generating = counts.generating + counts.stuck
  if (prepare || generating > 0) return { state: "running", prepare, generating }
  if (requirePrepare && prepareState !== "completed") return { state: "not-prepared", prepare: prepareState }
  if (counts.failed > 0) return { state: "failures", failed: counts.failed }
  return { state: "ready", ready: counts.ready }
}

/**
 * Opens Rewind to everyone: `rewindAudience` from `admins` to `all` while
 * Rewind is on, audited, then the season's ready notifications. False when
 * the row was not in that state (already open, Rewind off, no row).
 */
export async function openRewindToEveryone(year: number, actorId: string): Promise<{ switched: boolean; notified: number }> {
  const { count } = await prisma.config.updateMany({
    where: { id: "config", rewindEnabled: true, rewindAudience: "admins" },
    data: { rewindAudience: "all", updatedBy: actorId },
  })
  if (count === 0) return { switched: false, notified: 0 }
  logAuditEvent(AuditEventType.CONFIG_CHANGED, actorId, {
    ...configDiff("rewind", { rewindAudience: "admins" }, { rewindAudience: "all" }),
    source: "season-open",
  })
  return { switched: true, notified: await enqueueSeasonReadyNotifications(year) }
}
