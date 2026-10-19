"use server"

import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok, type ActionResult } from "@/lib/actions/result"
import { runChatbotForUser } from "@/lib/chatbot/assistant"
import { prisma } from "@/lib/prisma"
import { recordIdSchema } from "@/lib/validations/params"

import { type ChatMessage } from "./types"

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
 * One admin assistant turn. Admin-only: the default tool set reads every
 * member's data and spends the admin LLM budget. A `conversationId` must be
 * one of the caller's own conversations. Each admin may send 60 messages an
 * hour, and every LLM call in the turn is checked against the daily spend
 * caps (`lib/llm/budget.ts`).
 */
export const chatWithAdminBot = adminAction({
  input: chatInputSchema,
  rateLimit: { name: "llm:assistant:admin", by: "user" },
  fallbackError: "Failed to process message",
  handler: async ({ messages, conversationId }, { userId }): Promise<ActionResult<ChatReply>> => {
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
      isAdmin: true,
    })
    if (result.refusal === "BUDGET_EXCEEDED") return fail("RATE_LIMITED", result.error ?? "Daily budget reached")
    if (!result.success || !result.message) {
      return fail("UPSTREAM_UNAVAILABLE", result.error ?? "Failed to process message")
    }
    return ok({ message: result.message, conversationId: result.conversationId })
  },
})
