/**
 * The `REWIND_GENERATE_USER` processor (design 9.1, P2.17).
 *
 * ```
 * RewindGeneration queued ──► lock rw:lock:gen:{year}:{userId}
 *                               ├─ held by another job ─► skipped (LOCKED); an exclusion run waits 30 s, 10 times at most
 *                               └─ taken ─► running ─► generateUserRewind({ mode: 'persist', signal, keepWindow: exclusion })
 *                                             ├─ completed ─► (its one $transaction: previousData, v3 data, completed)
 *                                             │    └─ exclusion run whose exclusionsVersion moved ─► one more run
 *                                             ├─ not eligible ─► skipped with the typed reason
 *                                             └─ error ─► retry (queued) or failed with a typed code
 * ```
 *
 * ## Time limit
 *
 * BullMQ has no job timeout, so the signal is
 * `AbortSignal.any([AbortSignal.timeout(300_000), shutdownSignal])` and every
 * fetch and the LLM call take it. The time limit ends the run as `TIMEOUT`; a
 * shutdown puts it back to `queued` and throws, so BullMQ runs it again.
 *
 * ## Failures (FR-40, RWP-14)
 *
 * A failure marks the generation `failed`, never the data: a completed Rewind
 * keeps its data and share links. A Rewind that has not completed yet mirrors
 * the failure, so the status panels show it. A model failure never fails a
 * run (the pipeline falls back to templates); retryable failures (upstream
 * errors) go back to `queued` while attempts remain (3, backing off from
 * 30 s); the rest throw `UnrecoverableError`. A member who is not eligible
 * ends `skipped` with the pipeline's typed reason. The job never calls
 * `revalidatePath`, which needs a request scope; the status hook refreshes the
 * member's page instead.
 *
 * @module
 */

import { DelayedError, UnrecoverableError, type Job } from "bullmq"

import { Prisma } from "@/lib/generated/prisma/client"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { getRedisConnection } from "@/lib/queue/connection"
import { acquireGenerationLock } from "@/lib/locks/generation-lock"
import type { RewindGenerateUserPayload } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"
import { type RewindErrorCode, toStoredError } from "@/lib/wrapped/generation-errors"
import { enqueueRewindGeneration, type RewindGenerationKind } from "@/lib/rewind/enqueue-generation"
import type { CopyPolicy } from "@/lib/wrapped/pipeline/copy-step"
import { generateUserRewind } from "@/lib/wrapped/pipeline/generate-user"
import { RewindGenerationError } from "@/lib/wrapped/pipeline/generation-error"

const logger = createLogger("REWIND_GENERATE")

const TIME_LIMIT_MS = 300_000

type GenerateResult = { status: "completed" | "skipped" | "ignored" }

interface Run {
  generationId: string
  wrappedId: string
}

/** The run's LLM calls and their cost, from its `LLMUsage` rows. */
async function usageOf(client: PrismaTransactionClient, generationId: string) {
  const usage = await client.lLMUsage.aggregate({
    where: { generationId },
    _count: { _all: true },
    _sum: { cost: true },
  })
  return { llmCalls: usage._count._all, costUsd: usage._sum.cost ?? 0 }
}

/**
 * Ends the run as `failed`, or `skipped` for a member who is not eligible; a
 * Rewind that has not completed shows the code too.
 */
async function fail({ generationId, wrappedId }: Run, code: RewindErrorCode, status: "failed" | "skipped" = "failed"): Promise<void> {
  await prisma.rewindGeneration.update({
    where: { id: generationId },
    data: { status, error: { code }, finishedAt: new Date(), ...(await usageOf(prisma, generationId)) },
  })
  await prisma.plexWrapped.updateMany({
    where: { id: wrappedId, status: { not: "completed" } },
    data: { status: "failed", error: toStoredError(code) },
  })
}

/**
 * Records a failed attempt and decides whether BullMQ tries again.
 * Always throws: a plain error to retry, `UnrecoverableError` to stop.
 */
async function settleFailure(job: Job, run: Run, error: unknown, timedOut: boolean): Promise<never> {
  const attemptsLeft = job.attemptsMade + 1 < (job.opts.attempts ?? 1)
  const retry = async (code: RewindErrorCode, reason: Error): Promise<never> => {
    await prisma.rewindGeneration.update({ where: { id: run.generationId }, data: { status: "queued", error: { code } } })
    throw reason
  }

  if (shutdownSignal.aborted && !timedOut) {
    if (attemptsLeft) return retry("WORKER_LOST", new Error("Worker shut down during the run"))
    await fail(run, "WORKER_LOST")
    throw new UnrecoverableError("WORKER_LOST")
  }
  if (timedOut) {
    await fail(run, "TIMEOUT")
    throw new UnrecoverableError("TIMEOUT")
  }

  const typed = error instanceof RewindGenerationError ? error : null
  const code = typed?.code ?? "GENERATION_FAILED"
  if (attemptsLeft && (typed ? typed.retryable : true)) {
    return retry(code, error instanceof Error ? error : new Error(code))
  }
  await fail(run, code)
  throw new UnrecoverableError(code)
}

