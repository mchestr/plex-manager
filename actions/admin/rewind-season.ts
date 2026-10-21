"use server"

import { randomUUID } from "node:crypto"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { requireAdmin } from "@/lib/admin"
import { userRewind } from "@/lib/admin/routes"
import { prisma } from "@/lib/prisma"
import { getRedisConnection } from "@/lib/queue/connection"
import { acquireGenerationLock } from "@/lib/queue/redis-lock"
import { checkRewindInfra } from "@/lib/queue/rewind-infra"
import { hasActiveGeneration } from "@/lib/rewind/generation-guards"
import { rewindInfraMessage } from "@/lib/rewind/infra-copy"
import { findRollbackTarget, rollbackStoredRewind } from "@/lib/rewind/rollback"
import {
  enqueueGenerateAll,
  enqueueSeasonPrepare,
  finalCutOpensAt,
  seasonThrough,
  seasonZones,
  type RunStarted,
} from "@/lib/rewind/season-runs"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { userIdSchema, yearSchema } from "@/lib/validations/shared-schemas"
import { getSeasonCounts, type SeasonCounts } from "@/lib/wrapped/admin/season"
import { loadSeasonEstimate } from "@/lib/wrapped/admin/season-estimate"

const yearInput = z.object({ year: yearSchema })

/** FR-50: nothing is queued without Redis. */
async function infraRefusal() {
  const infra = await checkRewindInfra()
  return infra.ok ? null : fail("UPSTREAM_UNAVAILABLE", rewindInfraMessage(infra.code, "admin"))
}

/**
 * Prepare season (P7.8): the server aggregate, the metadata warm, then
 * Generate all, for the configured audience. Joins a run already waiting or
 * running. Audit-logged with the member count and the cost estimate.
 */
export const prepareRewindSeason = adminAction({
  input: yearInput,
  fallbackError: "Could not start Prepare season",
  handler: async ({ year }, { userId }) => {
    const refused = await infraRefusal()
    if (refused) return refused
    const through = await seasonThrough(year)
    const estimate = await loadSeasonEstimate(year, through, "all")
    const run = await enqueueSeasonPrepare({ year, through, audience: "config", triggeredBy: "admin" })
    logAuditEvent(AuditEventType.REWIND_SEASON_PREPARED, userId, {
      year,
      through,
      audience: "config",
      members: estimate.members,
      estimatedCostUsd: estimate.costUsd,
      jobId: run.jobId,
      alreadyQueued: run.alreadyQueued,
    })
    return ok<RunStarted>(run)
  },
})

/** Starts a fan-out of `scope` with the buttons' audience, and audits it. */
async function startFanOut(year: number, scope: "all" | "failed", adminId: string) {
  const refused = await infraRefusal()
  if (refused) return refused
  const through = await seasonThrough(year)
  const estimate = await loadSeasonEstimate(year, through, scope)
  const run = await enqueueGenerateAll({ year, through, audience: "config", scope })
  const type = scope === "all" ? AuditEventType.REWIND_GENERATE_ALL_STARTED : AuditEventType.REWIND_RETRY_FAILED
  logAuditEvent(type, adminId, {
    year,
    through,
    audience: "config",
    members: estimate.members,
    estimatedCostUsd: estimate.costUsd,
    jobId: run.jobId,
  })
  return ok<RunStarted>(run)
}

/**
 * Generate all (BP-22): one `REWIND_GENERATE_USER` per member, leaving out
 * members whose generation is queued or running.
 */
export const generateAllRewinds = adminAction({
  input: yearInput,
  fallbackError: "Could not start Generate all",
  handler: async ({ year }, { userId }) => startFanOut(year, "all", userId),
})

/** Retry failed: only members whose latest run failed (`WORKER_LOST` and `JOB_LOST` included). */
export const retryFailedRewinds = adminAction({
  input: yearInput,
  fallbackError: "Could not retry the failed Rewinds",
  handler: async ({ year }, { userId }) => startFanOut(year, "failed", userId),
})

