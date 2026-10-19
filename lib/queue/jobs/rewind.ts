/**
 * The `REWIND_GENERATE_USER` processor (design 9.1, P2.17).
 *
 * ```
 * RewindGeneration queued ──► lock rw:lock:gen:{year}:{userId}
 *                               ├─ held by another job ─► skipped (LOCKED)
 *                               └─ taken ─► running ─► generateRewindV2(signal)
 *                                             ├─ ok ─► one $transaction: previousData, data, completed
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
 * the failure, so the v2 pages show it. Retryable failures (upstream or
 * provider errors) go back to `queued` while attempts remain (3, backing off
 * from 30 s); the rest throw `UnrecoverableError`. The job never calls
 * `revalidatePath`, which needs a request scope; the status hook refreshes the
 * member's page instead.
 *
 * @module
 */

import { UnrecoverableError, type Job } from "bullmq"

import { Prisma } from "@/lib/generated/prisma/client"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { getRedisConnection } from "@/lib/queue/connection"
import { acquireGenerationLock } from "@/lib/queue/redis-lock"
import type { RewindGenerateUserPayload } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"
import { type RewindErrorCode, toStoredError } from "@/lib/wrapped/generation-errors"
import { generateRewindV2 } from "@/lib/wrapped/pipeline/generate-v2"
import { RewindGenerationError } from "@/lib/wrapped/pipeline/generation-error"
import type { WrappedData } from "@/types/wrapped"

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

/** Writes the result atomically, keeping the data it replaces (RWP-14). */
async function complete({ generationId, wrappedId }: Run, data: WrappedData): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.plexWrapped.findUniqueOrThrow({
      where: { id: wrappedId },
      select: { status: true, data: true },
    })
    const now = new Date()
    await tx.rewindGeneration.update({
      where: { id: generationId },
      data: {
        status: "completed",
        finishedAt: now,
        previousData: current.status === "completed" ? current.data : null,
        ...(await usageOf(tx, generationId)),
      },
    })
    await tx.plexWrapped.update({
      where: { id: wrappedId },
      data: {
        data: JSON.stringify(data),
        status: "completed",
        error: null,
        generatedAt: now,
        dataVersion: 2,
        summary: data.summary || null,
        archetype: data.archetype?.name || null,
      },
    })
  })
}

/** Ends the run as `failed`; a Rewind that has not completed shows the failure too. */
async function fail({ generationId, wrappedId }: Run, code: RewindErrorCode): Promise<void> {
  await prisma.rewindGeneration.update({
    where: { id: generationId },
    data: { status: "failed", error: { code }, finishedAt: new Date(), ...(await usageOf(prisma, generationId)) },
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

/** Generates one member's Rewind; see the module comment. */
export async function processRewindGenerateUser(job: Job<RewindGenerateUserPayload>): Promise<GenerateResult> {
  const { generationId, userId, year } = job.data
  const generation = await prisma.rewindGeneration.findUnique({
    where: { id: generationId },
    select: { wrappedId: true, status: true },
  })
  // A row the stale sweep already closed, or one deleted with its member.
  if (!generation || (generation.status !== "queued" && generation.status !== "running")) {
    return { status: "ignored" }
  }
  const run: Run = { generationId, wrappedId: generation.wrappedId }

  const lock = await acquireGenerationLock(getRedisConnection(), { year, userId, owner: job.id ?? generationId })
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
    const data = await generateRewindV2({ userId, year, wrappedId: run.wrappedId, generationId, signal })
    await complete(run, data)
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
