/**
 * The input schema of every media cleanup action (TS 3.5, TS 10.2). Client-safe.
 *
 * One rule id pattern serves every check (delivery-r4-1): cuids, and the
 * hyphenated E2E seed ids such as `a11y-cleanup-rule-live`. No other file
 * writes a rule id pattern.
 *
 * A batch approval or a turn-on names the set as the page showed it (`count`
 * and `keysHash`, E28), never the item keys. `keysHash` is server-made
 * (lib/cleanup/keys-hash.ts): no client code computes it.
 *
 * @module lib/validations/cleanup-actions
 */

import { z } from "zod"

import { RECIPE_IDS } from "@/lib/cleanup/constants"
import { ruleDraftSchema } from "@/lib/validations/cleanup-draft"
import { cleanupOptionsSchema, protectionsOptionsSchema } from "@/lib/validations/cleanup-options"
import { ruleDefinitionSchema } from "@/lib/validations/cleanup-rule"
import { ACTION_IDS } from "@/lib/validations/cleanup-vocabulary"

// Not exported: only this file uses it, and `knip --production` reports an unused export (delivery-r5-5)
const RULE_ID_SOURCE = "[A-Za-z0-9_-]{1,40}"
/** A whole rule id. `rules/[id]/page.tsx` answers `notFound()` for an id that does not match. */
export const RULE_ID_PATTERN = new RegExp(`^${RULE_ID_SOURCE}$`)
export const ruleIdSchema = z.string().regex(RULE_ID_PATTERN)
export const itemKeySchema = z.string().regex(/^(movie|show|season):[a-z]+:[A-Za-z0-9]+(:\d+)?$/).max(80)
export const itemKeysSchema = z.array(itemKeySchema).min(1).max(500)
export const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
/** @internal Only the tests import it: each action input takes one batch kind (architecture-r6-6). */
export const batchIdSchema = z.string().regex(new RegExp(`^(deletion|entry)-${RULE_ID_SOURCE}$`))
// A deletion batch only: deleteCleanupBatch, the batch form of E37 and getCleanupBatchSelection (architecture-r5-4)
const deletionBatchIdSchema = z.string().regex(new RegExp(`^deletion-${RULE_ID_SOURCE}$`))
// An entry batch only: approveCleanupEntryBatch (architecture-r6-6)
const entryBatchIdSchema = z.string().regex(new RegExp(`^entry-${RULE_ID_SOURCE}$`))
/** The Settings `returnTo` of the turn-on page (TS 12.7 item 10). */
export const turnOnReturnToSchema = z.string().regex(new RegExp(`^/admin/cleanup/rules/${RULE_ID_SOURCE}/turn-on$`))

export type BatchKind = "deletion" | "entry"
export interface ParsedBatchId {
  kind: BatchKind
  ruleId: string
}

/** Splits `deletion-<ruleId>` or `entry-<ruleId>` at the first "-": a rule id can hold "-". Null for any other value. */
export function parseBatchId(batchId: string): ParsedBatchId | null {
  if (!batchIdSchema.safeParse(batchId).success) return null
  const cut = batchId.indexOf("-")
  return { kind: batchId.slice(0, cut) === "deletion" ? "deletion" : "entry", ruleId: batchId.slice(cut + 1) }
}

const ruleNameSchema = z.string().trim().min(1).max(80)
const reviewedAt = z.iso.datetime() // the action refuses a value older than APPROVAL_TTL_MS or later than now + 60 s (CLEANUP_REVIEW_STALE)
export const keysHashSchema = z.string().regex(/^[a-f0-9]{64}$/) // SHA-256 of the sorted item keys, lower-case hex (lib/cleanup/keys-hash.ts)
const revisionSchema = z.number().int().min(1)
const excludeKeysSchema = z.array(itemKeySchema).max(500).default([])
// What the approve dialog named for the approved items (E36). The action compares it with the items that it approves.
const batchSelectedSchema = z.object({ count: z.number().int().min(1), action: z.enum(ACTION_IDS), exclusionCount: z.number().int().min(0) })
// The batch form of postpone and exclude (E37): the batch as the card shows it, the unticked keys, and the count that the dialog names.
const batchTargetSchema = z.object({ batchId: deletionBatchIdSchema, count: z.number().int().min(1), keysHash: keysHashSchema,
  excludeKeys: excludeKeysSchema, selectedCount: z.number().int().min(1) })
/** The batch form that the footer Postpone and Exclude of a deletion batch send (E37). */
export type BatchTarget = z.input<typeof batchTargetSchema>
// Exactly one of `itemKeys` and `batch`. In Zod 4, `.refine()` keeps the object schema, so the MCP tool schema stays `type: "object"`.
const oneTarget = (input: { itemKeys?: unknown; batch?: unknown }) => (input.itemKeys === undefined) !== (input.batch === undefined)
const oneTargetIssue = { message: "Send exactly one of itemKeys and batch", path: ["itemKeys"] }

