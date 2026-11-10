"use server"

import { revalidatePath } from "next/cache"

import { adminAction } from "@/lib/actions/define-action"
import { ok } from "@/lib/actions/result"
import { cleanup } from "@/lib/admin/routes"
import { approveDeletionBatch } from "@/lib/cleanup/actions/items/approve"
import { CLEANUP_JOB_OPTIONS } from "@/lib/cleanup/constants"
import { batchSelection } from "@/lib/cleanup/actions/items/batch"
import { approveEntryBatch } from "@/lib/cleanup/actions/items/entry"
import { excludeItems } from "@/lib/cleanup/actions/items/exclude"
import { postponeItems } from "@/lib/cleanup/actions/items/postpone"
import type { ItemsResult } from "@/lib/cleanup/actions/items/result"
import type { DeleteCleanupBatchResult } from "@/lib/cleanup/types/actions"
import { isRedisConfigured } from "@/lib/queue/connection"
import { enqueueFromRequest } from "@/lib/queue/request-path"
import { JOB_TYPES } from "@/lib/queue/types"
import { approveEntryBatchInput, batchSelectionInput, deleteCleanupBatchInput, excludeInput, postponeInput } from "@/lib/validations/cleanup-actions"

/**
 * The item actions of media cleanup (TS 10.2, 10.3): approve a deletion
 * batch or an entry batch, read the selection of a deletion batch, and
 * postpone or exclude titles. Every write is admin only, spends the
 * per-admin `admin:cleanup` limit and is audited. The page revalidates after
 * each one, also after a stop that kept earlier writes.
 */
const LIMIT = { name: "admin:cleanup" } as const
const PREVIEW_LIMIT = { name: "admin:cleanup-preview" } as const

/** Revalidates the Media cleanup page and passes the result on. */
function revalidated<T>(result: ItemsResult<T>): ItemsResult<T> {
  revalidatePath(cleanup())
  return result
}

/** Enqueues the act step for an approval. False without Redis or when the queue does not answer. */
async function enqueueAct(actorId: string): Promise<boolean> {
  if (!isRedisConfigured()) return false
  // One attempt (TS 9.2): a failed act job waits for an admin's Retry, never for an automatic one
  const queued = await enqueueFromRequest(JOB_TYPES.CLEANUP_ACT, { trigger: "approval", actorId }, CLEANUP_JOB_OPTIONS)
  return queued.ok
}

/**
 * Approve a deletion batch of media cleanup, so its titles are deleted
 * inside the daily budget. Not an MCP tool: a deletion needs a person on
 * the review page. The batch must still have the count and hash that the
 * page showed, and `selected` must name the count, the least careful action
 * and the import list exclusions of the approved titles; else the numbers
 * changed. Above 50 titles it needs the typed count. If the job queue does
 * not answer, the approval stays and the nightly run deletes the titles
 * (`actQueued: false`).
 */
export const deleteCleanupBatch = adminAction({
  input: deleteCleanupBatchInput,
  rateLimit: LIMIT,
  fallbackError: "Could not approve the batch. Try again.",
  handler: async (input, { userId }): Promise<ItemsResult<DeleteCleanupBatchResult>> => {
    const result = await approveDeletionBatch(input, { userId, now: new Date() })
    if (!result.success) return revalidated(result)
    const actQueued = await enqueueAct(userId)
    return revalidated(ok({ approved: result.data.approved, actQueued }))
  },
})

/**
 * Put the new matches of a rule that the entry check held into Leaving
 * soon, with a full grace period, so members can see and keep them. The
 * batch must still have the count and hash that the page showed. Keys in
 * `excludeKeys` stay held. Nothing is deleted now.
 */
export const approveCleanupEntryBatch = adminAction({
  input: approveEntryBatchInput,
  rateLimit: LIMIT,
  fallbackError: "Could not put the titles in Leaving soon. Try again.",
  handler: async (input, { userId }) => revalidated(await approveEntryBatch(input, { userId, now: new Date() })),
})

/**
 * Read a deletion batch of media cleanup as it is now: its count, keys
 * hash, size, titles per action and import list exclusions, and the asked
 * item keys that are still in it, with their action, exclusion and size.
 * It changes nothing, also while cleanup is off or paused.
 */
export const getCleanupBatchSelection = adminAction({
  input: batchSelectionInput,
  rateLimit: PREVIEW_LIMIT,
  fallbackError: "Could not read the batch. Try again.",
  handler: async ({ batchId, keys }) => ok(await batchSelection(batchId, keys, new Date())),
})

/**
 * Postpone media cleanup titles in Leaving soon by 1 to 3650 days: each
 * leave date moves later, never earlier, and an approval is cleared. A
 * postponed season moves its show too. Titles being deleted are skipped
 * (`skipped`). Send `itemKeys`, or `batch` for the selection of a deletion
 * batch. It never deletes anything.
 */
export const postponeCleanupItems = adminAction({
  input: postponeInput,
  rateLimit: LIMIT,
  fallbackError: "Could not postpone the titles. Try again.",
  handler: async (input, { userId }) => revalidated(await postponeItems(input, { userId, now: new Date() })),
})

/**
 * Exclude media cleanup titles from every rule until the end of the
 * `until` day (null: no end date), with an optional note that only admins
 * see. A title in Leaving soon leaves it at once, with its show or seasons.
 * Titles being deleted are skipped (`skipped`). Send `itemKeys`, or `batch`
 * for the selection of a deletion batch. It never deletes anything.
 */
export const excludeCleanupItems = adminAction({
  input: excludeInput,
  rateLimit: LIMIT,
  fallbackError: "Could not exclude the titles. Try again.",
  handler: async (input, { userId }) => revalidated(await excludeItems(input, { userId, now: new Date() })),
})
