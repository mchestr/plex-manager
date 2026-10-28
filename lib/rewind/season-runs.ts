/**
 * Starts and schedules the season console's runs (P7.8, design 9.1).
 *
 * ```
 * Prepare season ─► REWIND_SEASON_PREPARE (audience config) ─┐
 * season open    ─► REWIND_SEASON_PREPARE (audience all) ────┤ aggregate ─► warm ─► REWIND_GENERATE_ALL
 * Generate all   ─► REWIND_GENERATE_ALL (scope all) ─────────┘
 * Retry failed   ─► REWIND_GENERATE_ALL (scope failed)
 * ```
 *
 * ## Season-open schedule
 *
 * `ensureSeasonPrepareScheduled(year)` keeps one delayed `REWIND_SEASON_PREPARE`
 * with audience `all`, deduplicated on `rewind:prepare:{year}:{through}`, for
 * 00:15 on the season's opening day in the westernmost zone: the latest such
 * instant across the server zone and every eligible member's zone. When that
 * instant moves (a member changes zone, the season dates change), the delayed
 * job is replaced. It runs at worker start and in the stale sweep, every 10
 * minutes. The buttons' runs use another deduplication id, so pressing
 * Prepare season never joins the delayed season-open run.
 *
 * {@link keepDelayedRun} is the one keep-it-scheduled rule, for this run and
 * the season open's audience switch (P8.2, `lib/rewind/season-open.ts`).
 * There is no January rebuild: a Rewind is final once it is generated, and
 * {@link cancelScheduledFinalCut} removes the final cut 0.5.0 and earlier
 * kept scheduled for 1 January.
 *
 * @module
 */

import "server-only"

import type { JobsOptions } from "bullmq"

import { prisma } from "@/lib/prisma"
import { readyWithin, getRequestPathRedis } from "@/lib/queue/connection"
import { sanitizeJobId } from "@/lib/queue/job-id"
import { getRewindQueue } from "@/lib/queue/rewind-producers"
import { JOB_TYPES, type RewindGenerateAllPayload, type RewindSeasonPreparePayload } from "@/lib/queue/types"
import { serverZone } from "@/lib/utils/server-zone"
import { normalizeTimeZone } from "@/lib/utils/zoned-time"
import { batchWindowAt, throughFor } from "@/lib/wrapped/aggregate/window"
import { DEFAULT_SEASON, getSeasonYear, parseMonthDay } from "@/lib/wrapped/season"
import { latestLocalInstant } from "@/lib/wrapped/time/zone"

const READY_WAIT_MS = 2000
const RUN_OPTIONS: JobsOptions = { attempts: 3, backoff: { type: "exponential", delay: 30_000 } }

/**
 * The latest instant, across `zones`, at which clocks read 00:15 on the
 * season's opening day (`opens`, `MM-DD`) of `year`.
 *
 * @example
 * ```ts
 * seasonPrepareAt(2026, "12-01", ["America/Chicago", "America/Los_Angeles"]).toISOString()
 * // "2026-12-01T08:15:00.000Z" (02:15 in Chicago, 00:15 in Los Angeles)
 * ```
 */
export function seasonPrepareAt(year: number, opens: string, zones: readonly string[]): Date {
  const md = parseMonthDay(opens) ?? parseMonthDay(DEFAULT_SEASON.opens)!
  return latestLocalInstant(`${year}-${String(md.month).padStart(2, "0")}-${String(md.day).padStart(2, "0")}`, "00:15", zones)
}

/** The server zone and every zone an eligible member chose, without repeats. */
export async function seasonZones(): Promise<string[]> {
  const [server, members] = await Promise.all([
    serverZone(),
    prisma.user.findMany({
      where: { disabledAt: null, plexUserId: { not: null }, timezone: { not: null } },
      distinct: ["timezone"],
      select: { timezone: true },
    }),
  ])
  const zones = members.map((m) => normalizeTimeZone(m.timezone)).filter((zone): zone is string => zone !== null)
  return [...new Set([server, ...zones])]
}

/** The batch's last data day for `year` now: 30 November in the season, 31 December after the year ends. */
export async function seasonThrough(year: number, now: number = Date.now()): Promise<string> {
  return throughFor(year, batchWindowAt(year, await serverZone(), now))
}

async function readyQueue(name: "rewind-batch" | "rewind-aux") {
  await readyWithin(getRequestPathRedis(), READY_WAIT_MS)
  return getRewindQueue(name)
}

const batchQueue = () => readyQueue("rewind-batch")

/** Whether the run joined one already waiting or running, and its job id. */
export interface RunStarted {
  jobId: string
  alreadyQueued: boolean
}

async function addDeduplicated(name: string, data: object, deduplicationId: string): Promise<RunStarted> {
  const queue = await batchQueue()
  const existing = await queue.getDeduplicationJobId(deduplicationId)
  const job = await queue.add(name, data, { ...RUN_OPTIONS, deduplication: { id: deduplicationId } })
  return { jobId: job.id ?? "", alreadyQueued: existing !== null && job.id === existing }
}

