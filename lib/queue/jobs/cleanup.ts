/**
 * The media cleanup jobs (TS 9.3): the library read, the run, the act step
 * and the Plex collection sync. Only the worker runs them. Each passes
 * `shutdownSignal` down, and each result holds numbers and codes only.
 *
 * | Type | Does |
 * |---|---|
 * | `cleanup:read` | A scheduled read with no rule and the feature off deletes snapshots older than 48 hours and skips (`idle`). Else `readLibrary()`. With `chain`, a `cleanup:run` follows with the read's `readStatus`, also after a failed or busy read. With `thenDryRunRuleIds`, a dry run of those rules follows. |
 * | `cleanup:run` | `runCleanup()` with the payload |
 * | `cleanup:act` | Takes the run claim. Busy: adds itself again after 10 minutes with `waits + 1` (its own job id), and after 6 waits writes a `busy` run row. It never acts without the claim. Claimed: up to 3 act steps, the next one only while candidates planned for today are left that a step did not see (an approval during the job). Then the run row, `CLEANUP_RUN`, the release with the change check, and a collection sync. |
 * | `cleanup:collections` | `syncCollections()` |
 *
 * The actor: a scheduled job acts as `SYSTEM_ACTOR`. An admin job acts as its
 * admin while they are still one (`stillAdmin`), else as `SYSTEM_ACTOR`. An
 * act job's approval lives in the database (`approvedBy`), so a stale actor
 * changes only the audit actor.
 *
 * @module lib/queue/jobs/cleanup
 */

import type { Job } from "bullmq"

import type { Block } from "@/lib/cleanup/blocks"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"
import { syncCollections } from "@/lib/cleanup/collections/sync"
import { actStep, candidatesToday, stillAdmin } from "@/lib/cleanup/run/act"
import { releaseRunClaim, takeRunClaim } from "@/lib/cleanup/run/run-claim"
import { BUSY_DELAY_MS, BUSY_WAITS, CLEANUP_JOB_OPTIONS, runCleanup } from "@/lib/cleanup/run/run"
import { busyRunRow, createRunRow, finishRun } from "@/lib/cleanup/run/run-row"
import { readCleanupSettingsRow } from "@/lib/cleanup/settings"
import { readLibrary } from "@/lib/cleanup/snapshot/read"
import { pruneIdleSnapshots } from "@/lib/cleanup/snapshot/store"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { prisma } from "@/lib/prisma"
import { SYSTEM_ACTOR } from "@/lib/session-revocation"
import { createLogger } from "@/lib/utils/logger"

import { addJob } from "../client"
import { JOB_TYPES, type JobPayloadMap } from "../types"

const logger = createLogger("CLEANUP_JOB")

/** The act steps of one act job (TS 9.3, architecture-r2-2). @internal */
export const ACT_ROUNDS = 3

type Payload<T extends keyof JobPayloadMap> = Pick<Job<JobPayloadMap[T]>, "data">

/** The job's actor: the admin while still one, else `SYSTEM_ACTOR`. */
async function actorOf(trigger: string, actorId: string | undefined): Promise<string> {
  if (trigger === "scheduled") return SYSTEM_ACTOR
  const admin = await stillAdmin(actorId)
  if (!admin && actorId) logger.warn("cleanup.actor_not_admin", { trigger })
  return admin ?? SYSTEM_ACTOR
}

