/**
 * `turnOnCleanupRule` (TS 10.3, UX 4.6, E13, E28, architecture-r2-3): the
 * turn-on page's one press, and Change mode of a live rule. Server-only.
 *
 * 1. Off: `CLEANUP_OFF`. Paused: `CLEANUP_PAUSED`.
 * 2. A `reviewedAt` older than 15 minutes, or more than 60 s ahead, is stale.
 * 3. A rule `revision` other than `expectedRevision` is stale: a save after
 *    the review never goes through with the old review.
 * 4. The run claim. Busy: `CONFLICT`.
 * 5. `computeTurnOnReview()` evaluates the row it reads, and its revision
 *    must still be `expectedRevision`. The set's `count` and `keysHash` must
 *    equal the page's (E28).
 * 6. A check that stops this mode gives `VALIDATION` with its text.
 * 7. Above 50 items, Automatic needs the typed count.
 * 8. The mode write matches `{ id, expectedRevision, the mode it read }`.
 *    Zero rows: stale, and no item. From Dry run, the matches join with no
 *    entry check (`joinItems`). From a live mode, `needsApproval` follows.
 * 9. Release with the change check. Then the audit, the collection sync and
 *    the revalidation.
 *
 * Every refusal changes nothing.
 *
 * @module lib/cleanup/actions/rules/turn-on
 */

import "server-only"

import { type ActionResult, ok } from "@/lib/actions/result"
import { writeNeedsApproval } from "@/lib/cleanup/actions/rules/approval"
import { checkFailureText } from "@/lib/cleanup/actions/rules/check-words"
import { cleanupFail, conflict, invalid, notFound, revalidateRules, RULE_WORDS, type RuleActionCode, type RuleFailure } from "@/lib/cleanup/actions/rules/result"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"
import { APPROVAL_TTL_MS } from "@/lib/cleanup/constants"
import { joinItems } from "@/lib/cleanup/run/entries"
import type { LiveRule, ReconcileContext } from "@/lib/cleanup/run/reconcile"
import { keyList } from "@/lib/cleanup/run/release"
import { releaseRunClaim, takeRunClaim } from "@/lib/cleanup/run/run-claim"
import { computeTurnOnReview } from "@/lib/cleanup/run/turn-on-review"
import { readCleanupSettingsRow } from "@/lib/cleanup/settings"
import { checkStops } from "@/lib/cleanup/turn-on"
import type { TurnOnCleanupRuleResult } from "@/lib/cleanup/types/actions"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { getFormat } from "@/lib/settings/app-settings"
import type { Mode } from "@/lib/validations/cleanup-vocabulary"

/** How far ahead of the server clock a `reviewedAt` can be (TS 10.3 step 2). */
const CLOCK_SKEW_MS = 60_000

export interface TurnOnInput {
  ruleId: string
  mode: "reviewFirst" | "automatic"
  expectedRevision: number
  count: number
  keysHash: string
  reviewedAt: string
  typedCount?: number
}

type Held = { ok: true; from: Mode; joined: string[]; typed: boolean } | { ok: false; failure: RuleFailure }

const stale = (): Held => ({ ok: false, failure: cleanupFail("CLEANUP_REVIEW_STALE") })

/** The reconcile context with the rule in its new mode and the admin as the actor. */
function withRule(ctx: ReconcileContext, rule: LiveRule, actorId: string): ReconcileContext {
  const rules = [...ctx.rules.values(), rule].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1))
  return { ...ctx, actorId, rules: new Map(rules.map((r) => [r.id, r])) }
}

/** Steps 5 to 8, under the run claim. */
async function turnOnHeld(input: TurnOnInput, actorId: string, now: Date): Promise<Held> {
  const { ruleId, mode, expectedRevision } = input
  const review = await computeTurnOnReview(ruleId, mode, now)
  if (!review || review.rule.revision !== expectedRevision) return stale()
  if (review.count !== input.count || review.keysHash !== input.keysHash) return stale()
  const stop = review.checks.find((check) => checkStops(check, mode))
  if (stop) return { ok: false, failure: invalid(checkFailureText(stop, review.rule.definition.level, await getFormat())) }
  const typed = review.typedApprovalCount
  if (typed !== null && input.typedCount !== typed) return { ok: false, failure: invalid(RULE_WORDS.typed(typed), "typedCount") }

  const from = review.rule.mode
  const { count } = await prisma.cleanupRule.updateMany({
    where: { id: ruleId, revision: expectedRevision, mode: from },
    data: { mode, revision: { increment: 1 }, updatedBy: actorId, ...(from === "dryRun" ? { turnedOnAt: now } : {}) },
  })
  if (count === 0) return stale()
  if (from !== "dryRun") {
    await writeNeedsApproval(ruleId, mode)
    return { ok: true, from, joined: [], typed: typed !== null }
  }
  const matches = review.set.flatMap((item) => (item.result ? [item.result] : []))
  const { joined } = await joinItems(withRule(review.ctx, review.joinRule, actorId), { rule: review.joinRule, matches })
  return { ok: true, from, joined, typed: typed !== null }
}

/** Turns a rule on, or changes the mode of a live rule: the steps above. */
export async function turnOnRule(input: TurnOnInput, actorId: string): Promise<ActionResult<TurnOnCleanupRuleResult, RuleActionCode>> {
  const now = new Date()
  const settings = await readCleanupSettingsRow()
  if (!settings.enabled) return cleanupFail("CLEANUP_OFF")
  if (settings.pausedAt) return cleanupFail("CLEANUP_PAUSED")
  const reviewedAt = Date.parse(input.reviewedAt)
  if (now.getTime() - reviewedAt > APPROVAL_TTL_MS || reviewedAt > now.getTime() + CLOCK_SKEW_MS) return cleanupFail("CLEANUP_REVIEW_STALE")
  const row = await prisma.cleanupRule.findUnique({ where: { id: input.ruleId }, select: { revision: true } })
  if (!row) return notFound()
  if (row.revision !== input.expectedRevision) return cleanupFail("CLEANUP_REVIEW_STALE")

  const held = await takeRunClaim(now)
  if (!held) return conflict("run")
  let result: Held
  try {
    result = await turnOnHeld(input, actorId, now)
  } finally {
    await releaseRunClaim(held.claim, held.baseline, { actorId })
  }
  if (!result.ok) return result.failure

  const { ruleId, mode } = input
  logAuditEvent(AuditEventType.CLEANUP_RULE_MODE_CHANGED, actorId, { ruleId, from: result.from, to: mode, joined: result.joined.length, typed: result.typed })
  if (result.joined.length > 0) logAuditEvent(AuditEventType.CLEANUP_ITEMS_ENTERED, actorId, { ruleId, ...keyList(result.joined) })
  await requestCollectionSync("turnOn")
  revalidateRules(ruleId)
  return ok({ joined: result.joined.length, revision: input.expectedRevision + 1 })
}
