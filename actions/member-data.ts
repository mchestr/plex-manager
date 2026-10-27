"use server"

/**
 * A member deleting single items of their own data from `/account` (P11.15,
 * GAP-36): a media mark or a watchlist history item.
 *
 * Ownership sits in the `where` of each write, so another member's id
 * matches nothing and returns `NOT_FOUND`. The two share the
 * `account:data` limit, 60 an hour per member.
 *
 * @module actions/member-data
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { memberAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { prisma } from "@/lib/prisma"
import { recordIdSchema } from "@/lib/validations/params"

const RATE_LIMIT = { name: "account:data" } as const

export const deleteMyMark = memberAction({
  input: z.strictObject({ markId: recordIdSchema }),
  rateLimit: RATE_LIMIT,
  fallbackError: "Could not delete the mark",
  handler: async ({ markId }, { userId }) => {
    const { count } = await prisma.userMediaMark.deleteMany({ where: { id: markId, userId } })
    if (count === 0) return fail("NOT_FOUND", "That mark is already gone")
    revalidatePath("/account")
    return ok(null)
  },
})

/**
 * Forgets one watchlist history row. If the title is still on the member's
 * Plex watchlist, the next sync sees it as new and may request it again.
 */
export const forgetWatchlistItem = memberAction({
  input: z.strictObject({ historyId: recordIdSchema }),
  rateLimit: RATE_LIMIT,
  fallbackError: "Could not forget the item",
  handler: async ({ historyId }, { userId }) => {
    const { count } = await prisma.watchlistSyncHistory.deleteMany({ where: { id: historyId, userId } })
    if (count === 0) return fail("NOT_FOUND", "That item is already gone")
    revalidatePath("/account")
    return ok(null)
  },
})

