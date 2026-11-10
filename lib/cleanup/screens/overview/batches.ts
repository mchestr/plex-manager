/**
 * The batch lines of the Rules tab alert (UX 4.1.2, TS 8.7, E7): every
 * deletion batch, then every entry batch, each by rule name. Pure and
 * client-safe.
 *
 * A deletion batch is due between the oldest and the newest leave date of
 * its items. An entry batch reads the day it was held: `heldAt` in the
 * server zone.
 *
 * @module lib/cleanup/screens/overview/batches
 */

import type { Batch } from "@/lib/cleanup/run/batches"
import type { OverviewBatch } from "@/lib/cleanup/types/rule-parts"
import { dayKey } from "@/lib/utils/zoned-time"
import { type Level, LEVELS } from "@/lib/validations/cleanup-vocabulary"

export interface BatchRule {
  name: string
  level: Level
}

const isLevel = (value: string): value is Level => (LEVELS as readonly string[]).includes(value)

/** The held days of an entry batch, oldest first. A row with no `heldAt` reads as today. */
function heldDays(batch: Batch, today: string, zone: string): string[] {
  return batch.items.map((item) => (item.heldAt ? dayKey(item.heldAt.getTime(), zone) : today)).sort()
}

/** One alert line for each batch whose rule exists. */
export function overviewBatches(groups: { deletion: readonly Batch[]; entry: readonly Batch[] }, rules: ReadonlyMap<string, BatchRule>,
  today: string, zone: string): OverviewBatch[] {
  const line = (batch: Batch): OverviewBatch[] => {
    const rule = rules.get(batch.ruleId)
    if (!rule) return []
    const days = batch.kind === "entry" ? heldDays(batch, today, zone) : []
    const dueSince = (batch.kind === "entry" ? days[0] : batch.dueSince) ?? today
    const dueAt = (batch.kind === "entry" ? days[days.length - 1] : batch.dueAt) ?? dueSince
    const first = batch.items[0]?.level
    return [{ id: batch.id, kind: batch.kind, ruleId: batch.ruleId, ruleName: rule.name, level: first && isLevel(first) ? first : rule.level,
      count: batch.count, bytes: batch.bytes.toString(), dueAt, dueSince }]
  }
  const byName = (a: OverviewBatch, b: OverviewBatch) => a.ruleName.localeCompare(b.ruleName, "en")
  return [...groups.deletion.flatMap(line).sort(byName), ...groups.entry.flatMap(line).sort(byName)]
}
