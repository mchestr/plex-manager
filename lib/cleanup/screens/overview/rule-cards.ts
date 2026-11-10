/**
 * The rule cards of the Rules tab (UX 4.1.3, TS 12.7 items 1 and 12): each
 * rule evaluated live on the cached snapshot, with its sentence, the four
 * largest matches, the facts of its mode and its footer. Rules with a
 * waiting batch come first, then by name (UX 4.1.2). Server-only: the
 * definition hash uses `node:crypto`.
 *
 * @module lib/cleanup/screens/overview/rule-cards
 */

import "server-only"

import type { Block } from "@/lib/cleanup/blocks"
import { describeRule } from "@/lib/cleanup/describe"
import { ruleOverlaps, type RuleMatches } from "@/lib/cleanup/engine/overlap"
import { describeContext, memberWords } from "@/lib/cleanup/preview/draft"
import { type BlockSnapshot, ruleBlocks } from "@/lib/cleanup/rule-blocks"
import type { Batch } from "@/lib/cleanup/run/batches"
import { definitionHash } from "@/lib/cleanup/run/turn-on-review"
import type { ScreenContext } from "@/lib/cleanup/screens/overview/context"
import { type DefinitionEvaluation, evaluateDefinition, posterKeys } from "@/lib/cleanup/screens/overview/evaluate"
import type { OverviewRows, StoredRule } from "@/lib/cleanup/screens/overview/read"
import { ruleFacts } from "@/lib/cleanup/screens/overview/rule-facts"
import { type FooterInput, ruleFooter } from "@/lib/cleanup/screens/overview/rule-footer"
import { dryRunSummary, turnOnChecks } from "@/lib/cleanup/turn-on"
import type { RuleCardData } from "@/lib/cleanup/types/rule-parts"

/** Rule card posters (UX 4.1.3 item 4). */
export const RULE_POSTERS = 4
/** The sentence of a rule whose stored definition does not parse. */
export const UNREADABLE_SENTENCE = "The saved rule could not be read."

export interface RuleCardsInput {
  screen: ScreenContext
  rows: OverviewRows
  batches: { deletion: readonly Batch[]; entry: readonly Batch[] }
}

/** The newest complete snapshot as the safety stops read it, or null before the first read. */
export const blockSnapshotOf = ({ snapshot }: Pick<ScreenContext, "snapshot">): BlockSnapshot | null =>
  snapshot ? { finishedAt: snapshot.header.finishedAt ?? snapshot.header.startedAt, sources: snapshot.header.sources, facts: snapshot.header.facts } : null

function blocksOf(rule: StoredRule, screen: ScreenContext, snapshot: BlockSnapshot | null): Block[] {
  if (!rule.definition) return [{ code: "invalid", ruleId: rule.id }]
  const blocks = ruleBlocks(rule.definition, snapshot, { now: screen.now.getTime(), options: screen.settings.options, ruleId: rule.id })
  if (screen.snapshot && !screen.snapshot.levels[rule.definition.level]) blocks.push({ code: "noData", ruleId: rule.id })
  return blocks
}

/** The turn-on checks of a Dry run rule (TS 10.5), for the "Ready to turn on" footer. Null for a live rule. */
function dryRunChecks(rule: StoredRule, evaluation: DefinitionEvaluation | null, screen: ScreenContext, snapshot: BlockSnapshot | null) {
  const { definition } = rule
  if (rule.mode !== "dryRun" || !definition) return null
  const { settings } = screen
  return turnOnChecks({
    now: screen.now.getTime(),
    feature: { enabled: settings.enabled, paused: settings.pausedAt !== null },
    rule: { id: rule.id, definition },
    snapshot,
    options: settings.options,
    dryRuns: rule.stats.dryRuns,
    definitionHash: definitionHash(definition),
    counts: { count: evaluation?.matches.length ?? 0, checked: evaluation?.checked ?? 0, cannotDelete: evaluation?.cannotDelete ?? 0 },
    firstBatch: true,
    notices: settings.runtime.notices,
  })
}

/** The largest overlap of each rule's matches with another rule's (TS 6.8). */
function overlapsOf(rules: readonly StoredRule[], evaluations: ReadonlyMap<string, DefinitionEvaluation>): Map<string, FooterInput["overlap"]> {
  const matches: RuleMatches[] = [...evaluations].map(([ruleId, e]) => ({ ruleId, items: e.matches.map((i) => ({ key: i.key, showKey: i.showKey })) }))
  const names = new Map(rules.map((rule) => [rule.id, rule.name]))
  return new Map(matches.map((own) => {
    const top = ruleOverlaps(own, matches)[0]
    return [own.ruleId, top ? { rule: { id: top.ruleId, name: names.get(top.ruleId) ?? "" }, count: top.count, kind: top.kind } : null]
  }))
}

/** Every rule card, sorted. */
export function ruleCards({ screen, rows, batches }: RuleCardsInput): RuleCardData[] {
  const { snapshot, ctx, settings, live, today, zone } = screen
  const blockSnapshot = blockSnapshotOf(screen)
  const evaluations = new Map<string, DefinitionEvaluation>()
  for (const rule of rows.rules) {
    const evaluation = rule.definition && snapshot && ctx ? evaluateDefinition(rule.definition, snapshot.levels, ctx) : null
    if (evaluation) evaluations.set(rule.id, evaluation)
  }
  const overlaps = overlapsOf(rows.rules, evaluations)
  const libraries = snapshot?.header.facts.libraries ?? []
  const cards = rows.rules.map((rule): RuleCardData => {
    const { definition } = rule
    const evaluation = evaluations.get(rule.id) ?? null
    const runs = dryRunSummary(rule.stats.dryRuns, definition ? definitionHash(definition) : "")
    const batch = batches.deletion.find((b) => b.ruleId === rule.id)
    const entry = batches.entry.some((b) => b.ruleId === rule.id)
    const blocks = blocksOf(rule, screen, blockSnapshot)
    const checks = dryRunChecks(rule, evaluation, screen, blockSnapshot)
    const footer = ruleFooter({ mode: rule.mode, blocks, runs, checks, readAt: snapshot?.header.facts.takenAt ?? null,
      overlap: overlaps.get(rule.id) ?? null, rescue: rows.rescues.find((o) => o.ruleIds.includes(rule.id)),
      words: { definition, protections: settings.options.protections, names: memberWords(live) } })
    return {
      id: rule.id, name: rule.name, mode: rule.mode, level: rule.level, revision: rule.revision,
      // The card bolds the values only (UX 4.1.3 item 1, shots/02-rules-normal.png)
      sentence: definition ? describeRule(definition, { ...describeContext(libraries, live, rule.mode), valuesOnly: true }) : [{ text: UNREADABLE_SENTENCE }],
      posters: posterKeys(evaluation, RULE_POSTERS),
      facts: ruleFacts({ rule, evaluation, rows: rows.items.filter((row) => row.ruleIds.includes(rule.id)), batch,
        deleted: rows.deleted.filter((o) => o.ruleIds.includes(rule.id)), runs, today, zone, holdUntil: settings.holdUntil,
        growthBytesPerMonth: snapshot?.header.facts.growthBytesPerMonth ?? null }),
      footer,
      waitingBatch: batch ? "deletion" : entry ? "entry" : null,
    }
  })
  return cards.sort((a, b) => Number(b.waitingBatch !== null) - Number(a.waitingBatch !== null) || a.name.localeCompare(b.name, "en"))
}
