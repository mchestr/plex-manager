/**
 * `runPreview(request, { actorId, signal })`: the live preview of a rule
 * draft (TS 10.6). The route `POST /api/admin/cleanup/preview` and the
 * action `previewCleanupRule` both call it (E9), and `saveCleanupRule` reads
 * its `impact` (TS 10.3). Server-only.
 *
 * 1. Load the snapshot level, the settings, the zone and the live facts.
 * 2. With a `ruleId`, read the rule. A live rule also reads its item rows.
 * 3. `computePreview()` evaluates, sorts, pages and focuses, and stops early
 *    on abort (`signal.throwIfAborted()` between the steps).
 *
 * With no complete snapshot, the response has `snapshot: null`, zero
 * counts, the `noData` block and the sentence of the draft.
 *
 * @module lib/cleanup/preview/run-preview
 */

import "server-only"

import { describeRule } from "@/lib/cleanup/describe"
import { compileDraft } from "@/lib/cleanup/engine/compile"
import { computePreview, type ParsedPreviewRequest, type PreviewData } from "@/lib/cleanup/preview/compute"
import { applicableDraft, describeContext } from "@/lib/cleanup/preview/draft"
import { finishedAtOf, loadContext, loadLevel } from "@/lib/cleanup/preview/load"
import { holdingRule, readImpactRows, readRule } from "@/lib/cleanup/preview/rules"
import type { PreviewResponse, PreviewWarning } from "@/lib/cleanup/types/preview"
import { type PreviewRequest, previewRequestSchema } from "@/lib/validations/cleanup-actions"
import type { Mode } from "@/lib/validations/cleanup-vocabulary"

export interface RunPreviewOptions {
  /** The admin who asked: the caller audits the requester names (TS 10.6 step 5). */
  actorId: string
  signal?: AbortSignal
  now?: Date
}

/** The response with no library data yet (UX 4.3.9 "First read"). */
function emptyPreview(request: ParsedPreviewRequest, sentence: PreviewResponse["sentence"]): PreviewResponse {
  const { draft, notApplicable } = applicableDraft(request.definition)
  const compiled = compileDraft(draft)
  const warnings: PreviewWarning[] = []
  if (compiled.incomplete.length > 0) warnings.push({ kind: "incomplete", conditionIds: [...compiled.incomplete] })
  if (notApplicable.length > 0) warnings.push({ kind: "notApplicable", conditionIds: notApplicable })
  return {
    level: draft.level, snapshot: null, sources: [], checked: 0, matches: 0, bytes: "0", growthWeeks: null,
    clauses: compiled.clauses.map((c) => ({ id: c.id, passAlone: 0, heldBack: 0 })), allConditions: 0, protectedAll: 0, protectedBy: [],
    tabs: { matches: 0, nearMisses: 0, protected: 0, missing: 0, cannotDelete: 0 }, rows: [], page: 1, pageCount: 1, total: 0,
    largest: [], warnings, incomplete: [...compiled.incomplete], blocks: [{ code: "noData", ...(request.ruleId ? { ruleId: request.ruleId } : {}) }],
    sentence,
  }
}

/** The live preview of a draft (TS 10.6). Throws the signal's reason when it aborts. */
export async function runPreview(input: PreviewRequest, { signal, now = new Date() }: RunPreviewOptions): Promise<PreviewResponse> {
  const request = previewRequestSchema.parse(input)
  const [level, rule] = await Promise.all([loadLevel(request.definition.level), request.ruleId ? readRule(request.ruleId) : null])
  signal?.throwIfAborted()
  const { ctx, holdUntil } = await loadContext(level?.header ?? null, level?.shows ?? [], now)
  signal?.throwIfAborted()
  const mode: Mode = rule?.mode ?? "dryRun"
  if (!level) return emptyPreview(request, describeRule(request.definition, describeContext([], ctx.live, mode)))

  const { header } = level
  const data: PreviewData = {
    snapshot: { id: header.id, takenAt: header.facts.takenAt, finishedAt: finishedAtOf(header), sources: header.sources, facts: header.facts },
    items: level.items,
    byKey: level.byKey,
    ctx,
    mode,
  }
  if (rule && rule.mode !== "dryRun") {
    const rows = await readImpactRows(rule.id)
    signal?.throwIfAborted()
    const saved = holdingRule(rule)
    data.impact = { ...rows, rule: { ...saved, then: { ...saved.then, ...request.definition.then } }, today: ctx.today, holdUntil }
  }
  return computePreview(request, data, signal)
}