export const createCleanupRuleInput = z.object({ name: ruleNameSchema, definition: ruleDefinitionSchema })
export const createCleanupRuleFromRecipeInput = z.object({
  recipeId: z.enum(RECIPE_IDS), level: z.enum(["movie", "show"]).optional(),
  values: z.record(z.string().max(30), z.unknown()), // validated by the recipe's own schema (TS 6.10)
})
export const saveCleanupRuleInput = z.object({
  ruleId: ruleIdSchema, name: ruleNameSchema, definition: ruleDefinitionSchema,
  expectedRevision: revisionSchema, confirmImpact: z.boolean().default(false),
})
export const ruleRefInput = z.object({ ruleId: ruleIdSchema })
export const turnOnCleanupRuleInput = z.object({
  ruleId: ruleIdSchema, mode: z.enum(["reviewFirst", "automatic"]), expectedRevision: revisionSchema,
  count: z.number().int().min(0), keysHash: keysHashSchema, reviewedAt, typedCount: z.number().int().optional(),
})

export const PREVIEW_TABS = ["matches", "nearMisses", "protected", "missing", "cannotDelete"] as const
export type PreviewTab = (typeof PREVIEW_TABS)[number]
export const PREVIEW_SORTS = ["largest", "closest", "oldestPlay", "title"] as const
export type PreviewSort = (typeof PREVIEW_SORTS)[number]
export const previewRequestSchema = z.object({
  definition: ruleDraftSchema, ruleId: ruleIdSchema.optional(),
  tab: z.enum(PREVIEW_TABS).default("matches"),
  sort: z.enum(PREVIEW_SORTS).default("largest"),
  page: z.number().int().min(1).max(200).default(1),
  search: z.string().trim().max(100).optional(),
  nearMissCondition: z.string().regex(/^[ca][1-9]\d{0,2}$/).optional(),
  focus: z.object({ conditionId: z.string().regex(/^[cp][1-9]\d{0,2}$/) }).optional(),
})
/** The body that the editor sends to `POST /api/admin/cleanup/preview`. */
export type PreviewRequest = z.input<typeof previewRequestSchema>
export const previewRecipeInput = createCleanupRuleFromRecipeInput
export const protectionImpactInput = z.object({ protections: protectionsOptionsSchema }) // keepsEnabled no longer changes a protection (E30)
export const itemWhyInput = z.object({
  itemKey: itemKeySchema, ruleId: ruleIdSchema.optional(), definition: ruleDraftSchema.optional(), outcomeId: z.string().max(40).optional(),
})
// A batch approval names the batch as the page showed it (count and hash of every key) and the rows the admin unticked.
export const deleteCleanupBatchInput = z.object({ batchId: deletionBatchIdSchema, count: z.number().int().min(1), keysHash: keysHashSchema,
  excludeKeys: excludeKeysSchema, selected: batchSelectedSchema, reviewedAt, typedCount: z.number().int().optional() })
export const batchSelectionInput = z.object({ batchId: deletionBatchIdSchema, keys: itemKeysSchema }) // getCleanupBatchSelection (E36)
export const approveEntryBatchInput = z.object({ batchId: entryBatchIdSchema, count: z.number().int().min(1), keysHash: keysHashSchema,
  excludeKeys: excludeKeysSchema, reviewedAt })
export const postponeInput = z.object({ itemKeys: itemKeysSchema.optional(), batch: batchTargetSchema.optional(),
  days: z.number().int().min(1).max(3650) }).refine(oneTarget, oneTargetIssue)
export const excludeInput = z.object({ itemKeys: itemKeysSchema.optional(), batch: batchTargetSchema.optional(),
  until: dayKeySchema.nullable(), note: z.string().trim().max(500).optional() }).refine(oneTarget, oneTargetIssue)
export const keepIdInput = z.object({ keepId: z.string().min(1).max(40) })
export const exclusionIdInput = z.object({ exclusionId: z.string().min(1).max(40) })
export const exclusionEndInput = z.object({ exclusionId: z.string().min(1).max(40), until: dayKeySchema.nullable() })
export const updateCleanupSettingsInput = z.discriminatedUnion("section", [
  z.object({ section: z.literal("cleanup-feature"), values: z.object({ enabled: z.boolean() }) }),
  z.object({ section: z.literal("cleanup-protections"), values: z.object({ protections: protectionsOptionsSchema }) }),
  z.object({ section: z.literal("cleanup-budget"), values: cleanupOptionsSchema.shape.budget.unwrap()
    .extend({ entryCheck: cleanupOptionsSchema.shape.entryCheck.unwrap(), automaticMinGraceDays: z.number().int().min(7).max(3650) }) }),
  z.object({ section: z.literal("cleanup-defaults"), values: cleanupOptionsSchema.shape.defaults.unwrap() }),
  z.object({ section: z.literal("cleanup-plex"), values: cleanupOptionsSchema.shape.plex.unwrap() }),
  z.object({ section: z.literal("cleanup-members"), values: cleanupOptionsSchema.shape.members.unwrap() }),
])
/** The Settings tab sections (UX 4.10): the `?section=` ids and the `updateCleanupSettings` sections. */
export const CLEANUP_SETTINGS_SECTIONS = ["cleanup-feature", "cleanup-protections", "cleanup-budget", "cleanup-defaults", "cleanup-plex", "cleanup-members"] as const
export type CleanupSettingsSection = (typeof CLEANUP_SETTINGS_SECTIONS)[number]
type InputSection = z.infer<typeof updateCleanupSettingsInput>["section"]
type SameSections = [InputSection] extends [CleanupSettingsSection] ? ([CleanupSettingsSection] extends [InputSection] ? true : never) : never
const sameSections: SameSections = true
void sameSections
export const keepTitleInput = z.object({ itemKey: itemKeySchema })
export const removeMyKeepInput = z.object({ keepId: z.string().min(1).max(40), restore: z.boolean().default(false) })
