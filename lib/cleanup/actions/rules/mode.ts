/**
 * The mode changes of the rule menu and the delete (TS 8.12, 10.3): Switch
 * to Review first, Move back to Dry run and Delete rule. Each takes the run
 * claim and releases it with the change check (TS 8.1 items 4 and 7). A mode
 * change raises the rule `revision` with a compare-and-set, and returns the
 * new `revision` and `mode`, so the editor that called it keeps its draft
 * (TS 12.6, architecture-r2-1). Server-only.
 *
 * @module lib/cleanup/actions/rules/mode
 */

import "server-only"

import { type ActionResult, ok } from "@/lib/actions/result"
import { writeNeedsApproval } from "@/lib/cleanup/actions/rules/approval"
import { conflict, invalid, notFound, revalidateRules, RULE_WORDS, type RuleActionCode } from "@/lib/cleanup/actions/rules/result"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"
import { releaseRule } from "@/lib/cleanup/run/release"
import { type HeldRunClaim, releaseRunClaim, takeRunClaim } from "@/lib/cleanup/run/run-claim"
import type { DeleteCleanupRuleResult, MoveCleanupRuleToDryRunResult, SetCleanupRuleReviewFirstResult } from "@/lib/cleanup/types/actions"
import type { CleanupRule } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { parseRuleDefinition } from "@/lib/validations/cleanup-draft"

type Result<T> = ActionResult<T, RuleActionCode>

/** Runs `body` under the run claim, and releases it with the change check whatever happens. Busy: `CONFLICT`. */
async function underRunClaim<T>(actorId: string, body: () => Promise<Result<T>>): Promise<Result<T>> {
  const held: HeldRunClaim | null = await takeRunClaim()
  if (!held) return conflict("run")
  try {
    return await body()
  } finally {
    await releaseRunClaim(held.claim, held.baseline, { actorId })
  }
}

/** Writes `mode` where the row still has the revision and mode that the action read. False: another write came first. */
async function writeMode(rule: Pick<CleanupRule, "id" | "revision" | "mode">, mode: string, actorId: string): Promise<boolean> {
  const { count } = await prisma.cleanupRule.updateMany({
    where: { id: rule.id, revision: rule.revision, mode: rule.mode },
    data: { mode, revision: { increment: 1 }, updatedBy: actorId },
  })
  return count > 0
}

/**
 * `setCleanupRuleReviewFirst`: only from Automatic, so a Dry run rule never
 * skips its turn-on page and checks (E13). Its items need an approval at
 * once. Approved items stay approved.
 */
export async function switchToReviewFirst(ruleId: string, actorId: string): Promise<Result<SetCleanupRuleReviewFirstResult>> {
  const rule = await prisma.cleanupRule.findUnique({ where: { id: ruleId } })
  if (!rule) return notFound()
  if (rule.mode !== "automatic") return invalid(RULE_WORDS.reviewFirstOnly)
  const result = await underRunClaim(actorId, async () => {
    if (!(await writeMode(rule, "reviewFirst", actorId))) return conflict("rule")
    await writeNeedsApproval(ruleId, "reviewFirst")
    return ok({ revision: rule.revision + 1, mode: "reviewFirst" as const })
  })
  if (!result.success) return result
  logAuditEvent(AuditEventType.CLEANUP_RULE_MODE_CHANGED, actorId, { ruleId, from: "automatic", to: "reviewFirst", typed: false })
  revalidateRules(ruleId)
  return result
}

/**
 * `moveCleanupRuleToDryRun` (TS 8.12): `mode: "dryRun"`, `turnedOnAt` stays.
 * `releaseRule()` lets go of its items: those that no other live rule holds
 * leave Leaving soon (`ruleOff`), the others get the merge of their other
 * rules, and its held items leave. A rule already in Dry run changes nothing.
 */
export async function moveToDryRun(ruleId: string, actorId: string): Promise<Result<MoveCleanupRuleToDryRunResult>> {
  const rule = await prisma.cleanupRule.findUnique({ where: { id: ruleId } })
  if (!rule) return notFound()
  if (rule.mode === "dryRun") return ok({ released: 0, revision: rule.revision, mode: "dryRun" })
  const result = await underRunClaim(actorId, async () => {
    if (!(await writeMode(rule, "dryRun", actorId))) return conflict("rule")
    const { released } = await releaseRule(ruleId, actorId)
    return ok({ released, revision: rule.revision + 1, mode: "dryRun" as const })
  })
  if (!result.success) return result
  logAuditEvent(AuditEventType.CLEANUP_RULE_MODE_CHANGED, actorId, { ruleId, from: rule.mode, to: "dryRun", released: result.data.released, typed: false })
  await requestCollectionSync("dryRun")
  revalidateRules(ruleId)
  return result
}

/**
 * `deleteCleanupRule` (TS 8.12): the release of Move back to Dry run, then
 * the rule row goes. Outcomes keep the rule id, so its runs and deleted
 * titles stay in History.
 */
export async function deleteRule(ruleId: string, actorId: string): Promise<Result<DeleteCleanupRuleResult>> {
  const rule = await prisma.cleanupRule.findUnique({ where: { id: ruleId } })
  if (!rule) return notFound()
  const result = await underRunClaim(actorId, async () => {
    const { released } = await releaseRule(ruleId, actorId)
    const { count } = await prisma.cleanupRule.deleteMany({ where: { id: ruleId } })
    return count > 0 ? ok({ released }) : notFound()
  })
  if (!result.success) return result
  const parsed = parseRuleDefinition(rule.definition)
  const level = parsed.ok ? parsed.definition.level : null
  logAuditEvent(AuditEventType.CLEANUP_RULE_DELETED, actorId, { ruleId, level, mode: rule.mode, released: result.data.released })
  if (rule.mode !== "dryRun") await requestCollectionSync("delete")
  revalidateRules(ruleId)
  return result
}
