/**
 * The open condition editor (TS 6.6, UX 4.4): the match count of each preset
 * chip, the histogram buckets with `passes`, the summary, the computed date
 * in the server zone and the library hint of Size. Pure and client-safe.
 *
 * 1. A preset replaces only the value of the condition's main control
 *    (`withPreset()`): the operator stays, and so does `orNever`.
 * 2. A bucket passes when every value in it passes the condition as set.
 *    Buckets are `[from, to)`, so a threshold on a bucket edge does not
 *    split it. An item with an Unknown verdict is in no bucket.
 * 3. A protection (`p1`) counts the items that it protects as passing.
 *
 * @module lib/cleanup/engine/focus
 */

import { plural } from "@/lib/cleanup/action-words"
import { findCondition, replaceCondition } from "@/lib/cleanup/engine/compile"
import { conditionVerdict, fieldEvalOf } from "@/lib/cleanup/engine/evaluate"
import { matchTotals } from "@/lib/cleanup/engine/near-miss"
import type { CompiledRule, EvalContext, HistogramBucket } from "@/lib/cleanup/engine/types"
import { anyFieldMeta, withPreset } from "@/lib/cleanup/fields/catalog"
import { NOUNS } from "@/lib/cleanup/fields/words"
import { thresholdText } from "@/lib/cleanup/preview/condition-words"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { PreviewFocus } from "@/lib/cleanup/types/preview"
import { DEFAULT_LOCALE, formatBytes, formatDate } from "@/lib/utils/format"
import { type Condition, durationDays } from "@/lib/validations/cleanup-rule"

const DAY_MS = 86_400_000

/** The words before the computed date of each date field (TS 6.6 item 4). */
const DATE_WORDS = {
  "watch.lastPlayed": "Played",
  "library.added": "Added",
  "request.age": "Requested",
  "show.lastEpisodeAdded": "Newest episode",
} as const

/** The passing range of a histogram condition as words: its field label in lower case and its threshold. */
function passingRange(c: Condition, label: string): string {
  return `${label.charAt(0).toLowerCase()}${label.slice(1)} ${thresholdText(c)}`
}

/** The threshold of a condition in `measure()` units, with its side, or null for a field with no histogram. */
function threshold(c: Condition): { low: boolean; value: number } | null {
  switch (c.field) {
    case "watch.lastPlayed":
    case "library.added":
    case "request.age":
    case "show.lastEpisodeAdded":
      if (c.op === "never") return null
      return { low: c.op === "moreThan", value: durationDays(c.value.duration) }
    case "file.size":
      return { low: c.op === "moreThan", value: c.value.bytes }
    default:
      return null
  }
}

/** True when every value of the bucket passes the condition (TS 4.2). */
export function bucketPasses(c: Condition, bucket: HistogramBucket): boolean {
  if (bucket.never) return c.field === "watch.lastPlayed" && (c.op === "never" || (c.op === "moreThan" && c.value.orNever))
  const edge = threshold(c)
  if (!edge) return false
  return edge.low ? bucket.from !== null && bucket.from >= edge.value : bucket.to !== null && bucket.to <= edge.value
}

/** The bucket of a measured value, or the Never bucket for `never`. */
function bucketIndex(buckets: readonly HistogramBucket[], value: number | "never"): number {
  if (value === "never") return buckets.findIndex((b) => b.never)
  return buckets.findIndex((b) => !b.never && (b.from === null || value >= b.from) && (b.to === null || value < b.to))
}

/** "Played before Nov 8, 2025, server time (America/Vancouver)." for a date field with a duration (UX 8.4). */
export function computedDate(c: Condition, ctx: Pick<EvalContext, "now" | "zone">): string | undefined {
  if (!(c.field in DATE_WORDS) || c.op === "never" || !("duration" in c.value)) return undefined
  const date = formatDate(ctx.now - durationDays(c.value.duration) * DAY_MS, "short", { timeZone: ctx.zone, locale: DEFAULT_LOCALE })
  const words = DATE_WORDS[c.field as keyof typeof DATE_WORDS]
  return `${words} ${c.op === "lessThan" ? "after" : "before"} ${date}, server time (${ctx.zone}).`
}

/** "Your movies: median 9.8 GB, largest 61 GB." over the items with a known size. */
function libraryHint(items: readonly SnapshotItem[], level: SnapshotItem["level"]): string | undefined {
  const sizes = items.flatMap((item) => (item.sizeBytes === null ? [] : [item.sizeBytes])).sort((a, b) => a - b)
  if (sizes.length === 0) return undefined
  const median = sizes[Math.floor((sizes.length - 1) / 2)]
  return `Your ${NOUNS[level][1]}: median ${formatBytes(median)}, largest ${formatBytes(sizes[sizes.length - 1])}.`
}

export interface FocusInput {
  compiled: CompiledRule
  /** The items that the rule covers (`ruleCoversItem()`). */
  items: readonly SnapshotItem[]
  ctx: EvalContext
  conditionId: string
}

/**
 * The `focus` of a preview response (TS 6.6), or null when the id names no
 * complete condition or protection of the rule.
 */
export function previewFocus({ compiled, items, ctx, conditionId }: FocusInput): PreviewFocus | null {
  const c = findCondition(compiled, conditionId)
  if (!c) return null
  const level = compiled.scope.level
  const meta = anyFieldMeta(c.field)
  const role = compiled.protections.some((p) => p.id === c.id) ? "protection" : "condition"
  const list = meta.histogram?.(level) ?? []
  const counts = list.map(() => 0)
  let passing = 0
  let unknown = 0
  for (const item of items) {
    const { verdict } = conditionVerdict(c, item, ctx, role)
    if (verdict === "unknown") {
      unknown += 1
      continue
    }
    if (verdict === "pass") passing += 1
    if (list.length === 0) continue
    const measured = fieldEvalOf(ctx, c).measure?.(item, ctx, c, role) ?? null
    const never = c.field === "watch.lastPlayed" && item.plays?.lastCountedAt === null
    const index = measured !== null ? bucketIndex(list, measured) : never ? bucketIndex(list, "never") : -1
    if (index >= 0) counts[index] += 1
  }
  const presets = meta.presets(level).map((preset) => ({
    value: preset.value,
    label: preset.label,
    matches: matchTotals(replaceCondition(compiled, withPreset(c, preset.value)), items, ctx).matches,
  }))
  const unknownText = unknown === 0 ? "" : ` ${unknown} ${unknown === 1 ? "is" : "are"} unknown.`
  // The text form of the passing bars names their range (UX 4.4, 8.4): "...: last played more than 1 year ago, or never."
  const range = list.length > 0 ? `: ${passingRange(c, meta.label(level))}` : ""
  const focus: PreviewFocus = {
    buckets: list.map((bucket, i) => ({ label: bucket.label, count: counts[i], passes: bucketPasses(c, bucket) })),
    summary: `${passing} of ${plural(items.length, level)} pass this condition${range}.${unknownText}`,
    presets,
  }
  const date = computedDate(c, ctx)
  if (date) focus.computedDate = date
  const hint = c.field === "file.size" ? libraryHint(items, level) : undefined
  if (hint) focus.libraryHint = hint
  return focus
}
