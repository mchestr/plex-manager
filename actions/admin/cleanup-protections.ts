"use server"

import { revalidatePath } from "next/cache"

import { adminAction } from "@/lib/actions/define-action"
import { cleanup } from "@/lib/admin/routes"
import { adminEndKeep, adminRemoveExclusion, adminSetExclusionEnd } from "@/lib/cleanup/actions/keeps/admin"
import type { KeepsResult } from "@/lib/cleanup/actions/keeps/result"
import { exclusionEndInput, exclusionIdInput, keepIdInput } from "@/lib/validations/cleanup-actions"

/**
 * The protections of media cleanup (TS 10.2, 10.3, UX 4.8): end a member's
 * Keep, remove an exclusion, or move its end date. Each is admin only,
 * spends the per-admin `admin:cleanup` limit and is audited. None deletes a
 * title: one that a protection no longer keeps safe can join Leaving soon
 * at the next run, with a full grace period.
 */
const LIMIT = { name: "admin:cleanup" } as const

/** Revalidates the Media cleanup page and passes the result on. */
function revalidated<T>(result: KeepsResult<T>): KeepsResult<T> {
  revalidatePath(cleanup())
  return result
}

/**
 * End a member's Keep of a media cleanup title. The member sees that the
 * server admin ended it, on the Leaving soon page and on Account, for 30
 * days. Rules can match the title again at the next run.
 */
export const removeCleanupKeep = adminAction({
  input: keepIdInput,
  rateLimit: LIMIT,
  fallbackError: "Could not end the Keep. Try again.",
  handler: async ({ keepId }, { userId }) => revalidated(await adminEndKeep(keepId, { userId, now: new Date() })),
})

/**
 * Remove an admin exclusion of a media cleanup title at once. Rules can
 * match the title again at the next run.
 */
export const removeCleanupExclusion = adminAction({
  input: exclusionIdInput,
  rateLimit: LIMIT,
  fallbackError: "Could not remove the exclusion. Try again.",
  handler: async ({ exclusionId }, { userId }) => revalidated(await adminRemoveExclusion(exclusionId, { userId, now: new Date() })),
})

/**
 * Change the end date of an admin exclusion of a media cleanup title: the
 * exclusion ends at the end of the `until` day in the server time zone, or
 * never (null). Today ends it when the day ends, so rules can match the
 * title again from the next run. A past day is refused.
 */
export const setCleanupExclusionEnd = adminAction({
  input: exclusionEndInput,
  rateLimit: LIMIT,
  fallbackError: "Could not change the end date. Try again.",
  handler: async ({ exclusionId, until }, { userId }) => revalidated(await adminSetExclusionEnd(exclusionId, until, { userId, now: new Date() })),
})
