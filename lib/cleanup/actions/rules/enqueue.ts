/**
 * The dry runs that the rule actions start (TS 9.2, 10.3 create step 6,
 * `runCleanupRuleDryRun`). Each add carries its own job id beside the
 * deduplication id of `JOB_ID_POLICY`, so the returned id tells whether the
 * add joined a job that waits or runs (the own-id test of TS 9.2,
 * `actions/admin/inactivity.ts` `runMemberActivityNow`). A single-rule dry
 * run carries the rule revision, so a dry run of a newer definition never
 * joins one of an older definition. Server-only.
 *
 * @module lib/cleanup/actions/rules/enqueue
 */

import "server-only"

import { randomUUID } from "node:crypto"

import { loadPreviousCompleteHeader } from "@/lib/cleanup/snapshot/store"
import { isRedisConfigured } from "@/lib/queue/connection"
import { jobIdOptions } from "@/lib/queue/job-id"
import { enqueueFromRequest } from "@/lib/queue/request-path"
import { JOB_TYPES, type JobPayloadMap } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("CLEANUP_RULES")

/** TS 9.2: one attempt, gone when done, a failed job stays 7 days on the Queues page. */
const JOB_OPTIONS = { attempts: 1, removeOnComplete: true, removeOnFail: { age: 7 * 24 * 3600 } }

type CleanupJob = typeof JOB_TYPES.CLEANUP_RUN | typeof JOB_TYPES.CLEANUP_READ

/** Whether the add went in, and whether it joined a job with the same deduplication id. */
export type OwnAdd = { ok: true; joined: boolean } | { ok: false }

async function addOwn<T extends CleanupJob>(type: T, data: JobPayloadMap[T]): Promise<OwnAdd> {
  const jobId = randomUUID()
  const added = await enqueueFromRequest(type, data, { ...JOB_OPTIONS, ...jobIdOptions(type, data), jobId })
  if (!added.ok) {
    logger.warn("cleanup.dry_run_enqueue_failed", { type, code: added.code })
    return { ok: false }
  }
  return { ok: true, joined: added.jobId !== jobId }
}

/**
 * The first dry run of a new rule (TS 10.3 create step 6). With a complete
 * snapshot: `cleanup:run` `{ trigger: "create", dryRunRuleIds: [id],
 * dryRunRevision: 1, act: false }`. With none: a system read that runs the
 * dry run after it (`thenDryRunRuleIds`). A read that joins a pending read
 * loses its dry run, so it counts as not queued. Never fails the create:
 * false without Redis, or when the queue does not answer.
 */
export async function queueFirstDryRun(ruleId: string): Promise<boolean> {
  if (!isRedisConfigured()) return false
  if (!(await loadPreviousCompleteHeader())) {
    const read = await addOwn(JOB_TYPES.CLEANUP_READ, { trigger: "system", chain: false, thenDryRunRuleIds: [ruleId] })
    return read.ok && !read.joined
  }
  const run = await addOwn(JOB_TYPES.CLEANUP_RUN, { trigger: "create", dryRunRuleIds: [ruleId], dryRunRevision: 1, act: false })
  return run.ok
}

/**
 * "Run dry run now" (`runCleanupRuleDryRun`): a dry run of the rule at its
 * current `revision`. A pending dry run of the same rule and revision is the
 * same work, so joining it is fine. One of an older revision has another
 * deduplication id and never swallows this one (TS 9.2, architecture-r2-2).
 */
export function queueRuleDryRun(ruleId: string, revision: number, actorId: string): Promise<OwnAdd> {
  return addOwn(JOB_TYPES.CLEANUP_RUN, { trigger: "admin", actorId, dryRunRuleIds: [ruleId], dryRunRevision: revision, act: false })
}
