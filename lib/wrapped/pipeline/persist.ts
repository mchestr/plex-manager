/**
 * The final write of a v3 Rewind (design 9.2 steps 8 and 9, FR-40, RWP-14).
 *
 * `RewindDataV3.parse()` validates the whole issue first. In persist mode one
 * `$transaction` then copies the data it replaces into
 * `RewindGeneration.previousData`, writes `PlexWrapped.data` with
 * `dataVersion: 3`, `edition`, `factsHash`, `dataThrough` and
 * `status: 'completed'`, and closes the generation with its `copySource`,
 * `copyPolicy`, `llmCalls` and `costUsd` (from its `LLMUsage` rows). Nothing
 * before this transaction touches the member's Rewind, so a failure anywhere
 * leaves the old data and its share links as they were. After the commit,
 * `afterRewindCompleted()` runs the registered hooks. A dry run writes
 * nothing.
 *
 * @module lib/wrapped/pipeline/persist
 */

import "server-only"

import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { getArchetype } from "@/lib/wrapped/archetypes/catalogue"
import { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"

import { afterRewindCompleted } from "./after-complete"
import type { CopySource } from "./copy-draft"
import type { CopyPolicy } from "./copy-step"

export interface PersistRun {
  generationId: string
  wrappedId: string
  userId: string
  year: number
  /** The facts hash the copy step keyed on (before a model's archetype choice), for the next run's reuse check. */
  inputFactsHash: string
  copySource: CopySource
  copyPolicy: CopyPolicy
  dataThrough: Date
}

/** Validates the issue; throws when it does not match the stored schema. */
export function validateRewind(data: unknown): RewindDataV3 {
  return RewindDataV3.parse(data)
}

async function usageOf(tx: PrismaTransactionClient, generationId: string) {
  const usage = await tx.lLMUsage.aggregate({ where: { generationId }, _count: { _all: true }, _sum: { cost: true } })
  return { llmCalls: usage._count._all, costUsd: usage._sum.cost ?? 0 }
}

/** Writes the issue in one transaction, then runs the post-completion hooks. */
export async function persistRewind(data: RewindDataV3, run: PersistRun): Promise<void> {
  const valid = validateRewind(data)
  const first = await prisma.$transaction(async (tx) => {
    const current = await tx.plexWrapped.findUniqueOrThrow({ where: { id: run.wrappedId }, select: { status: true, data: true } })
    const now = new Date()
    await tx.rewindGeneration.update({
      where: { id: run.generationId },
      data: {
        status: "completed",
        finishedAt: now,
        previousData: current.status === "completed" ? current.data : null,
        factsHash: run.inputFactsHash,
        copySource: run.copySource,
        copyPolicy: run.copyPolicy,
        ...(await usageOf(tx, run.generationId)),
      },
    })
    await tx.plexWrapped.update({
      where: { id: run.wrappedId },
      data: {
        data: JSON.stringify(valid),
        status: "completed",
        error: null,
        generatedAt: now,
        dataVersion: 3,
        edition: valid.edition,
        factsHash: valid.factsHash,
        dataThrough: run.dataThrough,
        ...(valid.window.finalCut && { finalCutAt: now }),
        summary: null,
        archetype: valid.archetype ? getArchetype(valid.archetype.id).name : null,
      },
    })
    return current.status !== "completed"
  })
  await afterRewindCompleted({
    userId: run.userId,
    year: run.year,
    wrappedId: run.wrappedId,
    generationId: run.generationId,
    factsHash: valid.factsHash,
    edition: valid.edition,
    first,
  })
}
