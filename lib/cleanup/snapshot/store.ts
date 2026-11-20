/**
 * The stored library data (TS 2.7, 7.1, 7.9, E4): one `CleanupSnapshot`
 * header row and three `CleanupSnapshotPart` rows (movie, show, season) for
 * each library read. Server-only: the parts hold plex.tv account ids.
 *
 * A read creates its header as `reading` ({@link createSnapshotHeader}),
 * then writes the three parts and the `complete` header in one transaction
 * ({@link writeSnapshot}), or marks the header `failed`
 * ({@link failSnapshot}). Only a `reading` header can become `complete` or
 * `failed`, so a read that a prune or a timeout gave up never completes late.
 *
 * Retention (TS 2.7): {@link pruneSnapshots} keeps the 2 newest complete
 * rows and a `reading` row younger than 1 hour, and deletes `failed` rows
 * older than 1 day. With no rule and the feature off, the idle read job
 * deletes every snapshot older than 48 hours ({@link pruneIdleSnapshots}), so
 * a removed member's id leaves within 2 days. Parts go with their header
 * (`onDelete: Cascade`).
 *
 * @module lib/cleanup/snapshot/store
 */

import "server-only"

import {
  parseSnapshotFacts,
  parseSourceStatuses,
  type SnapshotFacts,
  type SnapshotItem,
  type SourceStatus,
} from "@/lib/cleanup/schema/snapshot"
import type { CleanupSnapshot } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { LEVELS, type Level } from "@/lib/validations/cleanup-vocabulary"

const logger = createLogger("CLEANUP_SNAPSHOT")

/** A part above this size fails the read (`PART_TOO_LARGE`, TS 7.9). @internal */
export const MAX_PART_BYTES = 20 * 1024 * 1024
/** The newest complete snapshots that stay. @internal */
export const KEPT_COMPLETE = 2
const HOUR_MS = 60 * 60_000
/** A `reading` header older than this was left by a read that stopped. @internal */
export const READING_MAX_AGE_MS = HOUR_MS
/** A `failed` header stays a day, for the page's last-read line. @internal */
export const FAILED_MAX_AGE_MS = 24 * HOUR_MS
/** The idle path deletes snapshots older than this. @internal */
export const IDLE_MAX_AGE_MS = 48 * HOUR_MS

export type SnapshotTrigger = "scheduled" | "admin" | "system"

/** A header row with its `Json` columns parsed. `facts` is null unless the snapshot is complete and its facts parse. */
export interface SnapshotHeader {
  id: string
  status: string
  trigger: string
  actorId: string | null
  startedAt: Date
  finishedAt: Date | null
  sources: SourceStatus[]
  facts: SnapshotFacts | null
}

/** The parsed header of a row. Never throws. */
export function toHeader(row: CleanupSnapshot): SnapshotHeader {
  const { id, status, trigger, actorId, startedAt, finishedAt } = row
  const facts = status === "complete" ? parseSnapshotFacts(row.facts) : null
  return { id, status, trigger, actorId, startedAt, finishedAt, sources: parseSourceStatuses(row.sources), facts }
}

/** Creates the `reading` header of a library read (TS 7.1 step 3) and returns its id. */
export async function createSnapshotHeader(input: { trigger: SnapshotTrigger; actorId?: string | null; startedAt?: Date }): Promise<string> {
  const { id } = await prisma.cleanupSnapshot.create({
    data: { status: "reading", trigger: input.trigger, actorId: input.actorId ?? null, startedAt: input.startedAt ?? new Date() },
    select: { id: true },
  })
  return id
}

/** Marks a `reading` header `failed` with its source results. True when it changed. */
export async function failSnapshot(snapshotId: string, sources: readonly SourceStatus[], finishedAt: Date = new Date()): Promise<boolean> {
  const { count } = await prisma.cleanupSnapshot.updateMany({
    where: { id: snapshotId, status: "reading" },
    data: { status: "failed", finishedAt, sources: [...sources] },
  })
  return count > 0
}

