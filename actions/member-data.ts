"use server"

/**
 * A member deleting single items of their own data from `/account` (P11.15,
 * GAP-36): a media mark, a watchlist history item, or an assistant
 * conversation.
 *
 * Ownership sits in the `where` of each write, so another member's id
 * matches nothing and returns `NOT_FOUND`. The three share the
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

/**
 * Deletes one assistant conversation. Its usage rows lose their text but keep
 * tokens and cost, so the server's spend totals stay right; its Discord chat
 * session goes with it.
 */
export const deleteMyConversation = memberAction({
  input: z.strictObject({ conversationId: recordIdSchema }),
  rateLimit: RATE_LIMIT,
  fallbackError: "Could not delete the conversation",
  handler: async ({ conversationId }, { userId }) => {
    const deleted = await prisma.$transaction(async (tx) => {
      // Before the delete, which would set chatConversationId to null
      await tx.lLMUsage.updateMany({
        where: { chatConversationId: conversationId, chatConversation: { userId } },
        data: { prompt: null, response: null },
      })
      const { count } = await tx.chatConversation.deleteMany({ where: { id: conversationId, userId } })
      return count
    })
    if (deleted === 0) return fail("NOT_FOUND", "That conversation is already gone")
    revalidatePath("/account")
    return ok(null)
  },
})
