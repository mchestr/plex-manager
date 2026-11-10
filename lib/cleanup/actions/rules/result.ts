/**
 * The refusals and the words that the rule actions share (TS 10.1, 10.3,
 * 17.2): the codes of `actions/admin/cleanup-rules.ts`, the cleanup refusal
 * of `CLEANUP_ERRORS`, the `CONFLICT` words by case, and the paths that a
 * rule change revalidates. Server-only.
 *
 * @module lib/cleanup/actions/rules/result
 */

import "server-only"

import { revalidatePath } from "next/cache"

import { type ActionErrorCode, type ActionFailure, fail } from "@/lib/actions/result"
import { cleanup, cleanupRule, cleanupTurnOn } from "@/lib/admin/routes"
import { CLEANUP_CONFLICT_WORDS, CLEANUP_ERRORS } from "@/lib/cleanup/constants"

/** The cleanup codes that a rule action can return besides the common ones. */
type RuleCleanupCode = "CLEANUP_REVIEW_STALE" | "CLEANUP_IMPACT_UNCONFIRMED" | "CLEANUP_OFF" | "CLEANUP_PAUSED"

/** Every code of a rule action (TS 10.1). */
export type RuleActionCode = ActionErrorCode | RuleCleanupCode

/** A refusal of a rule action. */
export type RuleFailure = ActionFailure<RuleActionCode>

/** Rules a server holds at most (TS 17.2). */
export const RULE_LIMIT = 50

/** The words of the rule actions that TS 10.1 and 10.3 name, and the new copy of TS 17.2 and 9.5. */
export const RULE_WORDS = {
  limit: `You can have at most ${RULE_LIMIT} rules.`,
  notFound: "This rule no longer exists.",
  levelLocked: "To change the level, move the rule back to Dry run, or duplicate it.",
  reviewFirstOnly: "Turn the rule on from its review page.",
  redis: "Redis is not set up. Library reads and runs need the job queue.",
  nameTaken: "Another rule has this name. Choose another name.",
  unreadable: "The saved rule could not be read. Open it in the editor and save it again.",
  typed: (count: number) => `Type ${count} to confirm.`,
} as const

/** A cleanup refusal with its TS 10.1 words. */
export function cleanupFail(code: RuleCleanupCode): RuleFailure {
  return { success: false, code, error: CLEANUP_ERRORS[code] }
}

/** `CONFLICT` with the words of its case: a run holds the claim, or the rule changed since the caller read it. */
export function conflict(kind: "run" | "rule"): RuleFailure {
  return fail("CONFLICT", CLEANUP_CONFLICT_WORDS[kind])
}

/** `VALIDATION` with the message under `key` too, so the editor shows it at its part (TS 10.1). */
export function invalid(message: string, key?: string): RuleFailure {
  return fail("VALIDATION", message, key ? { fieldErrors: { [key]: [message] } } : {})
}

export const notFound = (): RuleFailure => fail("NOT_FOUND", RULE_WORDS.notFound)

/**
 * Revalidates the Media cleanup page and, for a rule, its editor and turn-on
 * routes (TS 10.1 item 2). Never `updateTag()` or `refresh()`.
 */
export function revalidateRules(ruleId?: string): void {
  revalidatePath(cleanup())
  if (ruleId) {
    revalidatePath(cleanupRule(ruleId))
    revalidatePath(cleanupTurnOn(ruleId))
  }
}
