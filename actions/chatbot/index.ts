"use server"

import { refresh } from "next/cache"
import { z } from "zod"

import { permissionAction } from "@/lib/actions/define-action"
import { fail, ok, type ActionResult } from "@/lib/actions/result"
import { runChatbotForUser } from "@/lib/chatbot/assistant"
import { contextFor, endConversation, openConversationsOf, saveTurn, titleFrom } from "@/lib/chatbot/history"
import { permissionsFor } from "@/lib/permissions"
import { consume } from "@/lib/security/rate-limit"
import { prisma } from "@/lib/prisma"
import { RATE_LIMITED_MESSAGE } from "@/lib/security/rate-limit-messages"
import { getFormatSettings } from "@/lib/settings/app-settings"
import { normalizeTimeZone } from "@/lib/utils/zoned-time"
import { recordIdSchema } from "@/lib/validations/params"

import { type ChatMessage } from "@/lib/chatbot/types"

/** The longest message (SEC-42). The turns before it come from the stored history, never the client. */
const MAX_MESSAGE_CHARS = 8000

const GONE = "That conversation no longer exists. Start a new one."
const NO_ANSWER = "The assistant could not answer. Try again."

const chatInputSchema = z.object({
  message: z.string().trim().min(1, "Type a message").max(MAX_MESSAGE_CHARS),
  conversationId: recordIdSchema.optional(),
  /** The browser's zone; a zone the app does not know falls back to the server zone. */
  timeZone: z.string().max(64).optional(),
})

interface ChatReply {
  message: ChatMessage
  conversationId?: string
}

/**
 * One assistant turn, for an admin or a role holding `assistant:use`. The
 * model sees the conversation's stored turns (`lib/chatbot/history.ts`) and
 * the new message, and a turn that succeeds is stored. The tool list and every
 * tool call are limited to the caller's permissions (admins hold all), and a
 * role's tool output is scrubbed of credentials. A `conversationId` must be
 * one of the caller's open conversations. Each caller may send 60 messages an
 * hour (30 for a role), and every LLM call in the turn is checked against the
 * daily spend caps (`lib/llm/budget.ts`), where a role counts against the
 * member cap rather than the admin one.
 */
export const chatWithAdminBot = permissionAction({
  permission: "assistant:use",
  input: chatInputSchema,
  rateLimit: { name: "llm:assistant:admin", by: "user" },
  fallbackError: NO_ANSWER,
  handler: async ({ message, conversationId, timeZone }, { userId, session }): Promise<ActionResult<ChatReply>> => {
    // A role below admin has its own, lower hourly limit on top of the shared one (so the effective limit is 30 an hour)
    if (!session.user.isAdmin) {
      const limit = await consume("llm:assistant:support", userId)
      if (!limit.ok) return fail("RATE_LIMITED", RATE_LIMITED_MESSAGE, { retryAfterSec: limit.retryAfterSec })
    }
    if (conversationId) {
      const owned = await prisma.chatConversation.findFirst({
        where: { ...openConversationsOf(userId), id: conversationId },
        select: { id: true },
      })
      if (!owned) return fail("NOT_FOUND", GONE)
    }

    const question: ChatMessage = { role: "user", content: message, timestamp: Date.now() }
    const [messages, settings] = await Promise.all([contextFor(conversationId, question), getFormatSettings()])
    const result = await runChatbotForUser({
      userId,
      messages,
      conversationId,
      // Only a real admin gets the admin spend cap and unscrubbed tool output
      isAdmin: session.user.isAdmin,
      permissions: permissionsFor(session.user),
      // The admin assistant works in the caller's browser zone, else the server zone (P11.17)
      format: { ...settings, timeZone: normalizeTimeZone(timeZone) ?? settings.timeZone },
    })
    if (result.refusal === "BUDGET_EXCEEDED") return fail("RATE_LIMITED", result.error ?? "The assistant reached its daily spend limit. Try again tomorrow.")
    if (!result.success || !result.message) {
      return fail("UPSTREAM_UNAVAILABLE", result.error ?? NO_ANSWER)
    }
    // No conversation when AI features are off: the reply says so and nothing is stored
    if (result.conversationId) {
      const stored = await saveTurn({
        conversationId: result.conversationId,
        question: { content: message, at: new Date(question.timestamp) },
        answer: result.message,
        title: conversationId ? undefined : titleFrom(message),
        asAdmin: session.user.isAdmin,
      })
      if (!stored) return fail("NOT_FOUND", GONE)
      // The history lists the conversation first
      refresh()
    }
    return ok({ message: result.message, conversationId: result.conversationId })
  },
})

/**
 * Deletes one of the caller's conversations from their history: it ends, and
 * its title and messages are removed (`lib/chatbot/history.ts`, "Ending a
 * conversation"). The client refreshes or, when it deleted the conversation
 * it shows, leaves its URL; refreshing here would first render that URL as
 * not found.
 */
export const deleteAssistantConversation = permissionAction({
  permission: "assistant:use",
  input: z.strictObject({ conversationId: recordIdSchema }),
  rateLimit: { name: "assistant:history" },
  fallbackError: "Could not delete the conversation",
  handler: async ({ conversationId }, { userId }) => {
    if (!(await endConversation(userId, conversationId))) return fail("NOT_FOUND", "That conversation is already gone")
    return ok(null)
  },
})
