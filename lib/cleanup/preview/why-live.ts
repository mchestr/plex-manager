/**
 * The live Why Sheet of one title (TS 6.9, 10.5, UX 4.5): the title
 * evaluated now on the newest snapshot with the rule as the editor or the
 * stored rule holds it. Pure and client-safe; `why-sheet.ts` loads the data.
 *
 * 1. `state` is the class. A title in Leaving soon that is opened without a
 *    draft (the Leaving soon list) reads `leaving`.
 * 2. A near miss gets its forecast. In the editor it also gets the Try value
 *    and its effect on the rule (TS 6.5).
 * 3. A match or a Leaving soon title gets the Then line. Other rules name
 *    each rule of the level that matches the title or holds it.
 *
 * @module lib/cleanup/preview/why-live
 */

import { classify } from "@/lib/cleanup/engine/classify"
import { evaluateItem } from "@/lib/cleanup/engine/evaluate"
import { nearMissForecast, nearMissTryValue, tryValueEffect } from "@/lib/cleanup/engine/near-miss"
import { ruleCoversItem } from "@/lib/cleanup/engine/scope"
import { type StatusItem, itemStatus } from "@/lib/cleanup/engine/status"
import type { CompiledRule, DescribeWords, EvalContext } from "@/lib/cleanup/engine/types"
import { dateWords } from "@/lib/cleanup/fields/words"
import { tryValueLabel } from "@/lib/cleanup/preview/condition-words"
import { itemRef } from "@/lib/cleanup/preview/rows"
import { whyConditions, whyHints, whyProtections, whyThen } from "@/lib/cleanup/preview/why-parts"
import type { SnapshotItem, SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { WhySheetData } from "@/lib/cleanup/types/preview"
import { arrItemHref, plexItemHref } from "@/lib/ui/plex-links"
import { type ActionId, type Mode } from "@/lib/validations/cleanup-vocabulary"

/** The `CleanupItem` columns of the title that the Sheet reads. */
export interface WhyRow extends StatusItem {
  ruleIds: readonly string[]
  action: ActionId
  importListExclusion: boolean
  enteredAt: Date | null
}

export interface LiveWhyInput {
  item: SnapshotItem
  compiled: CompiledRule
  /** The saved rule's id and mode; null for a new rule. */
  rule: { id: string; mode: Mode } | null
  /** A draft was sent: the editor. Try shows, and the state is the class. */
  editor: boolean
  ctx: EvalContext
  /** The items of the level: the Try effect evaluates the rule again over them. */
  items: readonly SnapshotItem[]
  sources: readonly SourceStatus[]
  words: DescribeWords
  links: { machineId: string | null; arrBase: string | null }
  row: WhyRow | null
  status: { paused: boolean; holdUntil: string | null }
  showFloor: string | null
  /** The other rules of the level. */
  others: readonly { id: string; name: string; mode: Mode; compiled: CompiledRule }[]
}

const inLeavingSoon = (row: WhyRow | null): row is WhyRow => row !== null && row.state !== "held"

function forecastText(field: string, day: string): string {
  return field === "watch.lastPlayed" ? `If nobody plays it, it passes on ${dateWords(day)}.` : `It passes on ${dateWords(day)}.`
}

/** The live Why Sheet data (TS 10.5). */
export function liveWhy(input: LiveWhyInput): WhySheetData {
  const { item, compiled, ctx, row } = input
  const result = evaluateItem(compiled, item, ctx)
  const classification = classify(result)
  const leaving = inLeavingSoon(row)
  const data: WhySheetData = {
    item: itemRef(item),
    state: leaving && !input.editor ? "leaving" : classification.class,
    links: {
      plexUrl: plexItemHref(input.links.machineId, item.ratingKey),
      arrUrl: item.arr ? arrItemHref(input.links.arrBase, item.arr.service, item.arr.titleSlug) : null,
    },
    conditions: whyConditions(compiled, result, ctx, input.sources, input.words),
    hints: whyHints(item, ctx),
    protections: whyProtections(compiled, result, ctx, input.words),
    otherRules: [],
    sources: [...input.sources],
  }
  const failing = classification.failing
  if (classification.class === "nearMiss" && failing !== undefined) {
    const day = nearMissForecast(compiled, result, failing, ctx)
    const clause = compiled.clauses.find((c) => c.id === failing)
    if (day && clause) data.forecast = { passesOn: day, text: forecastText(clause.kind === "condition" ? clause.condition.field : "", day) }
    const tried = input.editor ? nearMissTryValue(compiled, result, failing, ctx) : null
    const effect = tried ? tryValueEffect(compiled, input.items, ctx, { conditionId: tried.id, value: tried.value }) : null
    if (tried && effect) {
      data.tryValue = { conditionId: tried.id, value: tried.value, label: tryValueLabel(tried), addsCount: effect.addsCount, addsBytes: String(effect.addsBytes) }
    }
  }
  const action = leaving ? row.action : compiled.then.action
  if ((classification.class === "match" || leaving) && action) {
    const exclusion = leaving ? row.importListExclusion : compiled.then.importListExclusion === true
    const dryRun = !leaving && (input.rule === null || input.rule.mode === "dryRun")
    data.then = whyThen({ action, exclusion, item, dryRun, showFloor: input.showFloor })
  }
  for (const other of input.others) {
    const holder = row?.ruleIds.includes(other.id) ? row : null
    if (!holder && !(ruleCoversItem(other.compiled.scope, item) && classify(evaluateItem(other.compiled, item, ctx)).class === "match")) continue
    const entry: WhySheetData["otherRules"][number] = { ruleId: other.id, name: other.name, mode: other.mode }
    if (holder?.enteredAt) entry.enteredAt = holder.enteredAt.toISOString()
    if (holder?.leaveOn) entry.leaveOn = holder.leaveOn
    data.otherRules.push(entry)
  }
  if (leaving && row.enteredAt && row.leaveOn) {
    const status = itemStatus(row, { paused: input.status.paused, now: ctx.now, today: ctx.today, holdUntil: input.status.holdUntil, plan: new Map() })
    data.leaving = { enteredAt: row.enteredAt.toISOString(), leaveOn: row.leaveOn, status: status.status }
  }
  return data
}
