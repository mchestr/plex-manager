/**
 * One member activity run: the last seen read from Tautulli
 * (`lib/inactivity/sync.ts`), then the inactivity sweep
 * (`lib/inactivity/sweep.ts`), which removes no one unless an admin turned
 * it on. The daily job and an admin's "Run now" both land here.
 *
 * ## Steps
 *
 * 1. Claim the run on the settings row (`InactivitySettings.runStartedAt`), so
 *    two runs never overlap; a claim older than 30 minutes is stale and taken
 *    over. Busy returns `{ busy: true }` and records nothing.
 * 2. Create the `InactivityRun` row, so the sweep's audit rows carry its id.
 * 3. Read last seen. A failed read blocks the sweep (`sync_failed`) and stores
 *    the code in `error`. A scheduled run on a server without Tautulli while
 *    the sweep is off records nothing and returns null.
 * 4. Sweep, with `readSince` = this run's start: only members this read found
 *    count as read.
 * 5. Store the counts and entries, keep the newest {@link KEPT_RUNS} runs, and
 *    write `INACTIVITY_SWEEP_RUN` when the sweep is on or an admin started
 *    the run.
 * 6. Release the claim, whatever happened.
 *
 * A database or Redis error in steps 2 to 5 is thrown and leaves the run row
 * without `finishedAt`; the removals before it keep their audit rows.
 *
 * @module lib/inactivity/run
 */

import "server-only"

import type { InactivityBlock } from "@/lib/inactivity/blocks"
import { getInactivitySettings, INACTIVITY_SETTINGS_ID } from "@/lib/inactivity/settings"
import { runSweep, type MemberActivityTrigger, type SweepResult } from "@/lib/inactivity/sweep"
import { syncLastSeen } from "@/lib/inactivity/sync"
import { prisma } from "@/lib/prisma"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("INACTIVITY_RUN")

/** Runs kept for the admin page. @internal */
export const KEPT_RUNS = 30
/** After this long a claim counts as left behind by a crashed run. @internal */
export const CLAIM_STALE_MS = 30 * 60 * 1000

export type MemberActivityResult =
  | { busy: true }
  | {
      busy: false
      runId: string
      /** Members whose last seen was read. */
      matched: number
      qualified: number
      removed: number
      failed: number
      blocked: InactivityBlock | null
      /** Why the last seen read failed. */
      error: string | null
    }

interface RunOptions {
  /** The admin who started the run, or `SYSTEM_ACTOR`. */
  actorId: string
  /** The member count the admin confirmed; an admin run removes no one when more qualify. */
  confirmedRemovals?: number
  signal?: AbortSignal
  now?: Date
}

const ID = { id: INACTIVITY_SETTINGS_ID }

/** True when this run took the claim. */
async function claim(now: Date): Promise<boolean> {
  await prisma.inactivitySettings.upsert({ where: ID, create: ID, update: {} })
  const { count } = await prisma.inactivitySettings.updateMany({
    where: { ...ID, OR: [{ runStartedAt: null }, { runStartedAt: { lt: new Date(now.getTime() - CLAIM_STALE_MS) } }] },
    data: { runStartedAt: now },
  })
  return count > 0
}

async function prune() {
  const old = await prisma.inactivityRun.findMany({ orderBy: { startedAt: "desc" }, skip: KEPT_RUNS, select: { id: true } })
  if (old.length > 0) await prisma.inactivityRun.deleteMany({ where: { id: { in: old.map((row) => row.id) } } })
}

async function claimedRun(
  trigger: MemberActivityTrigger,
  { actorId, confirmedRemovals, signal, now }: RunOptions & { now: Date }
): Promise<MemberActivityResult | null> {
  const settings = await getInactivitySettings()
  // startedAt is the instant the read stamps on lastSeenReadAt, so the admin
  // page's preview can tell which members this run's read found
  const { id: runId } = await prisma.inactivityRun.create({
    data: { trigger, startedAt: now, entries: [] },
    select: { id: true },
  })

  const sync = await syncLastSeen({ now, signal })
  if (!sync.ok && sync.code === "NO_TAUTULLI" && trigger === "scheduled" && !settings.enabled) {
    await prisma.inactivityRun.delete({ where: { id: runId } })
    return null
  }

  const sweep: SweepResult = sync.ok
    ? await runSweep({ runId, trigger, actorId, confirmedRemovals, settings, now, signal, readSince: now, newestPlayAt: sync.newestPlayAt })
    : { qualified: 0, removed: 0, failed: 0, entries: [], blocked: "sync_failed" }
  const { qualified, removed, failed, blocked } = sweep
  const { tautulliUsers, matched } = sync.ok ? sync : { tautulliUsers: 0, matched: 0 }
  const error = sync.ok ? null : sync.code

  await prisma.inactivityRun.update({
    where: { id: runId },
    data: { finishedAt: new Date(), tautulliUsers, matched, qualified, removed, failed, blocked, error, entries: sweep.entries },
  })
  await prune()

  if (settings.enabled || trigger === "admin") {
    const details = { runId, trigger, thresholdDays: settings.thresholdDays, qualified, removed, failed, blocked }
    await recordAuditEvent(AuditEventType.INACTIVITY_SWEEP_RUN, actorId, details).catch((auditError: unknown) =>
      logger.error("inactivity.run_audit_failed", auditError, { runId })
    )
  }
  logger.info("inactivity.run_finished", { runId, trigger, qualified, removed, failed, blocked, error })
  return { busy: false, runId, matched, qualified, removed, failed, blocked, error }
}

/** Whether a run holds the claim now: taken less than 30 minutes before `now`. */
export async function isRunInProgress(now = new Date()): Promise<boolean> {
  const row = await prisma.inactivitySettings.findUnique({ where: ID, select: { runStartedAt: true } })
  return Boolean(row?.runStartedAt && now.getTime() - row.runStartedAt.getTime() < CLAIM_STALE_MS)
}

/**
 * Runs the last seen read and the sweep once, and records the run. Returns
 * `{ busy: true }` while another run holds the claim, and null for a
 * scheduled run with nothing to do. Throws only on a database or Redis error.
 */
export async function runMemberActivity(
  trigger: MemberActivityTrigger,
  { now = new Date(), ...options }: RunOptions
): Promise<MemberActivityResult | null> {
  if (!(await claim(now))) {
    logger.info("inactivity.run_busy", { trigger })
    return { busy: true }
  }
  try {
    return await claimedRun(trigger, { ...options, now })
  } finally {
    await prisma.inactivitySettings.updateMany({ where: { ...ID, runStartedAt: now }, data: { runStartedAt: null } })
  }
}
