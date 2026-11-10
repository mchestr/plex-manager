/**
 * The jobs that the settings actions start (TS 9.2, 9.5, 10.3, 7.10):
 * "Run all rules now", "Refresh data now", the first library read and the
 * read of new G13 collection names. Server-only.
 *
 * "Run all rules now" and "Refresh data now" own their job, as
 * `runMemberActivityNow` does (`actions/admin/inactivity.ts`):
 *
 * 1. Without `REDIS_URL`: `VALIDATION` (TS 9.5 item 4).
 * 2. The claim of the job is held: `CONFLICT`.
 * 3. A job with the same deduplication id waits or runs: `CONFLICT`. A queue
 *    that does not answer: `UPSTREAM_UNAVAILABLE` (TS 9.5 item 5).
 * 4. The add carries its own id beside the deduplication id. Another id back
 *    means that it joined a job added a moment earlier: `CONFLICT`.
 *
 * A manual run never deletes: it has `act: false` (UX 0.4 item 6).
 *
 * @module lib/cleanup/actions/settings/enqueue
 */

import "server-only"

import { randomUUID } from "node:crypto"

import { isClaimHeld } from "@/lib/cleanup/claims"
import { normTitle } from "@/lib/cleanup/collections/text"
import { CLEANUP_JOB_OPTIONS } from "@/lib/cleanup/constants"
import { readCleanupSettingsRow } from "@/lib/cleanup/settings"
import { loadPreviousCompleteHeader } from "@/lib/cleanup/snapshot/store"
import { prisma } from "@/lib/prisma"
import { isRedisConfigured } from "@/lib/queue/connection"
import { jobIdOptions } from "@/lib/queue/job-id"
import { enqueueFromRequest, isDeduplicatedJobPending } from "@/lib/queue/request-path"
import { JOB_TYPES, type JobPayloadMap } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"

const logger = createLogger("CLEANUP_SETTINGS")

type CleanupJob = typeof JOB_TYPES.CLEANUP_RUN | typeof JOB_TYPES.CLEANUP_READ

/** Why a start was refused: no Redis, a held or pending job, or a queue that does not answer. */
export type StartRefusal = "VALIDATION" | "CONFLICT" | "UPSTREAM_UNAVAILABLE"
export type StartResult = { ok: true } | { ok: false; code: StartRefusal }

const refused = (code: StartRefusal): StartResult => ({ ok: false, code })

/** The deduplication id that `JOB_ID_POLICY` gives the job. */
function deduplicationId<T extends CleanupJob>(type: T, data: JobPayloadMap[T]): string {
  return jobIdOptions(type, data).deduplication?.id ?? type
}

/** Steps 3 and 4: refuses a pending job, then adds the job with its own id. */
async function addOwn<T extends CleanupJob>(type: T, data: JobPayloadMap[T]): Promise<StartResult> {
  const id = deduplicationId(type, data)
  const pending = await isDeduplicatedJobPending(id)
  if (!pending.ok) return refused("UPSTREAM_UNAVAILABLE")
  if (pending.value) return refused("CONFLICT")
  const jobId = randomUUID()
  const added = await enqueueFromRequest(type, data, { ...CLEANUP_JOB_OPTIONS, deduplication: { id }, jobId })
  if (!added.ok) return refused("UPSTREAM_UNAVAILABLE")
  return added.jobId === jobId ? { ok: true } : refused("CONFLICT")
}

/**
 * Starts "Run all rules now" (`run`: `cleanup:run` `{ trigger: "admin",
 * act: false }` and the run claim) or "Refresh data now" (`read`:
 * `cleanup:read` `{ trigger: "admin", chain: false }` and the read claim).
 */
export async function startAdminJob(kind: "run" | "read", actorId: string): Promise<StartResult> {
  if (!isRedisConfigured()) return refused("VALIDATION")
  const settings = await readCleanupSettingsRow()
  if (isClaimHeld(kind === "run" ? settings.runClaimAt : settings.readClaimAt)) return refused("CONFLICT")
  return kind === "run"
    ? addOwn(JOB_TYPES.CLEANUP_RUN, { trigger: "admin", actorId, act: false })
    : addOwn(JOB_TYPES.CLEANUP_READ, { trigger: "admin", actorId, chain: false })
}

/**
 * The first library read (TS 7.10, `startCleanupFirstRead`): a system read,
 * only while no complete snapshot exists, no read holds its claim and no
 * read waits or runs. Without Redis, or when the queue does not answer, it
 * enqueues nothing. True when this call added the read.
 */
export async function startFirstRead(now: Date = new Date()): Promise<boolean> {
  if (!isRedisConfigured()) return false
  const [snapshot, settings] = await Promise.all([
    prisma.cleanupSnapshot.findFirst({ where: { status: "complete" }, select: { id: true } }),
    readCleanupSettingsRow(),
  ])
  if (snapshot || isClaimHeld(settings.readClaimAt, now)) return false
  return (await addOwn(JOB_TYPES.CLEANUP_READ, { trigger: "system", chain: false })).ok
}

/**
 * A G13 name that the newest complete snapshot did not read starts a system
 * read (TS 10.3 `updateCleanupSettings` step 3, 7.10). Until it ends, G13 is
 * Unknown for that name. A read that waits or runs is joined: it reads the
 * names that are saved when it starts. Never fails the save. True when a
 * read was added or joined.
 */
export async function readNewCollections(options: CleanupOptions): Promise<boolean> {
  const names = options.protections.g13.collections
  if (names.length === 0 || !isRedisConfigured()) return false
  const header = await loadPreviousCompleteHeader()
  const read = new Set((header?.facts?.membersRead ?? []).map(normTitle))
  if (names.every((name) => read.has(normTitle(name)))) return false
  const queued = await enqueueFromRequest(JOB_TYPES.CLEANUP_READ, { trigger: "system", chain: false }, CLEANUP_JOB_OPTIONS)
  if (!queued.ok) logger.warn("cleanup.collections_read_enqueue_failed", { code: queued.code })
  return queued.ok
}
