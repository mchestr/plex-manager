"use server"

/**
 * The media cleanup rule actions (TS 10.2, 10.3): create from a draft or a
 * recipe, save, duplicate, delete, turn on, Switch to Review first, Move back
 * to Dry run and Run dry run now. Each is admin only, spends the per-admin
 * `admin:cleanup` limit and is audited. A new rule always starts in Dry run.
 * The steps live in `lib/cleanup/actions/rules/`.
 *
 * @module actions/admin/cleanup-rules
 */

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { definitionRule, insertRule, recipeRule } from "@/lib/cleanup/actions/rules/create"
import { queueRuleDryRun } from "@/lib/cleanup/actions/rules/enqueue"
import { deleteRule, moveToDryRun, switchToReviewFirst } from "@/lib/cleanup/actions/rules/mode"
import { invalid, notFound, revalidateRules, RULE_WORDS, type RuleActionCode } from "@/lib/cleanup/actions/rules/result"
import { saveRule } from "@/lib/cleanup/actions/rules/save"
import { checkRuleScope } from "@/lib/cleanup/actions/rules/scope"
import { turnOnRule } from "@/lib/cleanup/actions/rules/turn-on"
import { CLEANUP_UPSTREAM_WORDS } from "@/lib/cleanup/constants"
import type {
  CleanupQueuedResult,
  CreateCleanupRuleResult,
  DeleteCleanupRuleResult,
  DuplicateCleanupRuleResult,
  MoveCleanupRuleToDryRunResult,
  SaveCleanupRuleResult,
  SetCleanupRuleReviewFirstResult,
  TurnOnCleanupRuleResult,
} from "@/lib/cleanup/types/actions"
import { prisma } from "@/lib/prisma"
import { isRedisConfigured } from "@/lib/queue/connection"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import {
  createCleanupRuleFromRecipeInput,
  createCleanupRuleInput,
  ruleRefInput,
  saveCleanupRuleInput,
  turnOnCleanupRuleInput,
} from "@/lib/validations/cleanup-actions"
import { parseRuleDefinition } from "@/lib/validations/cleanup-draft"

const LIMIT = { name: "admin:cleanup" } as const

/**
 * Create a media cleanup rule from a whole definition: its level, its
 * libraries (each must be a library that Radarr or Sonarr manages), its
 * conditions, protections and Then settings. The rule starts in Dry run,
 * which records its matches and changes nothing, and a dry run starts at
 * once (`dryRunQueued` is false while the job queue is not set up or does
 * not answer). A taken name gets " 2", " 3". At most 50 rules.
 */
export const createCleanupRule = adminAction<CreateCleanupRuleResult, typeof createCleanupRuleInput, RuleActionCode>({
  input: createCleanupRuleInput,
  rateLimit: LIMIT,
  fallbackError: "Could not create the rule. Try again.",
  handler: async ({ name, definition }, { userId }) => {
    const scope = await checkRuleScope(definition)
    if (scope) return scope
    return insertRule(definitionRule(name, definition, { kind: "blank" }), userId)
  },
})

/**
 * Create a media cleanup rule from a recipe with its key values (for example
 * `{ added: "365d", grace: 30 }`) at a level it offers. The rule takes the
 * recipe's name (with " 2" when it exists) and every library of the level
 * that Radarr or Sonarr manages. It starts in Dry run, and a dry run starts
 * at once. At most 50 rules.
 */
export const createCleanupRuleFromRecipe = adminAction<CreateCleanupRuleResult, typeof createCleanupRuleFromRecipeInput, RuleActionCode>({
  input: createCleanupRuleFromRecipeInput,
  rateLimit: LIMIT,
  fallbackError: "Could not create the rule. Try again.",
  handler: async (input, { userId }) => {
    const built = await recipeRule(input)
    return built.ok ? insertRule(built.rule, userId) : built.failure
  },
})

/**
 * Save a media cleanup rule: its name and definition. Send the `revision`
 * that you read as `expectedRevision`: a rule that changed since gives
 * `CONFLICT`. A rule that is on (Review first or Automatic) keeps its level.
 * A save of a rule that is on can move titles in or out of Leaving soon, or
 * give them a less careful action: it then needs `confirmImpact: true`, and
 * titles that no longer match leave Leaving soon at once (`exitsApplied` is
 * false while a run is in progress: they leave at its end).
 */
export const saveCleanupRule = adminAction<SaveCleanupRuleResult, typeof saveCleanupRuleInput, RuleActionCode>({
  input: saveCleanupRuleInput,
  rateLimit: LIMIT,
  fallbackError: "Could not save the rule. Try again.",
  handler: (input, { userId }) => saveRule(input, userId),
})

