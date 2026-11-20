/**
 * `saveCleanupRule` (TS 10.3, E19, E25, E32): the revision check, the scope
 * checks, the level of a live rule, the Automatic grace floor, the impact
 * that a live save must confirm, the compare-and-set, the exits now, the
 * audit and the collection sync. Server-only.
 *
 * 1. A revision other than `expectedRevision` is `CONFLICT`. Runs never
 *    raise it, so a dry run that ends after the editor loads never makes a
 *    save stale (E25).
 * 2. A live rule keeps its level. Automatic needs `automaticMinGraceDays`.
 * 3. A live save whose impact moves titles (`leave + join + actionChange`)
 *    needs `confirmImpact`. `actionChange` counts the Leaving soon items whose
 *    action gets less careful or whose import list exclusion turns on
 *    (safety-r3-3), also when the match set stays the same.
 * 4. The update matches `{ id, revision: expectedRevision }` and raises it.
 * 5. A live save tries the run claim and reconciles the rule's items with
 *    the new definition (exits only, `entries: false`), so titles that no
 *    longer match leave at once. A busy claim skips it (`exitsApplied:
 *    false`): the holder's change check applies it (TS 8.1 item 7).
 *
 * @module lib/cleanup/actions/rules/save
 */

import "server-only"

import { type ActionResult, ok } from "@/lib/actions/result"
import { ruleChanges } from "@/lib/cleanup/actions/rules/diff"
import { isNameTaken } from "@/lib/cleanup/actions/rules/naming"
import { cleanupFail, conflict, invalid, notFound, revalidateRules, RULE_WORDS, type RuleActionCode } from "@/lib/cleanup/actions/rules/result"
import { checkRuleScope } from "@/lib/cleanup/actions/rules/scope"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"
import { automaticGraceMessage } from "@/lib/cleanup/editor/errors"
import { runPreview } from "@/lib/cleanup/preview/run-preview"
import { reconcile } from "@/lib/cleanup/run/reconcile"
import { loadReconcileContext, releaseRunClaim, takeRunClaim } from "@/lib/cleanup/run/run-claim"
import { readCleanupSettingsRow } from "@/lib/cleanup/settings"
import type { SaveCleanupRuleResult } from "@/lib/cleanup/types/actions"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { parseRuleDefinition } from "@/lib/validations/cleanup-draft"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"

export interface SaveInput {
  ruleId: string
  name: string
  definition: RuleDefinition
  expectedRevision: number
  confirmImpact: boolean
}

/**
 * The exits of a live save (TS 10.3 step 6): under the run claim, reconcile
 * the rows that hold the rule on the newest snapshot and the live facts.
 * `released` counts the titles that left Leaving soon, rescued or released.
 */
async function applyExits(ruleId: string, actorId: string): Promise<Pick<SaveCleanupRuleResult, "exitsApplied" | "released">> {
  const held = await takeRunClaim()
  if (!held) return { exitsApplied: false, released: 0 }
  try {
    const result = await reconcile({ ruleIds: [ruleId], ctx: await loadReconcileContext({ actorId }) })
    return { exitsApplied: true, released: result.released + result.rescued }
  } finally {
    await releaseRunClaim(held.claim, held.baseline, { actorId })
  }
}

/** Saves a rule: the steps above, in order. */
export async function saveRule(input: SaveInput, actorId: string): Promise<ActionResult<SaveCleanupRuleResult, RuleActionCode>> {
  const { ruleId, name, definition, expectedRevision } = input
  const row = await prisma.cleanupRule.findUnique({ where: { id: ruleId } })
  if (!row) return notFound()
  if (row.revision !== expectedRevision) return conflict("rule")
  const scope = await checkRuleScope(definition)
  if (scope) return scope

  const live = row.mode !== "dryRun"
  const stored = parseRuleDefinition(row.definition)
  const before = stored.ok ? stored.definition : null
  if (live && before && before.level !== definition.level) return invalid(RULE_WORDS.levelLocked, "level")
  if (row.mode === "automatic") {
    const min = (await readCleanupSettingsRow()).options.automaticMinGraceDays
    if (definition.then.graceDays < min) return invalid(automaticGraceMessage(min), "then.graceDays")
  }
  const impact = live ? (await runPreview({ definition, ruleId }, { actorId })).impact : undefined
  if (impact && impact.leave + impact.join + impact.actionChange > 0 && !input.confirmImpact) return cleanupFail("CLEANUP_IMPACT_UNCONFIRMED")

  try {
    const { count } = await prisma.cleanupRule.updateMany({
      where: { id: ruleId, revision: expectedRevision },
      data: { name, definition, schemaVersion: definition.schemaVersion, updatedBy: actorId, revision: { increment: 1 } },
    })
    if (count === 0) return conflict("rule")
  } catch (error) {
    if (isNameTaken(error)) return invalid(RULE_WORDS.nameTaken, "name")
    throw error
  }

  const exits = live ? await applyExits(ruleId, actorId) : { exitsApplied: true, released: 0 }
  logAuditEvent(AuditEventType.CLEANUP_RULE_CHANGED, actorId, {
    ruleId, level: definition.level, mode: row.mode,
    ...ruleChanges({ name: row.name, definition: before }, { name, definition }),
    before: row.definition, after: definition,
    ...(impact ? { impact: { leave: impact.leave, join: impact.join } } : {}),
  })
  if (live) await requestCollectionSync("save")
  revalidateRules(ruleId)
  return ok({ revision: expectedRevision + 1, ...exits })
}
