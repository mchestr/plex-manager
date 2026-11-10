/**
 * The parts of a live Why Sheet (TS 10.5, UX 4.5, UX 8.5): each condition
 * with its real value, threshold and sources, the protections that protect
 * first, the Then line from `actionWords()` (X14) and the seasonal hint
 * (TS 12.7 item 4). Pure and client-safe. Admin surfaces only.
 *
 * @module lib/cleanup/preview/why-parts
 */

import { actionWords } from "@/lib/cleanup/action-words"
import { conditionFact, whySheetFact } from "@/lib/cleanup/engine/fields"
import type { CompiledRule, DescribeWords, EvalContext, ItemResult, WhyPart } from "@/lib/cleanup/engine/types"
import { anyFieldMeta } from "@/lib/cleanup/fields/catalog"
import { dateWords, SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import { thresholdText } from "@/lib/cleanup/preview/condition-words"
import { isGlobalId, protectionLabel, seasonalCollections } from "@/lib/cleanup/preview/protection-words"
import type { SnapshotItem, SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { WhySheetCondition, WhySheetData } from "@/lib/cleanup/types/preview"
import { formatBytes } from "@/lib/utils/format"
import type { Condition } from "@/lib/validations/cleanup-rule"
import { type ActionId, FIELD_SOURCES } from "@/lib/validations/cleanup-vocabulary"

/** The real value of a condition as the Why Sheet shows it (TS 4.5): full dates, and the window of a play count. */
export function sheetFact(c: Condition, item: SnapshotItem, ctx: EvalContext): WhyPart[] {
  return c.field === "watch.plays" ? conditionFact(c, item, ctx) : whySheetFact(c.field, item, ctx)
}

const sourcesOf = (c: Condition, level: SnapshotItem["level"], sources: readonly SourceStatus[]) =>
  sources.filter((s) => FIELD_SOURCES[c.field][level].includes(s.service))

/** One line per clause. A group lists its members, and names the one that passed. */
export function whyConditions(
  compiled: CompiledRule,
  result: ItemResult,
  ctx: EvalContext,
  sources: readonly SourceStatus[],
  words: DescribeWords,
): WhySheetCondition[] {
  const level = compiled.scope.level
  const verdicts = new Map(result.clauses.map((c) => [c.id, c.verdict]))
  return compiled.clauses.map((clause): WhySheetCondition => {
    const verdict = verdicts.get(clause.id) ?? "unknown"
    if (clause.kind === "condition") {
      const c = clause.condition
      const meta = anyFieldMeta(c.field)
      return { id: c.id, label: meta.label(level), verdict, value: sheetFact(c, result.item, ctx), threshold: thresholdText(c, words),
        sources: sourcesOf(c, level, sources) }
    }
    const memberVerdicts = new Map((result.members[clause.id] ?? []).map((m) => [m.id, m.verdict]))
    const used = new Set(clause.conditions.flatMap((c) => sourcesOf(c, level, sources)))
    return {
      id: clause.id,
      label: "Any of these is true",
      verdict,
      value: [],
      threshold: `at least 1 of ${clause.conditions.length}`,
      sources: [...used],
      members: clause.conditions.map((c) => ({ id: c.id, verdict: memberVerdicts.get(c.id) ?? "unknown", value: sheetFact(c, result.item, ctx) })),
    }
  })
}

const PROTECTION_ORDER = { protects: 0, unknown: 1, clear: 2 } as const

/** Every protection of the result, the ones that protect first (UX 4.5 "Never touch, checked"). */
export function whyProtections(compiled: CompiledRule, result: ItemResult, ctx: EvalContext, words: DescribeWords): WhySheetData["protections"] {
  const level = compiled.scope.level
  const labels = { protections: ctx.options.protections, ruleProtections: compiled.protections, level, words }
  const globals = new Map(ctx.globals(level).map((g) => [g.id, g]))
  return result.protections
    .map((p) => {
      const rule = compiled.protections.find((c) => c.id === p.id)
      const value = isGlobalId(p.id) ? (globals.get(p.id)?.fact?.(result.item, ctx) ?? []) : rule ? sheetFact(rule, result.item, ctx) : []
      return { id: p.id, label: protectionLabel(p.id, labels), verdict: p.verdict, value }
    })
    .sort((a, b) => PROTECTION_ORDER[a.verdict] - PROTECTION_ORDER[b.verdict])
}

const ID_KINDS = { tmdb: "TMDB", tvdb: "TVDB", imdb: "IMDb" } as const

export interface ThenInput {
  action: ActionId
  exclusion: boolean
  item: SnapshotItem
  /** The rule is in Dry run, or not saved yet: "If the rule is turned on, ". */
  dryRun: boolean
  /** The show floor day of a show with seasons in Leaving soon (E21), else null. */
  showFloor: string | null
}

/** The Then line (UX 8.5): what the action does to this title, how it is matched, and the show floor. */
export function whyThen({ action, exclusion, item, dryRun, showFloor }: ThenInput): NonNullable<WhySheetData["then"]> {
  const size = item.sizeBytes === null ? undefined : formatBytes(item.sizeBytes)
  const words = actionWords(action, { exclusion, count: 1, level: item.level, ...(size ? { size } : {}) })
  const texts = [`${dryRun ? "If the rule is turned on, " : ""}${words.thenSentence}`]
  const by = item.match.by
  const id = by === undefined ? undefined : item.ids[by]
  if (by !== undefined && id !== undefined && item.arr) texts.push(`Matched in ${SERVICE_NAMES[item.arr.service]} by ${ID_KINDS[by]} id ${id}.`)
  if (item.arr) texts.push(item.level === "movie" ? `The file is inside ${item.arr.root}.` : `The files are inside ${item.arr.root}.`)
  if (showFloor) texts.push(`It goes on ${dateWords(showFloor)} or later, after its seasons.`)
  return { text: [{ text: texts.join(" ") }], dryRun }
}

/** The seasonal hint (TS 12.7 item 4): Kometa seasonal collections of the title that G13 does not name. */
export function whyHints(item: SnapshotItem, ctx: EvalContext): WhySheetData["hints"] {
  const show = item.showKey ? ctx.showsByKey.get(item.showKey) : undefined
  const g13 = ctx.options.protections.g13
  const named = new Set(g13.enabled ? g13.collections.map((c) => c.trim().toLowerCase()) : [])
  return seasonalCollections((show ?? item).collections)
    .filter((title) => !named.has(title.trim().toLowerCase()))
    .map((collection) => ({ kind: "seasonalCollection", collection }))
}

/** The newest of the Plex and arr added dates (Unix seconds) as ISO, as `library.added` reads them (E16), or null for neither. */
export function newestAdded(plex: number | null, arr: number | null): string | null {
  const newest = Math.max(plex ?? -1, arr ?? -1)
  return newest < 0 ? null : new Date(newest * 1000).toISOString()
}
