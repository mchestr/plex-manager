/**
 * The web cache of the stored library data (TS 7.9 item 2 and 3): the
 * parsed items of each part with two indexes, `byKey` and `byTitleKey`, kept
 * in a module-level map by snapshot id. It holds at most
 * {@link CACHED_SNAPSHOTS} snapshots, the newest ones read. Server-only.
 *
 * Every call reads the newest complete header first; a snapshot id that is
 * not cached then reads its parts. A complete snapshot never changes, so a
 * cached level stays right until the snapshot is pruned. Never `'use cache'`:
 * the parts hold member ids.
 *
 * A part whose rows fail their schema for more than 1 % of them counts as
 * failed (`cleanup.snapshot_rows_invalid`), and so does a missing part: that
 * level is null, and the caller treats it as having no library data. Fewer
 * bad rows are dropped one by one (`parseSnapshotItems`).
 *
 * @module lib/cleanup/snapshot/cache
 */

import "server-only"

import { parseSnapshotItems, type SnapshotFacts, type SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { type SnapshotHeader, toHeader } from "@/lib/cleanup/snapshot/store"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { LEVELS, type Level } from "@/lib/validations/cleanup-vocabulary"

const logger = createLogger("CLEANUP_SNAPSHOT")

/** At most this many snapshots stay parsed in memory. @internal */
export const CACHED_SNAPSHOTS = 2
/** Above this share of dropped rows, a part counts as failed. @internal */
export const MAX_INVALID_SHARE = 0.01

/** The header of a complete snapshot whose facts parse. */
export interface CompleteHeader extends SnapshotHeader {
  facts: SnapshotFacts
}

/** The items of one level with their indexes. Read only: the cache shares them between callers. */
export interface SnapshotLevel {
  level: Level
  items: readonly SnapshotItem[]
  byKey: ReadonlyMap<string, SnapshotItem>
  /** Seasons share their show's title key, so a key can hold many items. */
  byTitleKey: ReadonlyMap<string, readonly SnapshotItem[]>
}

export interface LoadedSnapshotLevel extends SnapshotLevel {
  header: CompleteHeader
}

export interface LoadedSnapshot {
  header: CompleteHeader
  /** Null for a level whose part is missing or failed the 1 % rule: no library data for that level. */
  levels: Readonly<Record<Level, SnapshotLevel | null>>
}

interface Entry {
  header: CompleteHeader
  /** Each level loads once; callers at the same time share the load. */
  levels: Partial<Record<Level, Promise<SnapshotLevel | null>>>
}

const entries = new Map<string, Entry>()

/** Empties the cache. @internal Test-only. */
export function resetSnapshotCache(): void {
  entries.clear()
}

function toLevel(snapshotId: string, level: Level, part: { items: unknown } | null): SnapshotLevel | null {
  if (!part) {
    logger.error("cleanup.snapshot_part_missing", undefined, { snapshotId, level })
    return null
  }
  const { items, dropped, total } = parseSnapshotItems(part.items)
  if (dropped > total * MAX_INVALID_SHARE) {
    logger.error("cleanup.snapshot_rows_invalid", undefined, { snapshotId, level, dropped, total })
    return null
  }
  const byKey = new Map<string, SnapshotItem>()
  const byTitleKey = new Map<string, SnapshotItem[]>()
  for (const item of items) {
    byKey.set(item.key, item)
    const same = byTitleKey.get(item.titleKey)
    if (same) same.push(item)
    else byTitleKey.set(item.titleKey, [item])
  }
  return { level, items, byKey, byTitleKey }
}

/** The cache entry of the newest complete snapshot, or null when there is none or its facts do not parse. */
async function newestEntry(): Promise<Entry | null> {
  const row = await prisma.cleanupSnapshot.findFirst({ where: { status: "complete" }, orderBy: { finishedAt: "desc" } })
  if (!row) return null
  const cached = entries.get(row.id)
  if (cached) return cached
  const header = toHeader(row)
  if (!header.facts) {
    logger.error("cleanup.snapshot_facts_invalid", undefined, { snapshotId: row.id })
    return null
  }
  const entry: Entry = { header: { ...header, facts: header.facts }, levels: {} }
  entries.set(row.id, entry)
  for (const id of entries.keys()) {
    if (entries.size <= CACHED_SNAPSHOTS) break
    entries.delete(id)
  }
  return entry
}

function levelOf(entry: Entry, level: Level): Promise<SnapshotLevel | null> {
  const cached = entry.levels[level]
  if (cached) return cached
  const snapshotId = entry.header.id
  const loading = prisma.cleanupSnapshotPart
    .findUnique({ where: { snapshotId_level: { snapshotId, level } }, select: { items: true } })
    .then((part) => toLevel(snapshotId, level, part))
  entry.levels[level] = loading
  // A failed read is not kept, so the next call reads again
  loading.catch(() => {
    if (entry.levels[level] === loading) delete entry.levels[level]
  })
  return loading
}

/** The newest complete snapshot with all three levels (the overview, a run), or null when there is none. */
export async function loadNewestSnapshot(): Promise<LoadedSnapshot | null> {
  const entry = await newestEntry()
  if (!entry) return null
  const [movie, show, season] = await Promise.all(LEVELS.map((level) => levelOf(entry, level)))
  return { header: entry.header, levels: { movie, show, season } }
}

/** One level of the newest complete snapshot (a preview), or null when there is none or that part failed. */
export async function loadSnapshotLevel(level: Level): Promise<LoadedSnapshotLevel | null> {
  const entry = await newestEntry()
  if (!entry) return null
  const data = await levelOf(entry, level)
  return data ? { ...data, header: entry.header } : null
}
