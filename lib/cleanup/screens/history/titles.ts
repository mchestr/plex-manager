/**
 * The Deleted titles table of the History tab (UX 4.9 item 2, TS 11.4):
 * the deleted and failed titles, and the titles that left Leaving soon while
 * a failed delete had left their record unmonitored (safety-r3-6). Newest
 * first. Server-only (the failure words).
 *
 * Each row carries its outcome id: one title can have several rows, such as
 * "Failed" and a later "Deleted" (UX 12.6 item 2.2, ux-a11y-r4-2). The
 * still-unmonitored outcomes are read with the JSON path filter of TS 11.4,
 * with no raw SQL (architecture-r4-6).
 *
 * | Row | `result` | `cause` |
 * |---|---|---|
 * | `deleted` | "deleted" | null |
 * | `failed` | "failed" | the failure words ("Sonarr returned HTTP 500.") |
 * | `rescued` or `released` with `detail.stillUnmonitored` | "stillUnmonitored" | the reason words ("A member played it.") |
 *
 * @module lib/cleanup/screens/history/titles
 */

import "server-only"

import { OUTCOME_KINDS, type OutcomeKind, parseOutcomeDetail, type OutcomeWords, outcomeWords } from "@/lib/cleanup/outcomes"
import type { HistoryParams } from "@/lib/cleanup/screens/leaving/params"
import { itemRefOf } from "@/lib/cleanup/screens/leaving/item-ref"
import type { People } from "@/lib/cleanup/screens/leaving/people"
import { failureWords } from "@/lib/cleanup/failure-words"
import { arrServiceOf } from "@/lib/cleanup/screens/leaving/words"
import type { HistoryTitle } from "@/lib/cleanup/types/list-parts"
import type { NamedRule } from "@/lib/cleanup/types/rule-parts"
import type { CleanupOutcome, Prisma } from "@/lib/generated/prisma/client"

/** The deleted and failed titles, and the rescues and releases that left a record unmonitored (TS 11.4). */
export const HISTORY_TITLES_WHERE = {
  OR: [
    { kind: { in: ["deleted", "failed"] } },
    {
      kind: { in: ["rescued", "released"] },
      OR: [{ detail: { path: ["stillUnmonitored"], equals: "radarr" } }, { detail: { path: ["stillUnmonitored"], equals: "sonarr" } }],
    },
  ],
} satisfies Prisma.CleanupOutcomeWhereInput

/** The table's rows with the rule and search filters. */
export function historyTitlesWhere(params: Pick<HistoryParams, "q" | "rule">): Prisma.CleanupOutcomeWhereInput {
  const and: Prisma.CleanupOutcomeWhereInput[] = [HISTORY_TITLES_WHERE]
  if (params.rule) and.push({ ruleIds: { has: params.rule } })
  if (params.q) and.push({ title: { contains: params.q, mode: "insensitive" } })
  return { AND: and }
}

/** Newest first; the id breaks ties so pages never overlap. */
export const HISTORY_TITLES_ORDER: Prisma.CleanupOutcomeOrderByWithRelationInput[] = [{ actedAt: "desc" }, { id: "asc" }]

export interface TitleContext {
  people: People
  rule: (ruleId: string) => NamedRule
  /** The words of a rescue or release reason, with the outcome row for its stored Why and rule. */
  words: (outcome: CleanupOutcome) => OutcomeWords
}

const kindOf = (kind: string): OutcomeKind => OUTCOME_KINDS.find((entry) => entry === kind) ?? "deleted"

function resultOf(kind: OutcomeKind): HistoryTitle["result"] {
  if (kind === "deleted") return "deleted"
  return kind === "failed" ? "failed" : "stillUnmonitored"
}

function approvedByOf(approvedBy: string | null, people: People): HistoryTitle["approvedBy"] {
  if (approvedBy === "automatic") return "automatic"
  return people.ref(approvedBy)
}

/** One row of the Deleted titles table. */
export function historyTitle(outcome: CleanupOutcome, ctx: TitleContext): HistoryTitle {
  const kind = kindOf(outcome.kind)
  const result = resultOf(kind)
  const detail = parseOutcomeDetail(outcome.detail)
  const service = detail.service ?? arrServiceOf(outcome.level)
  let cause: string | null = null
  if (result === "failed") cause = `${detail.code ? failureWords(detail.code, service) : "The delete failed"}.`
  if (result === "stillUnmonitored") cause = outcomeWords(outcome.reason, { ...detail, stillUnmonitored: undefined }, ctx.words(outcome))
  return {
    ...itemRefOf(outcome),
    id: outcome.id,
    kind,
    reason: outcome.reason,
    rule: outcome.ruleIds.length > 0 ? ctx.rule(outcome.ruleIds[0]) : null,
    actedAt: outcome.actedAt.toISOString(),
    freedBytes: outcome.freedBytes.toString(),
    approvedBy: approvedByOf(outcome.approvedBy, ctx.people),
    result,
    cause,
    stillUnmonitored: detail.stillUnmonitored ?? null,
  }
}