/**
 * Copy a media cleanup rule. The copy is named "{name} copy", keeps the
 * definition, starts in Dry run whatever the mode of the rule, and a dry run
 * of it starts at once. At most 50 rules.
 */
export const duplicateCleanupRule = adminAction<DuplicateCleanupRuleResult, typeof ruleRefInput, RuleActionCode>({
  input: ruleRefInput,
  rateLimit: LIMIT,
  fallbackError: "Could not copy the rule. Try again.",
  handler: async ({ ruleId }, { userId }) => {
    const rule = await prisma.cleanupRule.findUnique({ where: { id: ruleId } })
    if (!rule) return notFound()
    const parsed = parseRuleDefinition(rule.definition)
    if (!parsed.ok) return invalid(RULE_WORDS.unreadable)
    const created = await insertRule(definitionRule(rule.name, parsed.definition, { kind: "duplicate", ruleId }), userId)
    return created.success ? ok({ ruleId: created.data.ruleId }) : created
  },
})

/**
 * Delete a media cleanup rule. Its titles leave Leaving soon, unless another
 * rule that is on holds them. Nothing is deleted from the library. Its runs
 * and deleted titles stay in History. Refused while a run is in progress.
 */
export const deleteCleanupRule = adminAction<DeleteCleanupRuleResult, typeof ruleRefInput, RuleActionCode>({
  input: ruleRefInput,
  rateLimit: LIMIT,
  fallbackError: "Could not delete the rule. Try again.",
  handler: ({ ruleId }, { userId }) => deleteRule(ruleId, userId),
})

/**
 * Turn a media cleanup rule on, or change the mode of a rule that is on,
 * from its review page: the page sends the `count` and `keysHash` of the
 * titles it showed, the rule `revision` and the time it loaded, and the
 * typed count above 50 titles for Automatic. A change since the review gives
 * `CLEANUP_REVIEW_STALE`, and nothing changes. Not an MCP tool: a deletion
 * needs a person on the review page.
 */
export const turnOnCleanupRule = adminAction<TurnOnCleanupRuleResult, typeof turnOnCleanupRuleInput, RuleActionCode>({
  input: turnOnCleanupRuleInput,
  rateLimit: LIMIT,
  fallbackError: "Could not turn the rule on. Try again.",
  handler: (input, { userId }) => turnOnRule(input, userId),
})

/**
 * Switch a media cleanup rule from Automatic to Review first. Its titles
 * keep their leave dates, and at each leave date the batch waits for an
 * admin's approval. Only an Automatic rule can switch: a Dry run rule turns
 * on from its review page. Refused while a run is in progress.
 */
export const setCleanupRuleReviewFirst = adminAction<SetCleanupRuleReviewFirstResult, typeof ruleRefInput, RuleActionCode>({
  input: ruleRefInput,
  rateLimit: LIMIT,
  fallbackError: "Could not change the mode. Try again.",
  handler: ({ ruleId }, { userId }) => switchToReviewFirst(ruleId, userId),
})

/**
 * Move a media cleanup rule back to Dry run. Its titles leave Leaving soon,
 * unless another rule that is on holds them, and nothing is deleted. Dry
 * runs go on. Returns the new `revision` and `mode`. Refused while a run is
 * in progress.
 */
export const moveCleanupRuleToDryRun = adminAction<MoveCleanupRuleToDryRunResult, typeof ruleRefInput, RuleActionCode>({
  input: ruleRefInput,
  rateLimit: LIMIT,
  fallbackError: "Could not move the rule to Dry run. Try again.",
  handler: ({ ruleId }, { userId }) => moveToDryRun(ruleId, userId),
})

/**
 * Start a dry run of a media cleanup rule now: it checks the newest library
 * data with the saved rule and records the matches. It changes nothing. A
 * dry run of the same rule version that waits is joined. Needs the job queue.
 */
export const runCleanupRuleDryRun = adminAction<CleanupQueuedResult, typeof ruleRefInput, RuleActionCode>({
  input: ruleRefInput,
  rateLimit: LIMIT,
  fallbackError: "Could not start the dry run. Try again.",
  handler: async ({ ruleId }, { userId }) => {
    if (!isRedisConfigured()) return invalid(RULE_WORDS.redis)
    const rule = await prisma.cleanupRule.findUnique({ where: { id: ruleId }, select: { revision: true } })
    if (!rule) return notFound()
    const added = await queueRuleDryRun(ruleId, rule.revision, userId)
    if (!added.ok) return fail("UPSTREAM_UNAVAILABLE", CLEANUP_UPSTREAM_WORDS.queue)
    logAuditEvent(AuditEventType.CLEANUP_RUN_STARTED, userId, { kind: "dryRun", queued: true, ruleId })
    revalidateRules(ruleId)
    return ok({ queued: true as const })
  },
})