const LOCK_WAIT_MS = 30_000
const MAX_LOCK_WAITS = 10

/**
 * An exclusion run that finds the member's lock held waits 30 s and tries
 * again, up to 10 times, instead of ending as `skipped` (P7.7). Throws
 * BullMQ's `DelayedError` while it waits; returns once the waits are spent.
 */
async function waitForLock(job: Job<RewindGenerateUserPayload>): Promise<void> {
  const waits = job.data.lockWaits ?? 0
  if (waits >= MAX_LOCK_WAITS) return
  await job.updateData({ ...job.data, lockWaits: waits + 1 })
  await job.moveToDelayed(Date.now() + LOCK_WAIT_MS, job.token)
  throw new DelayedError()
}

async function exclusionsVersion(userId: string, year: number): Promise<number> {
  const prefs = await prisma.rewindPrefs.findUnique({ where: { userId_year: { userId, year } }, select: { exclusionsVersion: true } })
  return prefs?.exclusionsVersion ?? 0
}

/** A hide or unhide that landed during an exclusion run: run once more, so the new list counts it. */
async function followUpHides(userId: string, year: number, versionRead: number): Promise<void> {
  if ((await exclusionsVersion(userId, year)) === versionRead) return
  try {
    await enqueueRewindGeneration({ userId, year, kind: "member", exclusion: { followUp: true } })
  } catch (error) {
    logger.warn("Could not enqueue the follow-up exclusion run", { userId, year, error: String(error) })
  }
}

const copyPolicyOf = (stored: string): CopyPolicy => (stored === "no-llm" ? "no-llm" : "default")

/** Generates one member's Rewind; see the module comment. */
export async function processRewindGenerateUser(job: Job<RewindGenerateUserPayload>): Promise<GenerateResult> {
  const { generationId, userId, year, audience, through } = job.data
  const generation = await prisma.rewindGeneration.findUnique({
    where: { id: generationId },
    select: { wrappedId: true, status: true, kind: true, copyPolicy: true },
  })
  // A row the stale sweep already closed, or one deleted with its member.
  if (!generation || (generation.status !== "queued" && generation.status !== "running")) {
    return { status: "ignored" }
  }
  const run: Run = { generationId, wrappedId: generation.wrappedId }

  const lock = await acquireGenerationLock(getRedisConnection(), { year, userId, owner: job.id ?? generationId })
  if (!lock && job.data.exclusion) await waitForLock(job)
  if (!lock) {
    await prisma.rewindGeneration.update({
      where: { id: generationId },
      data: { status: "skipped", error: { code: "LOCKED" }, finishedAt: new Date() },
    })
    return { status: "skipped" }
  }

  const timeout = AbortSignal.timeout(TIME_LIMIT_MS)
  const signal = AbortSignal.any([timeout, shutdownSignal])
  try {
    await prisma.rewindGeneration.update({
      where: { id: generationId },
      data: { status: "running", startedAt: new Date(), error: Prisma.DbNull },
    })
    const versionRead = job.data.exclusion ? await exclusionsVersion(userId, year) : null
    const result = await generateUserRewind({
      userId,
      year,
      kind: generation.kind as RewindGenerationKind,
      mode: "persist",
      copyPolicy: copyPolicyOf(generation.copyPolicy),
      signal,
      generationId,
      audience,
      through,
      // A hide or unhide keeps the stored issue's data window.
      keepWindow: job.data.exclusion,
    })
    if (result.status === "skipped") {
      await fail(run, result.reason, "skipped")
      return { status: "skipped" }
    }
    if (versionRead !== null) await followUpHides(userId, year, versionRead)
    return { status: "completed" }
  } catch (error) {
    logger.warn("Rewind generation attempt failed", {
      generationId,
      attempt: job.attemptsMade + 1,
      code: error instanceof RewindGenerationError ? error.code : undefined,
      error: error instanceof Error ? error.message : String(error),
    })
    return await settleFailure(job, run, error, timeout.aborted)
  } finally {
    await lock.release().catch((error: unknown) => {
      logger.warn("Generation lock release failed", { generationId, error: String(error) })
    })
  }
}