/** Prepare season from the console: joins a button run already waiting or running. */
export function enqueueSeasonPrepare(data: Omit<RewindSeasonPreparePayload, "step">): Promise<RunStarted> {
  return addDeduplicated(JOB_TYPES.REWIND_SEASON_PREPARE, data, `rewind:prepare-now:${data.year}:${data.through}`)
}

/**
 * Generate all and Retry failed. Never deduplicated: a second run while one is
 * going leaves out the members whose generation is queued or running.
 */
export async function enqueueGenerateAll(data: Omit<RewindGenerateAllPayload, "step">): Promise<RunStarted> {
  const job = await (await batchQueue()).add(JOB_TYPES.REWIND_GENERATE_ALL, data, RUN_OPTIONS)
  return { jobId: job.id ?? "", alreadyQueued: false }
}

/** One delayed run that {@link keepDelayedRun} keeps scheduled. */
export interface DelayedRun {
  queue: "rewind-batch" | "rewind-aux"
  name: string
  data: object
  at: Date
  deduplicationId: string
  /** Includes the instant, so a moved instant replaces the job. */
  jobId: string
  options: JobsOptions
}

/**
 * Keeps one delayed job for `run.at`: nothing when that job is there, the
 * job replaced when the instant moved while it still waits, and left alone
 * once it started. Returns the instant, or null when it has passed.
 */
export async function keepDelayedRun(run: DelayedRun, now: number): Promise<Date | null> {
  if (run.at.getTime() <= now) return null
  const queue = await readyQueue(run.queue)
  const existingId = await queue.getDeduplicationJobId(run.deduplicationId)
  if (existingId === run.jobId) return run.at
  const existing = existingId ? await queue.getJob(existingId) : undefined
  if (existing) {
    // Started already: the run is under way.
    if (!(await existing.isDelayed())) return run.at
    await existing.remove()
  }
  await queue.add(run.name, run.data, {
    ...run.options,
    jobId: run.jobId,
    delay: run.at.getTime() - now,
    deduplication: { id: run.deduplicationId },
  })
  return run.at
}

/**
 * Keeps the season-open `REWIND_SEASON_PREPARE` scheduled; see the module
 * comment. Returns the instant it is scheduled for, or null when that has
 * passed.
 *
 * @internal callers use {@link scheduleSeasonOpenRun}, which picks the season year
 */
export async function ensureSeasonPrepareScheduled(year: number, now: number = Date.now()): Promise<Date | null> {
  const config = await prisma.config.findUnique({ where: { id: "config" }, select: { rewindSeasonOpens: true } })
  const at = seasonPrepareAt(year, config?.rewindSeasonOpens ?? DEFAULT_SEASON.opens, await seasonZones())
  const through = throughFor(year, { finalCut: false })
  const data: RewindSeasonPreparePayload = { year, through, audience: "all", triggeredBy: "scheduled" }
  return keepDelayedRun(
    {
      queue: "rewind-batch",
      name: JOB_TYPES.REWIND_SEASON_PREPARE,
      data,
      at,
      deduplicationId: seasonPrepareDeduplicationId(year),
      jobId: sanitizeJobId(`rewind:prepare:${year}:${at.getTime()}`),
      options: RUN_OPTIONS,
    },
    now
  )
}

/** The season-open Prepare's deduplication id, `rewind:prepare:{year}:{through}`; P8.2's audience switch waits for it. */
export const seasonPrepareDeduplicationId = (year: number) => `rewind:prepare:${year}:${throughFor(year, { finalCut: false })}`

/** {@link ensureSeasonPrepareScheduled} for the current season year: at worker start and in the stale sweep. */
export async function scheduleSeasonOpenRun(): Promise<Date | null> {
  return ensureSeasonPrepareScheduled(await getSeasonYear())
}

/** The job 0.5.0 and earlier kept delayed on `rewind-batch` for 00:30 on 1 January. */
const LEGACY_FINAL_CUT_JOB = "rewind:final-cut"

/**
 * Removes every `rewind:final-cut` job that has not started: a Rewind is
 * final once it is generated, so nothing rebuilds the issues in January.
 * Runs at worker start and in the stale sweep, because an older worker's
 * sweep adds the job again during a rolling deploy. BullMQ frees the job's
 * deduplication id (`rewind:final:{year}`) with it. Returns how many it removed.
 */
export async function cancelScheduledFinalCut(): Promise<number> {
  const queue = await batchQueue()
  const legacy = (await queue.getJobs(["delayed", "waiting", "prioritized"])).filter((job) => job?.name === LEGACY_FINAL_CUT_JOB)
  await Promise.all(legacy.map((job) => job.remove()))
  return legacy.length
}
