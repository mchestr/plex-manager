/**
 * The one footer line of a rule card, the first that applies (UX 4.1.3 item
 * 5, X7). Pure and client-safe.
 *
 * 1. A safety stop of the rule (`ruleBlocks()`): its first stop.
 * 2. Dry run, steady dry runs of the saved definition, and no turn-on check
 *    that stops Review first. The feature switch and the pause are page
 *    states, not the rule's, so they do not count here.
 * 3. The largest overlap with another rule (TS 6.8).
 * 4. The newest rescue of one of its titles, with its reason (TS 11.4).
 *
 * @module lib/cleanup/screens/overview/rule-footer
 */

import type { Block } from "@/lib/cleanup/blocks"
import type { DescribeWords } from "@/lib/cleanup/engine/types"
import { anyFieldMeta } from "@/lib/cleanup/fields/catalog"
import { SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import { outcomeWords } from "@/lib/cleanup/outcomes"
import { protectionLabel } from "@/lib/cleanup/preview/protection-words"
import type { StoredOutcome } from "@/lib/cleanup/screens/overview/read"
import { checkStops, type DryRunSummary } from "@/lib/cleanup/turn-on"
import type { NamedRule, RuleFooter, TurnOnCheck } from "@/lib/cleanup/types/rule-parts"
import type { ProtectionsOptions } from "@/lib/validations/cleanup-options"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"
import type { Mode } from "@/lib/validations/cleanup-vocabulary"

/** Checks of the page, not of the rule: the footer leaves them out. */
const PAGE_CHECKS = new Set<string>(["featureOn", "notPaused"])

export interface FooterInput {
  mode: Mode
  blocks: readonly Block[]
  runs: DryRunSummary
  /** The turn-on checks of a Dry run rule, else null. */
  checks: readonly TurnOnCheck[] | null
  /** When the library data was read: "every source answered at {time}". */
  readAt: string | null
  overlap: { rule: NamedRule; count: number; kind: "same" | "inShow" | "hasSeasons" } | null
  rescue: StoredOutcome | undefined
  words: RescueWords
}

/** What the reason of a rescue needs: the rule's definition, the protection values and member names. */
export interface RescueWords {
  definition: RuleDefinition | null
  protections: ProtectionsOptions
  names: DescribeWords
}

/** A title as the card names it: "Supernatural, Season 4". */
export const titleWords = (title: string, seasonNumber: number | null): string => (seasonNumber === null ? title : `${title}, Season ${seasonNumber}`)

const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`)

/** The words of why a title was rescued: "A member played it." */
export function rescueReason(outcome: Pick<StoredOutcome, "reason" | "detail">, { definition, protections, names }: RescueWords): string {
  const level = definition?.level ?? "movie"
  const conditions = definition?.conditions.flatMap((c) => ("kind" in c ? c.conditions : [c])) ?? []
  return outcomeWords(outcome.reason, outcome.detail, {
    service: (service) => SERVICE_NAMES[service],
    protection: (id) => sentence(protectionLabel(id, { protections, ruleProtections: definition?.protections ?? [], level, words: names })),
    condition: (id) => {
      const condition = conditions.find((c) => c.id === id)
      return condition ? anyFieldMeta(condition.field).label(level) : "a condition"
    },
    failure: () => "The delete failed.",
  })
}

/** The footer line, or null when none applies. */
export function ruleFooter(input: FooterInput): RuleFooter | null {
  const { runs, checks } = input
  if (input.blocks.length > 0) return { kind: "block", block: input.blocks[0] }
  const ready = input.mode === "dryRun" && runs.count > 0 && runs.steady && checks !== null &&
    checks.every((check) => PAGE_CHECKS.has(check.id) || !checkStops(check, "reviewFirst"))
  if (ready) return { kind: "ready", dryRuns: runs.count, readAt: input.readAt }
  if (input.overlap) return { kind: "overlap", rule: input.overlap.rule, count: input.overlap.count, overlap: input.overlap.kind }
  const { rescue } = input
  if (rescue) {
    return { kind: "rescue", title: titleWords(rescue.title, rescue.seasonNumber), at: rescue.actedAt.toISOString(), reason: rescueReason(rescue, input.words) }
  }
  return null
}
