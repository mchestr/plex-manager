/**
 * Enqueues one member's Rewind generation (design 9.1, 9.3).
 *
 * ```
 * PlexWrapped row (created "pending" if missing)
 *   └─ RewindGeneration row: queued, kind, jobId = its own id
 *        └─ rewind-gen add, deduplication id rewind:gen:{year}:{userId}
 *             ├─ BullMQ hands back our job ─► queued
 *             └─ BullMQ hands back a live job ─► this row "skipped", { alreadyQueued: true }
 * ```
 *
 * A `PlexWrapped` row that has not completed mirrors the run ("generating",
 * then "failed" or "completed"), so the v2 pages need no second status source.
 *
 * Deduplication, not a fixed `jobId`, gives single-flight: a fixed id would
 * collide with the completed job BullMQ keeps for 24 hours. A completed
 * `PlexWrapped` row is never set back to "generating", so the viewer and its
 * share links stay live during a regeneration (FR-40).
 *
 * @module
 */

import "server-only"

import { randomUUID } from "node:crypto"

import { prisma } from "@/lib/prisma"
import { getRewindQueue } from "@/lib/queue/rewind-producers"
import { JOB_TYPES, type RewindGenerateUserPayload } from "@/lib/queue/types"
import { toStoredError } from "@/lib/wrapped/generation-errors"

export type RewindGenerationKind = "member" | "admin" | "season" | "final-cut"

/**
 * A hide or unhide's regeneration (P7.7): `no-llm` copy, its own
 * deduplication id (`rewind:hide:{year}:{userId}`) and a 5 s delay that
 * collapse a burst of hides into one run. `followUp` is the job's own re-run
 * after a hide arrived mid-run; it takes no deduplication id, because its
 * still-active job holds that one.
 */
export interface ExclusionRun {
  followUp?: boolean
}

const EXCLUSION_DELAY_MS = 5_000

/** Mirrors a run on a Rewind that has not completed yet; a completed one is never touched (FR-40). */
function markNotCompleted(wrappedId: string, data: { status: string; error: string | null }) {
  return prisma.plexWrapped.updateMany({ where: { id: wrappedId, status: { not: "completed" } }, data })
}

/** 429 and 5xx failures get three attempts, backing off from 30 s (design 9.1). */
const GENERATE_JOB_OPTIONS = { attempts: 3, backoff: { type: "exponential", delay: 30_000 } } as const

/**
 * Creates the rows and adds the `REWIND_GENERATE_USER` job.
 *
 * @returns `alreadyQueued: true` when a job for this member and year is
 * already waiting or running; the new row is then `skipped`
 * @throws when Redis refuses the add; the new row is then `failed`
 *
 * @example
 * ```ts
 * const { alreadyQueued } = await enqueueRewindGeneration({ userId, year: 2026, kind: "member" })
 * ```
 */
export async function enqueueRewindGeneration({
  userId,
  year,
  kind,
  exclusion,
}: {
  userId: string
  year: number
  kind: RewindGenerationKind
  exclusion?: ExclusionRun
}): Promise<{ alreadyQueued: boolean; generationId: string }> {
  await prisma.plexWrapped.createMany({
    data: [{ userId, year, status: "pending", data: "{}" }],
    skipDuplicates: true,
  })
  const wrapped = await prisma.plexWrapped.findUniqueOrThrow({
    where: { userId_year: { userId, year } },
    select: { id: true },
  })

  const generationId = randomUUID()
  await prisma.rewindGeneration.create({
    data: {
      id: generationId,
      wrappedId: wrapped.id,
      userId,
      year,
      kind,
      status: "queued",
      jobId: generationId,
      ...(exclusion && { copyPolicy: "no-llm" }),
    },
  })

  // Before the add, so a run that fails at once cannot be overwritten by this write.
  await markNotCompleted(wrapped.id, { status: "generating", error: null })

  const payload: RewindGenerateUserPayload = { generationId, userId, year, ...(exclusion && { exclusion: true as const }) }
  const deduplicationId = exclusion ? `rewind:hide:${year}:${userId}` : `rewind:gen:${year}:${userId}`
  let jobId: string | undefined
  try {
    const job = await getRewindQueue("rewind-gen").add(JOB_TYPES.REWIND_GENERATE_USER, payload, {
      ...GENERATE_JOB_OPTIONS,
      jobId: generationId,
      ...(exclusion && { delay: EXCLUSION_DELAY_MS }),
      ...(!exclusion?.followUp && { deduplication: { id: deduplicationId } }),
    })
    jobId = job.id
  } catch (error) {
    await prisma.rewindGeneration.update({
      where: { id: generationId },
      data: { status: "failed", error: { code: "JOB_LOST" }, finishedAt: new Date() },
    })
    await markNotCompleted(wrapped.id, { status: "failed", error: toStoredError("JOB_LOST") })
    throw error
  }

  if (jobId !== generationId) {
    await prisma.rewindGeneration.update({
      where: { id: generationId },
      data: { status: "skipped", jobId, error: { code: "ALREADY_QUEUED" }, finishedAt: new Date() },
    })
    return { alreadyQueued: true, generationId }
  }

  return { alreadyQueued: false, generationId }
}
