"use server"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { runProtectionImpact } from "@/lib/cleanup/preview/protection-impact"
import { runRecipePreview } from "@/lib/cleanup/preview/recipe-preview"
import { namesRequesters } from "@/lib/cleanup/preview/rows"
import { runPreview } from "@/lib/cleanup/preview/run-preview"
import { getWhySheet } from "@/lib/cleanup/preview/why-sheet"
import { auditMemberListed } from "@/lib/security/audit-log"
import { itemWhyInput, previewRequestSchema, previewRecipeInput, protectionImpactInput } from "@/lib/validations/cleanup-actions"

/**
 * The read-only media cleanup previews (TS 10.2). Each one is admin only,
 * spends the per-admin `admin:cleanup-preview` limit, and changes nothing.
 * The rule editor's live preview uses `POST /api/admin/cleanup/preview`;
 * these actions serve MCP clients and the recipe, Settings and Why Sheets.
 */
const PREVIEW_LIMIT = { name: "admin:cleanup-preview" } as const

/** How long an MCP preview may run before it stops. */
const PREVIEW_TIMEOUT_MS = 10_000

const TOO_SLOW = "The preview took too long. Try again."

/**
 * Preview a media cleanup rule draft without saving it: the matches,
 * near misses, protected, missing data and cannot delete counts, what each
 * condition does, one page of 50 rows of the chosen tab, the warnings, the
 * safety stops and the rule in plain words. With `ruleId` of a live rule,
 * it also gives the impact on Leaving soon: the titles that would leave,
 * join, or get a less careful action. Row names of requesters are for
 * admins only. It never changes a rule or a title.
 */
export const previewCleanupRule = adminAction({
  input: previewRequestSchema,
  rateLimit: PREVIEW_LIMIT,
  fallbackError: "The preview failed. Try again.",
  handler: async (request, { userId }) => {
    const signal = AbortSignal.timeout(PREVIEW_TIMEOUT_MS)
    try {
      const preview = await runPreview(request, { actorId: userId, signal })
      if (preview.rows.some((row) => namesRequesters(row.requestedBy))) {
        await auditMemberListed("cleanup-requesters", userId, request.ruleId ? { ruleId: request.ruleId } : {})
      }
      return ok(preview)
    } catch (error) {
      if (signal.aborted) return fail("INTERNAL", TOO_SLOW)
      throw error
    }
  },
})

/**
 * Preview a media cleanup recipe with its key values (for example
 * `{ added: "365d" }`) at a level it offers: the matches, a count for each
 * chip of each key, the six largest matches and the rule in plain words.
 * It never creates a rule.
 */
export const previewCleanupRecipe = adminAction({
  input: previewRecipeInput,
  rateLimit: PREVIEW_LIMIT,
  fallbackError: "The recipe preview failed. Try again.",
  handler: async (input) => {
    const result = await runRecipePreview(input)
    if (!result.ok) return fail("VALIDATION", result.error.issues[0]?.message ?? "Check the recipe values.")
    return ok(result.data)
  },
})

/**
 * Preview new global protection values before they are saved: how many
 * more or fewer titles each rule matches, how many titles each enabled
 * protection protects, and how many titles in Leaving soon the new values
 * keep safe (they leave Leaving soon at the save). It saves nothing.
 */
export const previewCleanupProtectionImpact = adminAction({
  input: protectionImpactInput,
  rateLimit: PREVIEW_LIMIT,
  fallbackError: "The protection preview failed. Try again.",
  handler: async (input) => ok(await runProtectionImpact(input)),
})

/**
 * Explain one title of media cleanup: each condition with its real value,
 * the protections, the forecast and one value that would include a near
 * miss, what the rule's action does to it, and the other rules that match
 * it. Live from the newest library data with a rule draft or a saved rule,
 * or from History with `outcomeId`. It names members, so it is for admins
 * only. It changes nothing.
 */
export const getCleanupItemWhy = adminAction({
  input: itemWhyInput,
  rateLimit: PREVIEW_LIMIT,
  fallbackError: "Could not explain this title. Try again.",
  handler: async (input, { userId }) => {
    const data = await getWhySheet(input)
    if (!data) return fail("NOT_FOUND", "This title is not in the library data.")
    await auditMemberListed("cleanup-requesters", userId, input.ruleId ? { ruleId: input.ruleId } : {})
    return ok(data)
  },
})
