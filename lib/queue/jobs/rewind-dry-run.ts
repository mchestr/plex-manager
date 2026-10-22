/**
 * The `REWIND_DRY_RUN` processor on `rewind-aux` (P7.10).
 *
 * ```
 * startRewindDryRun ─► REWIND_DRY_RUN { previewId, adminId, input }
 *   └─ runDryRun (generateUserRewind, mode "dry-run") ─► rw:preview:<previewId>, 1 hour
 *        ├─ completed ─► { data, trail }
 *        ├─ not eligible ─► { skipped, reason }
 *        └─ error ─► { failed, code }
 * ```
 *
 * A dry run can take 90 s, longer than a proxy lets a request live, so it is
 * a job. It has one attempt and the generation job's limit,
 * `AbortSignal.any([AbortSignal.timeout(300_000), shutdownSignal])`. It
 * writes no `PlexWrapped`, `RewindGeneration` or `RewindView` row.
 *
 * @module lib/queue/jobs/rewind-dry-run
 */

import { UnrecoverableError, type Job } from "bullmq"

import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { getRedisConnection } from "@/lib/queue/connection"
import type { RewindDryRunPayload } from "@/lib/queue/types"
import { runDryRun, UnknownFixtureError } from "@/lib/rewind/dry-run/run"
import { saveDryRun } from "@/lib/rewind/dry-run/store"
import { createLogger } from "@/lib/utils/logger"
import { RewindGenerationError } from "@/lib/wrapped/pipeline/generation-error"

const logger = createLogger("REWIND_DRY_RUN")

const TIME_LIMIT_MS = 300_000

function failureCode(error: unknown, timedOut: boolean): string {
  if (timedOut) return "TIMEOUT"
  if (shutdownSignal.aborted) return "WORKER_LOST"
  if (error instanceof UnknownFixtureError) return "NOT_FOUND"
  return error instanceof RewindGenerationError ? error.code : "GENERATION_FAILED"
}

/** Runs one dry run and stores its result for the preview; see the module comment. */
export async function processRewindDryRun(job: Job<RewindDryRunPayload>): Promise<{ status: "completed" | "skipped" }> {
  const { previewId, adminId, input } = job.data
  const redis = getRedisConnection()
  const base = { subject: input.subject, year: input.year, adminId }
  const timeout = AbortSignal.timeout(TIME_LIMIT_MS)
  try {
    const result = await runDryRun(input, AbortSignal.any([timeout, shutdownSignal]))
    const finishedAt = new Date().toISOString()
    if (result.status === "skipped") {
      await saveDryRun(redis, previewId, { ...base, status: "skipped", reason: result.reason, finishedAt })
      return { status: "skipped" }
    }
    // A JSON round trip keeps only what the preview can read back.
    const trail = JSON.parse(JSON.stringify(result.trail)) as Record<string, unknown>
    await saveDryRun(redis, previewId, { ...base, status: "completed", data: result.data, trail, finishedAt })
    return { status: "completed" }
  } catch (error) {
    const code = failureCode(error, timeout.aborted)
    logger.warn("Rewind dry run failed", { previewId, code, error: error instanceof Error ? error.message : String(error) })
    await saveDryRun(redis, previewId, { ...base, status: "failed", code, finishedAt: new Date().toISOString() })
    throw new UnrecoverableError(code)
  }
}
