/**
 * Roll back a member's Rewind (P7.9, design 7.9).
 *
 * Every completed generation keeps the `PlexWrapped.data` it replaced in
 * `RewindGeneration.previousData`. Rolling back takes the latest completed
 * generation that has it, checks it with `parseStoredRewind()`, and in one
 * `$transaction`:
 *
 * 1. writes that data back to `PlexWrapped` (`data`, `dataVersion`,
 *    `edition`, `factsHash`, `dataThrough` and the columns derived from them);
 * 2. creates a completed `RewindGeneration` (`kind: 'admin'`) whose
 *    `previousData` holds the data it replaced, so a second roll back undoes
 *    the first;
 * 3. writes `REWIND_ROLLED_BACK`, so the change and its audit row commit
 *    together.
 *
 * The caller holds the member's generation lock and has checked that no run
 * is queued or running. Cards are keyed by `factsHash`, so nothing else needs
 * invalidating.
 *
 * @module lib/rewind/rollback
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"
import { dataThroughDate } from "@/lib/wrapped/aggregate/window"
import { getArchetype } from "@/lib/wrapped/archetypes/catalogue"
import { parseStoredRewind, type StoredRewind } from "@/lib/wrapped/data/parse-stored"

type ValidStored = Exclude<StoredRewind, { version: "invalid" }>

export type RollbackRefusal = "NO_PREVIOUS" | "UNREADABLE"

/** The latest completed generation of `userId`'s `year` that kept the data it replaced. */
async function latestSource(userId: string, year: number) {
  return prisma.rewindGeneration.findFirst({
    where: { userId, year, status: "completed", previousData: { not: null } },
    orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, wrappedId: true, previousData: true },
  })
}

/** When the stored version was generated, as an ISO string, or null when it does not say. */
function generatedAtOf(stored: ValidStored): string | null {
  const iso = stored.version === 3 ? stored.data.generatedAt : stored.legacy.generatedAt
  return iso && !Number.isNaN(Date.parse(iso)) ? iso : null
}

/**
 * What a roll back of `userId`'s `year` would restore: the version's date
 * (for "Roll back to the version from {date}?"), or why there is nothing to
 * restore.
 */
export async function findRollbackTarget(
  userId: string,
  year: number
): Promise<{ ok: true; from: string | null } | { ok: false; reason: RollbackRefusal }> {
  const source = await latestSource(userId, year)
  if (!source) return { ok: false, reason: "NO_PREVIOUS" }
  const stored = parseStoredRewind(source.previousData)
  if (stored.version === "invalid") return { ok: false, reason: "UNREADABLE" }
  return { ok: true, from: generatedAtOf(stored) }
}

/** The `PlexWrapped` columns a stored version sets, beside its `data`. */
function columnsOf(stored: ValidStored) {
  if (stored.version === 3) {
    const { data } = stored
    return {
      dataVersion: 3,
      edition: data.edition,
      factsHash: data.factsHash,
      dataThrough: dataThroughDate(data.window.through),
      generatedAt: new Date(data.generatedAt),
      finalCutAt: data.window.finalCut ? new Date(data.generatedAt) : null,
      archetype: data.archetype ? getArchetype(data.archetype.id).name : null,
      summary: null,
    }
  }
  const generatedAt = generatedAtOf(stored)
  return {
    dataVersion: stored.version,
    edition: null,
    factsHash: null,
    dataThrough: null,
    finalCutAt: null,
    ...(generatedAt && { generatedAt: new Date(generatedAt) }),
    archetype: stored.legacy.archetype?.name ?? null,
    summary: stored.legacy.summary ?? null,
  }
}

export type RollbackResult =
  | { ok: true; generationId: string; sourceGenerationId: string }
  | { ok: false; reason: RollbackRefusal }

/** Restores the previous version of `userId`'s `year` for `adminId`, in one audited transaction. */
export async function rollbackStoredRewind({
  userId,
  year,
  adminId,
}: {
  userId: string
  year: number
  adminId: string
}): Promise<RollbackResult> {
  const source = await latestSource(userId, year)
  if (!source?.previousData) return { ok: false, reason: "NO_PREVIOUS" }
  const stored = parseStoredRewind(source.previousData)
  if (stored.version === "invalid") return { ok: false, reason: "UNREADABLE" }
  const previousData = source.previousData

  const generationId = await prisma.$transaction(async (tx) => {
    const current = await tx.plexWrapped.findUniqueOrThrow({ where: { id: source.wrappedId }, select: { status: true, data: true } })
    const now = new Date()
    await tx.plexWrapped.update({
      where: { id: source.wrappedId },
      data: { data: previousData, status: "completed", error: null, ...columnsOf(stored) },
    })
    const generation = await tx.rewindGeneration.create({
      data: {
        wrappedId: source.wrappedId,
        userId,
        year,
        kind: "admin",
        status: "completed",
        startedAt: now,
        finishedAt: now,
        previousData: current.status === "completed" ? current.data : null,
        // The next run's copy-reuse check reads the latest completed generation's
        // hash; the restored issue's own hash keeps it paired with the restored copy.
        factsHash: stored.version === 3 ? stored.data.factsHash : null,
        copySource: stored.version === 3 ? stored.data.copySource : null,
      },
      select: { id: true },
    })
    await recordAuditEvent(
      AuditEventType.REWIND_ROLLED_BACK,
      adminId,
      { targetUserId: userId, year, wrappedId: source.wrappedId, sourceGenerationId: source.id, generationId: generation.id },
      tx
    )
    return generation.id
  })

  return { ok: true, generationId, sourceGenerationId: source.id }
}
