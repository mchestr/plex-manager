"use server"

import { z } from "zod"

import { permissionAction } from "@/lib/actions/define-action"
import { fail, ok, type ActionResult } from "@/lib/actions/result"
import { permissionsFor } from "@/lib/permissions"
import { consume } from "@/lib/security/rate-limit"
import { runChatbotForUser } from "@/lib/chatbot/assistant"
import { prisma } from "@/lib/prisma"
import { RATE_LIMITED_MESSAGE } from "@/lib/security/rate-limit-messages"
import { getFormatSettings } from "@/lib/settings/app-settings"
import { recordIdSchema } from "@/lib/validations/params"

import { type ChatMessage } from "@/lib/chatbot/types"

/** Bounds on the history a client sends (SEC-42): only its own user and assistant turns. */
const MAX_MESSAGES = 40
const MAX_MESSAGE_CHARS = 8000
const MAX_TOTAL_CHARS = 60_000

const chatInputSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(MAX_MESSAGE_CHARS),
      })
    )
    .min(1)
    .max(MAX_MESSAGES)
    .refine((messages) => messages.at(-1)?.role === "user", "The last message must be from you")
    .refine(
      (messages) => messages.reduce((total, m) => total + m.content.length, 0) <= MAX_TOTAL_CHARS,
      "The conversation is too long. Start a new one."
    ),
  conversationId: recordIdSchema.optional(),
})

interface ChatReply {
  message: ChatMessage
  conversationId?: string
}

/**
 * One assistant turn, for an admin or a role holding `assistant:use`. The tool
 * list and every tool call are limited to the caller's permissions (admins
 * hold all), and a role's tool output is scrubbed of credentials. A
 * `conversationId` must be one of the caller's own conversations. Each caller
 * may send 60 messages an hour (30 for a role), and every LLM call in the turn
 * is checked against the daily spend caps (`lib/llm/budget.ts`), where a role
 * counts against the member cap rather than the admin one.
 */
export const chatWithAdminBot = permissionAction({
  permission: "assistant:use",
  input: chatInputSchema,
  rateLimit: { name: "llm:assistant:admin", by: "user" },
  fallbackError: "Failed to process message",
  handler: async ({ messages, conversationId }, { userId, session }): Promise<ActionResult<ChatReply>> => {
    // A role below admin has its own, lower hourly limit on top of the shared one (so the effective limit is 30 an hour)
    if (!session.user.isAdmin) {
      const limit = await consume("llm:assistant:support", userId)
      if (!limit.ok) return fail("RATE_LIMITED", RATE_LIMITED_MESSAGE, { retryAfterSec: limit.retryAfterSec })
    }
    if (conversationId) {
      const owned = await prisma.chatConversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true },
      })
      if (!owned) return fail("NOT_FOUND", "That conversation no longer exists. Start a new one.")
    }

    const result = await runChatbotForUser({
      userId,
      messages: messages.map((m) => ({ ...m, timestamp: Date.now() })),
      conversationId,
      // Only a real admin gets the admin spend cap and unscrubbed tool output
      isAdmin: session.user.isAdmin,
      permissions: permissionsFor(session.user),
      // The admin assistant works in the server zone (P11.17)
      format: await getFormatSettings(),
    })
    if (result.refusal === "BUDGET_EXCEEDED") return fail("RATE_LIMITED", result.error ?? "Daily budget reached")
    if (!result.success || !result.message) {
      return fail("UPSTREAM_UNAVAILABLE", result.error ?? "Failed to process message")
    }
    return ok({ message: result.message, conversationId: result.conversationId })
  },
})
