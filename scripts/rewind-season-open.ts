#!/usr/bin/env tsx
/**
 * The season open (P8.2): its schedule, and the staging rehearsal P8.1 runs
 * on the evening of 30 November.
 *
 * Usage (from a checkout; the runtime image has no scripts/ and no tsx):
 *   DATABASE_URL=... REDIS_URL=... npm run rewind:season-open -- --year=2026             # the schedule, read-only
 *   REWIND_STAGING=1 DATABASE_URL=... REDIS_URL=... npm run rewind:season-open -- --year=2026 --rehearse
 *   REWIND_STAGING=1 ... npm run rewind:season-open -- --year=2026 --switch-only        # after Retry failed
 *
 * The schedule prints when the season-open Prepare runs (00:15 on the opening
 * day in the westernmost zone, data through 30 November), when the audience
 * switches (08:00 in the server zone) and whether the owner turned the
 * scheduled switch on (`+season.auto-open`).
 *
 * `--rehearse` refuses unless `REWIND_STAGING=1`, which only staging sets. It
 * enqueues the season-open Prepare at once with audience `all`, waits for it
 * and every generation it started, then switches the audience through the
 * same path as the 08:00 job (`openRewindToEveryone`), and prints the timings
 * for `ship-check.md`. With a failed member it stops before the switch; use
 * Retry failed on `/admin/rewind`, then `--switch-only`.
 */

import "dotenv/config"

import { parseArgs } from "node:util"

import { prisma } from "@/lib/prisma"
import { getRewindQueue } from "@/lib/queue/rewind-producers"
import { isRewindStaging } from "@/lib/queue/jobs/rewind-final-cut"
import { JOB_TYPES, type RewindSeasonPreparePayload } from "@/lib/queue/types"
import { rewindFeatureOn } from "@/lib/rewind/features"
import { openRewindToEveryone, seasonAudienceSwitchAt, seasonOpenReadiness, type SeasonOpenReadiness } from "@/lib/rewind/season-open"
import { seasonPrepareAt, seasonZones } from "@/lib/rewind/season-runs"
import { SYSTEM_ACTOR } from "@/lib/session-revocation"
import { serverZone } from "@/lib/utils/server-zone"
import { yearSchema } from "@/lib/validations/shared-schemas"
import { throughFor } from "@/lib/wrapped/aggregate/window"
import { DEFAULT_SEASON } from "@/lib/wrapped/season"

const USAGE = "Usage: npm run rewind:season-open -- --year=<year> [--rehearse | --switch-only]"
const POLL_MS = 30_000

export type SeasonOpenMode = "status" | "rehearse" | "switch-only"

export type ParsedArgs = { ok: true; year: number; mode: SeasonOpenMode } | { ok: false; help: boolean; error?: string }

