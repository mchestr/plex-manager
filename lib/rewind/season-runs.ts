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
import { normalizeTimeZone, wallTimeToInstant } from "@/lib/utils/zoned-time"
import { batchWindowAt, throughFor } from "@/lib/wrapped/aggregate/window"
import { DEFAULT_SEASON, getSeasonYear, parseMonthDay } from "@/lib/wrapped/season"

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
  const wall = `${year}-${String(md.month).padStart(2, "0")}-${String(md.day).padStart(2, "0")}T00:15`
  return new Date(Math.max(...zones.map((zone) => wallTimeToInstant(wall, zone).getTime())))
}

/** The latest instant, across `zones`, at which 1 January of the next year begins: when the final cut opens. */
export function finalCutOpensAt(year: number, zones: readonly string[]): Date {
  return new Date(Math.max(...zones.map((zone) => wallTimeToInstant(`${year + 1}-01-01T00:00`, zone).getTime())))
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

async function batchQueue() {
  await readyWithin(getRequestPathRedis(), READY_WAIT_MS)
  return getRewindQueue("rewind-batch")
}

/** Whether the run joined one already waiting or running, and its job id. */
export interface RunStarted {
  jobId: string
  alreadyQueued: boolean
}

async function addDeduplicated(name: string, data: object, deduplicationId: string, options: JobsOptions = {}): Promise<RunStarted> {
  const queue = await batchQueue()
  const existing = await queue.getDeduplicationJobId(deduplicationId)
  const job = await queue.add(name, data, { ...RUN_OPTIONS, ...options, deduplication: { id: deduplicationId } })
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
  if (at.getTime() <= now) return null

  const through = throughFor(year, { finalCut: false })
  const deduplicationId = `rewind:prepare:${year}:${through}`
  const jobId = sanitizeJobId(`rewind:prepare:${year}:${at.getTime()}`)
  const queue = await batchQueue()

  const existingId = await queue.getDeduplicationJobId(deduplicationId)
  if (existingId === jobId) return at
  const existing = existingId ? await queue.getJob(existingId) : undefined
  if (existing) {
    // Started already: the season-open run is under way.
    if (!(await existing.isDelayed())) return at
    await existing.remove()
  }

  const data: RewindSeasonPreparePayload = { year, through, audience: "all", triggeredBy: "scheduled" }
  await queue.add(JOB_TYPES.REWIND_SEASON_PREPARE, data, {
    ...RUN_OPTIONS,
    jobId,
    delay: at.getTime() - now,
    deduplication: { id: deduplicationId },
  })
  return at
}

/** {@link ensureSeasonPrepareScheduled} for the current season year: at worker start and in the stale sweep. */
export async function scheduleSeasonOpenRun(): Promise<Date | null> {
  return ensureSeasonPrepareScheduled(await getSeasonYear())
}