/** The final cut's opening copy, shown on the disabled button. */
const FINAL_CUT_NOT_YET = "Available from 1 January"

/**
 * Run final cut: refused until 1 January has begun in the westernmost zone.
 * P8.5 registers `REWIND_FINAL_CUT` and replaces the second refusal with the
 * enqueue and its `REWIND_FINAL_CUT_STARTED` audit entry, and enables the button.
 *
 * @internal until P8.5 wires the console's button to it
 */
export const runRewindFinalCut = adminAction({
  input: yearInput,
  fallbackError: "Could not start the final cut",
  handler: async ({ year }) => {
    if (Date.now() < finalCutOpensAt(year, await seasonZones()).getTime()) return fail("CONFLICT", FINAL_CUT_NOT_YET)
    return fail("CONFLICT", "The final cut arrives in a later release")
  },
})

/**
 * The progress poll (BP-22): counts by state, edition and copy source, never
 * a Rewind's data.
 */
export const getRewindSeasonStatus = adminAction({
  input: yearInput,
  fallbackError: "Could not load the season's progress",
  handler: async ({ year }) => ok<SeasonCounts>(await getSeasonCounts(year)),
})

/** When the newest aggregate for `year` was computed, as an ISO string, or null (admin only). */
export async function getRewindSeasonDataPreparedAt(year: number): Promise<string | null> {
  await requireAdmin()
  const parsed = yearInput.safeParse({ year })
  if (!parsed.success) return null
  const latest = await prisma.rewindServerAggregate.findFirst({
    where: { year: parsed.data.year },
    orderBy: { computedAt: "desc" },
    select: { computedAt: true },
  })
  return latest?.computedAt.toISOString() ?? null
}

const memberYearInput = z.object({ userId: userIdSchema, year: yearSchema })

const ROLLBACK_REFUSALS = {
  NO_PREVIOUS: fail("NOT_FOUND", "There is no earlier version of this Rewind to roll back to"),
  UNREADABLE: fail("CONFLICT", "The earlier version could not be read, so it was not restored"),
} as const

const RUN_ACTIVE = fail("CONFLICT", "This Rewind is generating. Roll back once the run ends")

/** The date of the version a roll back would restore, for its confirm (P7.9). */
export const getRewindRollbackTarget = adminAction({
  input: memberYearInput,
  fallbackError: "Could not load the earlier version",
  handler: async ({ userId, year }) => {
    const target = await findRollbackTarget(userId, year)
    return target.ok ? ok({ from: target.from }) : ROLLBACK_REFUSALS[target.reason]
  },
})

/**
 * Roll back (P7.9, design 7.9): restores the member's previous Rewind in one
 * audited transaction, under the member's generation lock. Refused while a
 * run is queued or running, without an earlier version, or when that version
 * does not parse. A second roll back undoes the first.
 */
export const rollbackRewind = adminAction({
  input: memberYearInput,
  fallbackError: "Could not roll back the Rewind",
  handler: async ({ userId, year }, { userId: adminId }) => {
    const refused = await infraRefusal()
    if (refused) return refused
    if (await hasActiveGeneration(userId, year)) return RUN_ACTIVE
    const lock = await acquireGenerationLock(getRedisConnection(), { year, userId, owner: `rollback:${randomUUID()}` })
    if (!lock) return RUN_ACTIVE
    try {
      // Checked again under the lock: a run queued in between would overwrite the roll back.
      if (await hasActiveGeneration(userId, year)) return RUN_ACTIVE
      const result = await rollbackStoredRewind({ userId, year, adminId })
      if (!result.ok) return ROLLBACK_REFUSALS[result.reason]
      revalidatePath(userRewind(userId, year))
      revalidatePath("/admin/rewind")
      return ok({ generationId: result.generationId })
    } finally {
      await lock.release()
    }
  },
})
