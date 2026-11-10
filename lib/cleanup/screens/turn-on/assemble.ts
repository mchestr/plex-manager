/**
 * The turn-on page data from the turn-on review (UX 4.6, 12.4, TS 10.5,
 * E28): the review that `turnOnCleanupRule` compares, plus the words and
 * the cards of the page. It holds `count` and `keysHash`, never the item
 * keys. Server-only: the review is.
 *
 * `typedApprovalCount` is the count to type when the admin picks
 * Automatic: the set above 50 items (UX 4.6 item 3), whatever mode the
 * page starts with, so the view can show the field when Automatic is
 * chosen.
 *
 * @module lib/cleanup/screens/turn-on/assemble
 */

import "server-only"

import { COLLECTION_TITLES, TYPED_APPROVAL_ABOVE } from "@/lib/cleanup/constants"
import { describeRule } from "@/lib/cleanup/describe"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import type { LiveFacts } from "@/lib/cleanup/engine/types"
import { growthWeeks } from "@/lib/cleanup/preview/compute"
import { describeContext } from "@/lib/cleanup/preview/draft"
import { definitionHash, type TurnOnReview } from "@/lib/cleanup/run/turn-on-review"
import type { SnapshotLibrary } from "@/lib/cleanup/schema/snapshot"
import type { RuleStats } from "@/lib/cleanup/schema/stats"
import { dryRunPoints, largestRows, oversizeTitles, posterKeys, type StoredTitle } from "@/lib/cleanup/screens/turn-on/rows"
import { linkedMembers, ruleLibraries } from "@/lib/cleanup/screens/turn-on/who-sees"
import type { NamedRule } from "@/lib/cleanup/types/rule-parts"
import type { CleanupTurnOnData } from "@/lib/cleanup/types/screens"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

export interface TurnOnParts {
  review: TurnOnReview
  /** The preselected mode. */
  mode: CleanupTurnOnData["mode"]
  stats: RuleStats
  /** The other live rules, which share the daily budget. */
  sharedWith: NamedRule[]
  membersWhoCanSee: number | null
  members: LiveFacts["members"]
  /** The stored titles of Leaving soon rows that the library data lacks. */
  stored: ReadonlyMap<string, StoredTitle>
}

/** The share of the level's library storage, in whole percent, or null without library data. */
export function storagePercent(bytes: number, level: Level, libraries: readonly SnapshotLibrary[]): number | null {
  const type = level === "movie" ? "movie" : "show"
  const total = libraries.filter((l) => l.type === type).reduce((sum, l) => sum + l.bytes, 0)
  return total > 0 ? Math.round((bytes * 100) / total) : null
}

/** The page data of the review. */
export function turnOnData({ review, mode, stats, sharedWith, membersWhoCanSee, members, stored }: TurnOnParts): CleanupTurnOnData {
  const { ctx, rule, set } = review
  const { definition } = rule
  const { level, then } = definition
  const header = ctx.snapshot?.header
  const libraries = header?.facts.libraries ?? []
  const { options } = ctx.settings
  const budget = { items: options.budget.items, bytes: String(options.budget.bytes) }
  return {
    rule: { id: rule.id, name: rule.name, sentence: describeRule(definition, describeContext(libraries, { members }, rule.mode)), mode: rule.mode, level,
      action: then.action, importListExclusion: then.importListExclusion, graceDays: then.graceDays },
    mode,
    today: ctx.today,
    batch: {
      count: review.count, bytes: String(review.bytes), matches: review.counts.matches, storagePercent: storagePercent(review.bytes, level, libraries),
      growthWeeks: growthWeeks(review.bytes, header?.facts.growthBytesPerMonth ?? null), protectedCount: review.counts.protected,
      missingCount: review.counts.missing, dueCount: review.counts.due, posters: posterKeys(set, stored),
    },
    leaveAt: review.leaveAt,
    automaticPace: review.pace ? { ...review.pace, perDay: budget } : null,
    visibility: { collection: COLLECTION_TITLES[level], libraries: ruleLibraries(definition, libraries).map((l) => l.title), membersWhoCanSee },
    linkedMembers: linkedMembers(set.flatMap((entry) => (entry.result ? [entry.result.item] : [])), members, header?.facts.users ?? null),
    keeps: { enabled: options.members.keepsEnabled, days: options.members.keepDays, limit: options.members.keepLimit },
    budget: { ...budget, sharedWith },
    entryCheck: { count: options.entryCheck.count, percent: options.entryCheck.percent },
    dryRuns: dryRunPoints(stats.dryRuns, definitionHash(definition)),
    largest: largestRows(set, { compiled: compileDefinition(definition), ctx: ctx.evaluation, sources: header?.sources ?? [] }),
    checks: review.checks,
    modes: review.modes,
    typedApprovalCount: review.count > TYPED_APPROVAL_ABOVE ? review.count : null,
    revision: rule.revision,
    count: review.count,
    keysHash: review.keysHash,
    reviewedAt: review.reviewedAt,
    budgetOversize: oversizeTitles(review.oversize, set, stored),
  }
}
