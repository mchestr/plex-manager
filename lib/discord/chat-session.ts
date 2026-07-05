/**
 * Concurrency-safe persistence for Discord chat sessions.
 *
 * ## Overview
 *
 * A Discord user can fire several messages in the same channel in quick
 * succession. Because handling a message involves a slow LLM round-trip, two
 * handlers can easily overlap. Two classes of race exist against the
 * `DiscordChatSession` row (keyed by the `@@unique([discordUserId,
 * discordChannelId])` tuple):
 *
 * 1. **Duplicate conversations on (re)start.** A naive "read → decide expiry →
 *    create ChatConversation → upsert session" sequence lets both handlers
 *    observe "expired", both create a `ChatConversation`, and both upsert —
 *    leaking a `ChatConversation` row.
 * 2. **Clobbered turns.** Appending `[...history, user, assistant]` where
 *    `history` was read *before* the LLM call means a concurrently-persisted
 *    turn (written during the LLM call) is silently overwritten — last write
 *    wins on the whole JSON blob.
 *
 * Both are fixed by doing the read-modify-write inside a Serializable
 * `$transaction` that re-reads the current row, with bounded retry on
 * serialization conflicts (Prisma `P2034`). See {@link getOrCreateSession} and
 * {@link appendTurn}.
 */

import { type ChatMessage } from "@/actions/chatbot/types"
import { coerceHistory, trimHistory } from "@/lib/discord/chat-history"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { Prisma } from "@/lib/generated/prisma/client"

const logger = createLogger("DISCORD_CHAT_SESSION")

/** How long a session may sit idle before the next message starts fresh. */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

/** Serializable transactions can abort under contention; retry a few times. */
const MAX_TRANSACTION_RETRIES = 3
const INITIAL_RETRY_DELAY_MS = 50
const TRANSACTION_TIMEOUT_MS = 10_000

/** The resolved session state callers need after {@link getOrCreateSession}. */
export interface ResolvedSession {
  id: string
  chatConversationId: string
  /** Coerced, trimmed history for the (possibly freshly reset) session. */
  history: ChatMessage[]
}

/** True for a Prisma serialization-conflict error (transaction should retry). */
function isTransactionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Run `fn`, retrying with exponential backoff on serialization conflicts. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_TRANSACTION_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isTransactionConflict(error) || attempt >= MAX_TRANSACTION_RETRIES) {
        throw error
      }
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5)
      logger.warn("Session transaction conflict, retrying", {
        attempt: attempt + 1,
        maxRetries: MAX_TRANSACTION_RETRIES,
        delayMs: Math.round(delay),
      })
      await sleep(delay)
    }
  }
  throw lastError
}

function isExpired(
  session: { isActive: boolean; lastMessageAt: Date } | null,
  now: number
): boolean {
  return (
    !session ||
    !session.isActive ||
    Math.abs(now - session.lastMessageAt.getTime()) > SESSION_IDLE_TIMEOUT_MS
  )
}

/**
 * Atomically resolve (creating or resetting on idle-expiry) the chat session for
 * a `(discordUserId, channelId)` pair.
 *
 * ## Concurrency
 *
 * The entire read → expiry-decision → conversation-create → session-write runs
 * inside a Serializable `$transaction`, re-reading the session row *inside* the
 * transaction. Combined with the `@@unique([discordUserId, discordChannelId])`
 * constraint and conflict retry, two concurrent callers cannot both create a
 * `ChatConversation`: the second either serializes after the first (and sees a
 * live session, creating nothing) or aborts and retries.
 *
 * @param params.discordUserId - Discord user snowflake.
 * @param params.channelId - Discord channel id.
 * @param params.userId - Owning app user id (for a new `ChatConversation`).
 * @returns The resolved session id, conversation id, and coerced/trimmed history.
 */
export async function getOrCreateSession({
  discordUserId,
  channelId,
  userId,
}: {
  discordUserId: string
  channelId: string
  userId: string
}): Promise<ResolvedSession> {
  const sessionKey = { discordUserId, discordChannelId: channelId }

  return withRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const now = Date.now()
        const existing = await tx.discordChatSession.findUnique({
          where: { discordUserId_discordChannelId: sessionKey },
        })

        if (!isExpired(existing, now) && existing) {
          return {
            id: existing.id,
            chatConversationId: existing.chatConversationId,
            history: trimHistory(coerceHistory(existing.messages)),
          }
        }

        // Expired or missing: start a brand-new conversation and (re)set the row.
        const conversation = await tx.chatConversation.create({
          data: { userId },
        })

        const session = await tx.discordChatSession.upsert({
          where: { discordUserId_discordChannelId: sessionKey },
          update: {
            chatConversationId: conversation.id,
            messages: [],
            isActive: true,
            lastMessageAt: new Date(now),
          },
          create: {
            discordUserId,
            discordChannelId: channelId,
            chatConversationId: conversation.id,
            messages: [],
          },
        })

        return {
          id: session.id,
          chatConversationId: session.chatConversationId,
          history: [],
        }
      },
      {
        timeout: TRANSACTION_TIMEOUT_MS,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    )
  )
}

/**
 * Append a user turn and its assistant reply to a session's history without
 * clobbering turns persisted concurrently.
 *
 * ## Concurrency
 *
 * The history is re-read from the row *inside* a Serializable `$transaction`
 * (rather than reusing the snapshot the caller read before the LLM call), the
 * two new turns are appended to that fresh copy, and the result is trimmed. A
 * concurrent turn committed during the LLM call is therefore preserved instead
 * of being overwritten.
 *
 * @param params.sessionId - The `DiscordChatSession.id` to update.
 * @param params.userMessage - The user's message for this turn.
 * @param params.assistantMessage - The assistant's (sanitized) reply.
 * @param params.chatConversationId - Conversation id to persist (from the LLM
 *   response, falling back to the session's existing id).
 */
export async function appendTurn({
  sessionId,
  userMessage,
  assistantMessage,
  chatConversationId,
}: {
  sessionId: string
  userMessage: ChatMessage
  assistantMessage: ChatMessage
  chatConversationId: string
}): Promise<void> {
  await withRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const current = await tx.discordChatSession.findUnique({
          where: { id: sessionId },
          select: { messages: true },
        })

        // Re-read the latest history so concurrently-appended turns survive.
        const latest = current ? coerceHistory(current.messages) : []
        const updatedHistory = trimHistory([...latest, userMessage, assistantMessage])

        await tx.discordChatSession.update({
          where: { id: sessionId },
          data: {
            messages: updatedHistory as unknown as Prisma.JsonArray,
            lastMessageAt: new Date(),
            isActive: true,
            chatConversationId,
          },
        })
      },
      {
        timeout: TRANSACTION_TIMEOUT_MS,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    )
  )
}
