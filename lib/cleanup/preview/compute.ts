/**
 * The pure core of the live preview (TS 10.6 steps 2 to 8): one evaluation
 * of every item the draft covers, the statistics, warnings, blocks and
 * sentence, one page of the active tab, the focus and the impact. It runs
 * the same engine as a run (E11). `run-preview.ts` loads its data.
 * Client-safe.
 *
 * `signal` is read between the evaluation, the sort and the focus steps: an
 * aborted preview throws its reason there and does no more work.
 *
 * @module lib/cleanup/preview/compute
 */

import { describeRule } from "@/lib/cleanup/describe"
import { classify } from "@/lib/cleanup/engine/classify"
import { compileDraft } from "@/lib/cleanup/engine/compile"
import { evaluateRule } from "@/lib/cleanup/engine/evaluate"
import { previewFocus } from "@/lib/cleanup/engine/focus"
import { nearMissGap } from "@/lib/cleanup/engine/near-miss"
import { ruleStats } from "@/lib/cleanup/engine/stats"
import type { EvalContext } from "@/lib/cleanup/engine/types"
import { whyText } from "@/lib/cleanup/engine/why-text"
import { applicableDraft, describeContext, memberWords } from "@/lib/cleanup/preview/draft"
import { draftImpact, type ImpactInput } from "@/lib/cleanup/preview/impact"
import { type Evaluated, largestMatches, pageOf, tabEntries } from "@/lib/cleanup/preview/results"
import { addedAt, itemRef, lastPlayedAt, requestedBy } from "@/lib/cleanup/preview/rows"
import { previewWarnings } from "@/lib/cleanup/preview/warnings"
import { ruleBlocks, ruleSources } from "@/lib/cleanup/rule-blocks"
import type { SnapshotFacts, SnapshotItem, SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { PreviewResponse, PreviewRow } from "@/lib/cleanup/types/preview"
import type { previewRequestSchema } from "@/lib/validations/cleanup-actions"
import type { Mode } from "@/lib/validations/cleanup-vocabulary"
import type { z } from "zod"

/** A preview request with its defaults applied. */
export type ParsedPreviewRequest = z.output<typeof previewRequestSchema>

/** What one preview reads: the snapshot level, the evaluation context and, for a live rule, its item rows. */
export interface PreviewData {
  snapshot: { id: string; takenAt: string; finishedAt: number; sources: readonly SourceStatus[]; facts: SnapshotFacts }
  /** The items of the draft's level. */
  items: readonly SnapshotItem[]
  byKey: ReadonlyMap<string, SnapshotItem>
  ctx: EvalContext
  /** The saved rule's mode, or null for a new rule. */
  mode: Mode | null
  /** A live rule's impact data (TS 10.6 step 7). */
  impact?: Omit<ImpactInput, "compiled" | "evaluated" | "byKey" | "blocked">
}

const iso = (seconds: number | null) => (seconds === null ? null : new Date(seconds * 1000).toISOString())

/** Weeks of library growth that the matched bytes stand for (UX 4.3.6), or null without a growth rate. */
export function growthWeeks(bytes: number, growthBytesPerMonth: number | null): number | null {
  if (growthBytesPerMonth === null || growthBytesPerMonth <= 0) return null
  return Math.round((bytes * 30) / (growthBytesPerMonth * 7))
}

/** The preview of a draft on loaded data. */
export function computePreview(request: ParsedPreviewRequest, data: PreviewData, signal?: AbortSignal): PreviewResponse {
  const { ctx, snapshot } = data
  const { draft, notApplicable } = applicableDraft(request.definition)
  const compiled = compileDraft(draft)
  const results = evaluateRule(compiled, data.items, ctx)
  const entries: Evaluated[] = results.map((result) => ({ result, classification: classify(result) }))
  signal?.throwIfAborted()

  const stats = ruleStats(compiled, results, entries.map((e) => e.classification))
  const blockSnapshot = { finishedAt: new Date(snapshot.finishedAt), sources: snapshot.sources, facts: snapshot.facts }
  const blocks = ruleBlocks(compiled, blockSnapshot, { now: ctx.now, options: ctx.options, ...(request.ruleId ? { ruleId: request.ruleId } : {}) })
  const tab = tabEntries(entries, request)
  if (request.tab === "nearMisses") for (const e of tab) e.gap = nearMissGap(compiled, e.result, e.classification.failing ?? "", ctx)
  const page = pageOf(tab, request)
  signal?.throwIfAborted()

  const words = memberWords(ctx.live)
  const why = { compiled, ctx, words, sources: snapshot.sources }
  const toRow = (e: Evaluated): PreviewRow => {
    const item = e.result.item
    const row: PreviewRow = { ...itemRef(item), class: e.classification.class, why: whyText(e.result, e.classification, why),
      lastPlayedAt: lastPlayedAt(item), addedAt: addedAt(item), requestedBy: requestedBy(item, ctx) }
    if (e.classification.failing !== undefined) row.failing = e.classification.failing
    if (e.gap !== undefined) row.gap = e.gap
    return row
  }
  const used = new Set(ruleSources(compiled, ctx.options, snapshot.sources))
  const response: PreviewResponse = {
    level: draft.level,
    snapshot: { id: snapshot.id, takenAt: snapshot.takenAt, historyStart: iso(snapshot.facts.history.startAt) },
    sources: snapshot.sources.filter((s) => used.has(s.service)),
    checked: stats.checked,
    matches: stats.matches,
    bytes: String(stats.bytes),
    growthWeeks: growthWeeks(stats.bytes, snapshot.facts.growthBytesPerMonth),
    clauses: compiled.clauses.map((c) => ({ id: c.id, passAlone: stats.passAlone[c.id], heldBack: stats.heldBack[c.id] })),
    allConditions: stats.allConditions,
    protectedAll: stats.protectedAll,
    protectedGlobal: stats.protectedGlobal,
    protectedBy: Object.entries(stats.protectedBy).map(([protectionId, count]) => ({ protectionId, count })),
    tabs: stats.tabs,
    rows: page.rows.map(toRow),
    page: page.page,
    pageCount: page.pageCount,
    total: page.total,
    largest: largestMatches(entries, 4).map((e) => ({ ...itemRef(e.result.item), why: whyText(e.result, e.classification, why) })),
    warnings: previewWarnings({ compiled, results, stats, options: ctx.options, sources: snapshot.sources, now: ctx.now,
      finishedAt: snapshot.finishedAt, notApplicable }),
    incomplete: [...compiled.incomplete],
    blocks,
    sentence: describeRule(request.definition, describeContext(snapshot.facts.libraries, ctx.live, data.mode ?? "dryRun")),
  }
  if (request.focus) {
    const focus = previewFocus({ compiled, items: results.map((r) => r.item), ctx, conditionId: request.focus.conditionId })
    if (focus) response.focus = focus
    signal?.throwIfAborted()
  }
  if (data.impact) {
    const evaluated = new Map(entries.map((e) => [e.result.item.key, e]))
    response.impact = draftImpact({ ...data.impact, compiled, evaluated, byKey: data.byKey, blocked: blocks.length > 0 })
  }
  return response
}
