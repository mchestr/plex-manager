/**
 * Test fixtures for the member side of Leaving soon: a loaded snapshot built
 * from snapshot items, and `CleanupItem` rows that match them. Every value is
 * invented.
 *
 * @internal Test-only.
 * @module lib/cleanup/member/__tests__/fixtures
 */

import { buildCleanupItem } from "@/__tests__/helpers/cleanup-factories"
import { buildSnapshotFacts, buildSourceStatuses, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import type { SnapshotFacts, SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { LoadedSnapshot, SnapshotLevel } from "@/lib/cleanup/snapshot/cache"
import type { CleanupItem } from "@/lib/generated/prisma/client"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

function levelOf(level: Level, items: readonly SnapshotItem[]): SnapshotLevel {
  const own = items.filter((item) => item.level === level)
  return { level, items: own, byKey: new Map(own.map((item) => [item.key, item])), byTitleKey: new Map() }
}

/** @internal The newest complete snapshot holding `items`, with every level read. */
export function loadedSnapshot(items: readonly SnapshotItem[], facts: Partial<SnapshotFacts> = {}): LoadedSnapshot {
  const at = new Date(NOW)
  const header = { id: "snapshot-1", status: "complete", trigger: "scheduled", actorId: null, startedAt: at, finishedAt: at,
    sources: buildSourceStatuses(), facts: buildSnapshotFacts(facts) }
  return { header, levels: { movie: levelOf("movie", items), show: levelOf("show", items), season: levelOf("season", items) } }
}

/** @internal The Leaving soon row of a snapshot item, leaving on `leaveOn`. */
export function rowOf(item: SnapshotItem, leaveOn: string, overrides: Partial<CleanupItem> = {}): CleanupItem {
  return buildCleanupItem({
    id: `row-${item.key}`,
    itemKey: item.key,
    level: item.level,
    titleKey: item.titleKey,
    title: item.title,
    year: item.year,
    seasonNumber: item.seasonNumber,
    sectionId: item.sectionId,
    ratingKey: item.ratingKey,
    sizeBytes: BigInt(Number(item.sizeBytes)),
    leaveOn,
    ...overrides,
  })
}