export type WriteSnapshotResult = { ok: true } | { ok: false; code: "PART_TOO_LARGE"; level: Level; bytes: number }

/**
 * Writes the three parts and sets the header `complete` with its sources and
 * facts, in one transaction (TS 7.1 step 6). A part above
 * {@link MAX_PART_BYTES} writes no part and fails the header instead
 * (`PART_TOO_LARGE`).
 *
 * @throws When the header is not `reading` any more, or the database fails; then nothing is written.
 */
export async function writeSnapshot(
  snapshotId: string,
  input: { parts: Readonly<Record<Level, readonly SnapshotItem[]>>; sources: readonly SourceStatus[]; facts: SnapshotFacts; finishedAt?: Date }
): Promise<WriteSnapshotResult> {
  const finishedAt = input.finishedAt ?? new Date()
  for (const level of LEVELS) {
    const bytes = Buffer.byteLength(JSON.stringify(input.parts[level]))
    if (bytes > MAX_PART_BYTES) {
      logger.error("cleanup.snapshot_part_too_large", undefined, { snapshotId, level, bytes })
      await failSnapshot(snapshotId, input.sources, finishedAt)
      return { ok: false, code: "PART_TOO_LARGE", level, bytes }
    }
  }
  const data = LEVELS.map((level) => ({ snapshotId, level, itemCount: input.parts[level].length, items: [...input.parts[level]] }))
  await prisma.$transaction([
    prisma.cleanupSnapshotPart.createMany({ data }),
    prisma.cleanupSnapshot.update({
      where: { id: snapshotId, status: "reading" },
      data: { status: "complete", finishedAt, sources: [...input.sources], facts: input.facts },
    }),
  ])
  return { ok: true }
}

/**
 * Retention after a complete read (TS 2.7): keeps the {@link KEPT_COMPLETE}
 * newest complete rows and deletes older complete rows, `reading` rows older
 * than 1 hour and `failed` rows older than 1 day. A row that completes while
 * it runs is never older than the kept ones, so it stays. Returns the count.
 */
export async function pruneSnapshots(now: Date = new Date()): Promise<number> {
  const kept = await prisma.cleanupSnapshot.findMany({
    where: { status: "complete" },
    orderBy: { finishedAt: { sort: "desc", nulls: "last" } },
    take: KEPT_COMPLETE,
    select: { id: true, finishedAt: true },
  })
  const oldestKept = kept.length === KEPT_COMPLETE ? kept[kept.length - 1].finishedAt : null
  const complete = oldestKept
    ? [{ status: "complete", id: { notIn: kept.map((row) => row.id) }, OR: [{ finishedAt: null }, { finishedAt: { lte: oldestKept } }] }]
    : []
  const { count } = await prisma.cleanupSnapshot.deleteMany({
    where: {
      OR: [
        ...complete,
        { status: "reading", startedAt: { lt: new Date(now.getTime() - READING_MAX_AGE_MS) } },
        { status: "failed", startedAt: { lt: new Date(now.getTime() - FAILED_MAX_AGE_MS) } },
      ],
    },
  })
  return count
}

/** The idle path of the read job (TS 9.3): deletes every snapshot that finished (or, unfinished, started) over 48 hours ago. */
export async function pruneIdleSnapshots(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - IDLE_MAX_AGE_MS)
  const { count } = await prisma.cleanupSnapshot.deleteMany({
    where: { OR: [{ finishedAt: { lt: cutoff } }, { finishedAt: null, startedAt: { lt: cutoff } }] },
  })
  return count
}

/**
 * The newest complete header, other than `excludeId`: the earlier snapshot
 * that the shrink check and `rowBaseline()` compare a read with (TS 7.7, 8.2).
 */
export async function loadPreviousCompleteHeader(excludeId?: string): Promise<SnapshotHeader | null> {
  const row = await prisma.cleanupSnapshot.findFirst({
    where: { status: "complete", ...(excludeId ? { id: { not: excludeId } } : {}) },
    orderBy: { finishedAt: { sort: "desc", nulls: "last" } },
  })
  return row ? toHeader(row) : null
}
