"use server"

import { memberAction } from "@/lib/actions/define-action"
import { keepTitle } from "@/lib/cleanup/actions/keeps/keep"
import type { KeepsResult } from "@/lib/cleanup/actions/keeps/result"
import { endMyKeep } from "@/lib/cleanup/actions/keeps/undo"
import type { KeepCleanupTitleResult, RemoveMyCleanupKeepResult } from "@/lib/cleanup/types/actions"
import { keepTitleInput, removeMyKeepInput } from "@/lib/validations/cleanup-actions"

/**
 * The member's Keeps of media cleanup (TS 10.2, 10.3, 13.2). Each action
 * needs an active membership and spends the member's `cleanup:keep` limit.
 * The member's page shows the result at once, so no route is revalidated:
 * the kept card keeps its place until a reload (UX 9.2.1, 9.3).
 */
const LIMIT = { name: "cleanup:keep", by: "user" } as const

/**
 * Keep a title that is leaving soon, so no cleanup rule deletes it for the
 * Keep length that the server admin set (90 days by default). The title
 * leaves Leaving soon at once, with its show or seasons. A member keeps a
 * title once; a repeated Keep returns the same Keep. It fails while the
 * title, its show or one of its seasons is being deleted, at the member's
 * Keep limit, and while Plex does not answer. Returns the Keep id and its
 * end.
 */
export const keepCleanupTitle = memberAction({
  entitlement: "full",
  input: keepTitleInput,
  rateLimit: LIMIT,
  fallbackError: "Could not keep the title. Try again.",
  handler: async ({ itemKey }, { userId }): Promise<KeepsResult<KeepCleanupTitleResult>> => keepTitle(itemKey, { userId, now: new Date() }),
})

/**
 * End one of your own Keeps of media cleanup. The title can come back to
 * Leaving soon after the next nightly check, with a full grace period. With
 * `restore` (the Undo right after a Keep), the title goes back to Leaving
 * soon with its old leave date, unless a run happened since the Keep, the
 * feature is off, or a rule changed; then it acts as a plain end. Returns
 * whether the title went back.
 */
export const removeMyCleanupKeep = memberAction({
  entitlement: "full",
  input: removeMyKeepInput,
  rateLimit: LIMIT,
  fallbackError: "Could not end the Keep. Try again.",
  handler: async (input, { userId }): Promise<KeepsResult<RemoveMyCleanupKeepResult>> => endMyKeep(input, { userId, now: new Date() }),
})