export function parseSeasonOpenArgs(argv: readonly string[]): ParsedArgs {
  let values
  try {
    values = parseArgs({
      args: [...argv],
      options: {
        year: { type: "string" },
        rehearse: { type: "boolean", default: false },
        "switch-only": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
    }).values
  } catch (error) {
    return { ok: false, help: false, error: error instanceof Error ? error.message : String(error) }
  }
  if (values.help) return { ok: false, help: true }
  const year = yearSchema.safeParse(Number(values.year))
  if (!year.success) return { ok: false, help: false, error: "--year must be a year, such as --year=2026." }
  if (values.rehearse && values["switch-only"]) return { ok: false, help: false, error: "Choose --rehearse or --switch-only, not both." }
  return { ok: true, year: year.data, mode: values.rehearse ? "rehearse" : values["switch-only"] ? "switch-only" : "status" }
}

export interface SeasonOpenSchedule {
  prepareAt: Date
  switchAt: Date
  serverZone: string
  autoOpen: boolean
  audience: string
  enabled: boolean
}

export interface SeasonOpenDeps {
  schedule: (year: number) => Promise<SeasonOpenSchedule>
  staging: () => boolean
  /** Enqueues the season-open Prepare now, audience `all`; returns its job id. */
  enqueuePrepare: (data: RewindSeasonPreparePayload) => Promise<string>
  /** The job's BullMQ state, or null once it is gone. */
  jobState: (jobId: string) => Promise<string | null>
  readiness: (year: number) => Promise<SeasonOpenReadiness>
  open: (year: number) => Promise<{ switched: boolean; notified: number }>
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  print?: (line: string) => void
}

const minutes = (ms: number) => `${(ms / 60_000).toFixed(1)} min`

async function switchAudience(year: number, deps: SeasonOpenDeps, print: (line: string) => void, started: number, now: () => number): Promise<number> {
  const readiness = await deps.readiness(year)
  if (readiness.state === "failures") {
    print(`Not switching: ${readiness.failed} member${readiness.failed === 1 ? "'s Rewind" : "s' Rewinds"} failed. Use Retry failed on /admin/rewind, then run --switch-only.`)
    return 1
  }
  if (readiness.state !== "ready") {
    print(`Not switching: the season-open generation is still running (${readiness.state === "running" ? readiness.generating : 0} generating).`)
    return 1
  }
  const { switched, notified } = await deps.open(year)
  print(switched ? `Audience switched to everyone at +${minutes(now() - started)}; ${notified} ready notifications enqueued.` : "Not switched: Rewind is off, or the audience is already everyone.")
  return switched ? 0 : 1
}

/** Runs the script; returns the exit code (0 done, 1 refused or not switched, 2 bad arguments). */
export async function main(argv: readonly string[], deps: SeasonOpenDeps): Promise<number> {
  const print = deps.print ?? console.log
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const parsed = parseSeasonOpenArgs(argv)
  if (!parsed.ok) {
    if (parsed.error) print(parsed.error)
    print(USAGE)
    return parsed.help ? 0 : 2
  }
  const { year, mode } = parsed

  if (mode === "status") {
    const s = await deps.schedule(year)
    print(`Season-open Prepare: ${s.prepareAt.toISOString()} (00:15 in the westernmost zone), data through ${throughFor(year, { finalCut: false })}.`)
    print(`Audience switch: ${s.switchAt.toISOString()} (08:00 in ${s.serverZone}), ${s.autoOpen ? "scheduled (+season.auto-open is on)" : "by hand: +season.auto-open is off"}.`)
    print(`Now: Rewind ${s.enabled ? "on" : "off"}, audience ${s.audience}.`)
    return 0
  }

  if (!deps.staging()) {
    print("Refusing: the rehearsal runs only on staging (REWIND_STAGING=1).")
    return 1
  }
  const started = now()
  if (mode === "switch-only") return switchAudience(year, deps, print, started, now)

  const through = throughFor(year, { finalCut: false })
  const jobId = await deps.enqueuePrepare({ year, through, audience: "all", triggeredBy: "admin" })
  print(`Enqueued the season-open Prepare (job ${jobId}), audience all, data through ${through}.`)
  for (;;) {
    const state = await deps.jobState(jobId)
    if (state === "failed") {
      print(`The Prepare failed after ${minutes(now() - started)}. See the worker log.`)
      return 1
    }
    if (state === null || state === "completed") {
      const readiness = await deps.readiness(year)
      if (readiness.state !== "running") break
    }
    await sleep(POLL_MS)
  }
  print(`Prepare and generation finished in ${minutes(now() - started)}.`)
  return switchAudience(year, deps, print, started, now)
}

async function loadSchedule(year: number): Promise<SeasonOpenSchedule> {
  const [config, zones, zone] = await Promise.all([
    prisma.config.findUnique({
      where: { id: "config" },
      select: { rewindSeasonOpens: true, rewindDisabledPages: true, rewindAudience: true, rewindEnabled: true },
    }),
    seasonZones(),
    serverZone(),
  ])
  const opens = config?.rewindSeasonOpens ?? DEFAULT_SEASON.opens
  return {
    prepareAt: seasonPrepareAt(year, opens, zones),
    switchAt: seasonAudienceSwitchAt(year, opens, zone),
    serverZone: zone,
    autoOpen: rewindFeatureOn(config, "season.auto-open"),
    audience: config?.rewindAudience ?? "admins",
    enabled: config?.rewindEnabled ?? false,
  }
}

if (require.main === module) {
  const queue = () => getRewindQueue("rewind-batch")
  const deps: SeasonOpenDeps = {
    schedule: loadSchedule,
    staging: isRewindStaging,
    enqueuePrepare: async (data) => {
      const job = await queue().add(JOB_TYPES.REWIND_SEASON_PREPARE, data, {
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
        deduplication: { id: `rewind:prepare-rehearse:${data.year}:${data.through}` },
      })
      return job.id ?? ""
    },
    jobState: async (jobId) => {
      const job = await queue().getJob(jobId)
      return job ? job.getState() : null
    },
    // The rehearsal ran its own Prepare, so the scheduled one need not have completed.
    readiness: (year) => seasonOpenReadiness(year, { requirePrepare: false }),
    open: (year) => openRewindToEveryone(year, SYSTEM_ACTOR),
  }
  main(process.argv.slice(2), deps)
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      console.error("The season-open script failed:", error)
      process.exitCode = 1
    })
    // The queue's Redis connection would keep the process alive.
    .finally(() => prisma.$disconnect().finally(() => process.exit()))
}