async function processRead({ data }: Payload<typeof JOB_TYPES.CLEANUP_READ>) {
  if (data.trigger === "scheduled") {
    const [settings, rules] = await Promise.all([readCleanupSettingsRow(), prisma.cleanupRule.count()])
    if (!settings.enabled && rules === 0) return { skipped: "idle", pruned: await pruneIdleSnapshots() }
  }
  const actorId = await actorOf(data.trigger, data.actorId)
  const read = await readLibrary({ trigger: data.trigger, actorId: actorId === SYSTEM_ACTOR ? null : actorId, signal: shutdownSignal })
  const readStatus = "busy" in read ? "busy" : "status" in read ? read.status : "failed"
  if (data.chain) await addJob(JOB_TYPES.CLEANUP_RUN, { trigger: "scheduled", act: true, readStatus }, CLEANUP_JOB_OPTIONS)
  if (data.thenDryRunRuleIds?.length) {
    await addJob(JOB_TYPES.CLEANUP_RUN, { trigger: "create", actorId, dryRunRuleIds: data.thenDryRunRuleIds, act: false }, CLEANUP_JOB_OPTIONS)
  }
  if ("busy" in read) return { busy: true }
  if ("skipped" in read) return { skipped: read.skipped }
  return { snapshotId: read.snapshotId, status: read.status, failedSources: read.sources.filter((s) => s.state === "failed").map((s) => s.service) }
}

async function processRun({ data }: Payload<typeof JOB_TYPES.CLEANUP_RUN>) {
  return runCleanup({ ...data, actorId: await actorOf(data.trigger, data.actorId), signal: shutdownSignal })
}

async function processAct({ data }: Payload<typeof JOB_TYPES.CLEANUP_ACT>) {
  const actorId = await actorOf(data.trigger, data.actorId)
  const held = await takeRunClaim()
  if (!held) {
    const waits = data.waits ?? 0
    if (waits >= BUSY_WAITS) return (await busyRunRow("act", data.trigger, actorId), { busy: true })
    await addJob(JOB_TYPES.CLEANUP_ACT, { ...data, waits: waits + 1 }, { ...CLEANUP_JOB_OPTIONS, delay: BUSY_DELAY_MS })
    return { busy: true, retry: waits + 1 }
  }
  let runId: string | null = null
  let done: Record<string, unknown>
  try {
    runId = await createRunRow({ kind: "act", trigger: data.trigger, actorId })
    const seen = new Set<string>()
    const blocks: Block[] = []
    let total = { deferred: 0, held: 0, rounds: 0, outcome: "finished" as Awaited<ReturnType<typeof actStep>>["outcome"] }
    for (let round = 0; round < ACT_ROUNDS; round++) {
      const step = await actStep({ runId, trigger: data.trigger, actorId, signal: shutdownSignal, reconciled: false })
      for (const key of step.seen) seen.add(key)
      blocks.push(...step.blocks)
      total = { deferred: total.deferred + step.deferred, held: total.held + step.held, rounds: round + 1, outcome: step.outcome }
      if (step.outcome !== "finished" || (await candidatesToday()).every((key) => seen.has(key))) break
    }
    const counts = await finishRun(runId, { kind: "act", trigger: data.trigger, actorId, outcome: total.outcome, blocks, entries: [], checked: seen.size,
      matched: 0, joined: 0, held: total.held, deferred: total.deferred })
    done = { runId, outcome: total.outcome, rounds: total.rounds, ...counts }
  } catch (error) {
    await releaseRunClaim(held.claim, held.baseline, { actorId, runId }).catch((e: unknown) => logger.error("cleanup.act_release_failed", e, { runId }))
    throw error
  }
  await releaseRunClaim(held.claim, held.baseline, { actorId, runId })
  await requestCollectionSync("act")
  return done
}

async function processCollections() {
  const { collections, added, removed, moved, recreated, busy } = await syncCollections({ signal: shutdownSignal })
  return { collections, added, removed, moved, recreated, busy }
}

const PROCESSORS: Record<string, (job: Job) => Promise<unknown>> = {
  [JOB_TYPES.CLEANUP_READ]: processRead,
  [JOB_TYPES.CLEANUP_RUN]: processRun,
  [JOB_TYPES.CLEANUP_ACT]: processAct,
  [JOB_TYPES.CLEANUP_COLLECTIONS]: processCollections,
}

/** The processor of a media cleanup job type, or null (TS 9.3). */
export function getCleanupProcessor(jobType: string): ((job: Job) => Promise<unknown>) | null {
  return Object.hasOwn(PROCESSORS, jobType) ? PROCESSORS[jobType] : null
}
