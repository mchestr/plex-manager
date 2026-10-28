/**
 * The admin assistant's stored conversations: each turn's question and answer,
 * read back as the model's context and as the assistant page's history.
 *
 * ## Overview
 *
 * The browser sends only the new message. The turns before it are read here,
 * so a client cannot write the assistant's side of a conversation (SEC-42). A
 * turn is stored once it succeeds, question and answer together and after any
 * turn stored while it ran (another tab), so a stored conversation alternates
 * and ends with an answer.
 *
 * ## Ending a conversation
 *
 * Deleting a conversation, leaving it idle past its retention window, or
 * demoting the admin it belongs to ends it rather than removing the row: the
 * title and messages go, while its
 * `LLMUsage` rows keep their link. The day's spend caps (`lib/llm/budget.ts`)
 * count only rows with a conversation, so a removed row would hand back the
 * day's spend; and the LLM usage pages keep showing the calls until their own
 * window clears the text. The `chatConversations` retention rule deletes the
 * ended row later.
 *
 * @module lib/chatbot/history
 */

import "server-only"

import { z } from "zod"

import type { ChatMessage } from "@/lib/chatbot/types"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"

/** What the model sees of a conversation: its newest 40 messages and 60,000 characters at most (SEC-42). @internal */
export const CONTEXT_LIMITS = { messages: 40, chars: 60_000 } as const

const TITLE_CHARS = 80

/**
 * The caller's conversations on the assistant page: theirs, not ended, and
 * not a Discord chat, which keeps its turns on its session instead.
 */
export function openConversationsOf(userId: string): Prisma.ChatConversationWhereInput {
  return { userId, endedAt: null, discordSessions: { none: {} } }
}

// `content` reads as null when it no longer decrypts (lib/db/encryption-extension.ts); such a row is skipped
const storedMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  sources: z.array(z.object({ tool: z.string(), description: z.string() })).nullish().catch(null),
  createdAt: z.date(),
})

/** The columns {@link toChatMessages} reads. */
export const STORED_MESSAGE_SELECT = { role: true, content: true, sources: true, createdAt: true } as const

/** Stored rows as transcript messages, in the rows' order. */
export function toChatMessages(rows: unknown[]): ChatMessage[] {
  return rows.flatMap((row) => {
    const parsed = storedMessageSchema.safeParse(row)
    if (!parsed.success) return []
    const { role, content, sources, createdAt } = parsed.data
    return [{ role, content, timestamp: createdAt.getTime(), ...(sources?.length ? { sources } : {}) }]
  })
}

/**
 * The messages the model sees for a new question: the newest stored messages
 * that fit {@link CONTEXT_LIMITS} beside it, then the question. The window
 * starts with a question, never an answer whose question it cut off.
 */
export async function contextFor(conversationId: string | undefined, question: ChatMessage): Promise<ChatMessage[]> {
  const rows = conversationId
    ? await prisma.chatConversationMessage.findMany({
        where: { conversationId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: CONTEXT_LIMITS.messages - 1,
        select: STORED_MESSAGE_SELECT,
      })
    : []
  const context = [question]
  let chars = question.content.length
  for (const message of toChatMessages(rows)) {
    if (chars + message.content.length > CONTEXT_LIMITS.chars) break
    chars += message.content.length
    context.unshift(message)
  }
  while (context[0].role !== "user") context.shift()
  return context
}

/**
 * A conversation's title from its first question: whitespace collapsed and,
 * past 80 characters, cut at a word with an ellipsis.
 *
 * @example
 * ```ts
 * titleFrom("  Why is   Plex buffering?\n") // "Why is Plex buffering?"
 * ```
 */
export function titleFrom(question: string): string {
  const text = question.replace(/\s+/g, " ").trim()
  if (text.length <= TITLE_CHARS) return text
  const cut = text.slice(0, TITLE_CHARS - 1)
  const space = cut.lastIndexOf(" ")
  return `${space > TITLE_CHARS / 2 ? cut.slice(0, space) : cut}…`
}

interface Turn {
  conversationId: string
  question: { content: string; at: Date }
  answer: ChatMessage
  /** A first turn's title. */
  title?: string
  /**
   * The turn ran with an admin's access, so it is stored only while its user
   * is still an admin: a session keeps admin access for up to five minutes
   * after a demotion, and the role they keep must not read what it produced.
   */
  asAdmin?: boolean
}

/**
 * Stores a turn that succeeded, and moves its conversation to the top of the
 * history. False, storing nothing, when the conversation was deleted while
 * the answer was being written, or an admin's turn outlived their admin role.
 */
export async function saveTurn({ conversationId, question, answer, title, asAdmin }: Turn): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // The update locks the row, so a turn another tab stores at the same time waits for this one, or this one for
    // it, and a demotion's ending of the conversation (endConversationsOf) waits for the turn or sees it as gone
    const { count } = await tx.chatConversation.updateMany({
      where: { id: conversationId, endedAt: null, ...(asAdmin ? { user: { isAdmin: true } } : {}) },
      data: { lastMessageAt: new Date(answer.timestamp), ...(title ? { title } : {}) },
    })
    if (count === 0) return false
    // After the newest stored message, so a question asked before another tab's answer still sits beside its own
    const latest = await tx.chatConversationMessage.findFirst({
      where: { conversationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { createdAt: true },
    })
    const askedAt = Math.max(question.at.getTime(), (latest?.createdAt.getTime() ?? 0) + 1)
    const answeredAt = Math.max(answer.timestamp, askedAt + 1)
    await tx.chatConversationMessage.createMany({
      data: [
        { conversationId, role: "user", content: question.content, createdAt: new Date(askedAt) },
        { conversationId, role: "assistant", content: answer.content, sources: answer.sources, createdAt: new Date(answeredAt) },
      ],
    })
    return true
  })
}

/**
 * Ends one of the caller's conversations and removes its history, the title
 * and every message. False when it is not theirs or has already ended.
 */
export async function endConversation(userId: string, conversationId: string, now: Date = new Date()): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // The update locks the row first, so a turn being stored either lands before the delete below or not at all
    const { count } = await tx.chatConversation.updateMany({
      where: { id: conversationId, ...openConversationsOf(userId) },
      data: { endedAt: now, title: null },
    })
    if (count === 0) return false
    await tx.chatConversationMessage.deleteMany({ where: { conversationId } })
    return true
  })
}

/**
 * Ends every one of a user's conversations the same way, in the demotion's
 * transaction: a role never reads answers built from tool output only an
 * admin may see.
 */
export async function endConversationsOf(tx: PrismaTransactionClient, userId: string, now: Date = new Date()): Promise<number> {
  const { count } = await tx.chatConversation.updateMany({ where: openConversationsOf(userId), data: { endedAt: now, title: null } })
  await tx.chatConversationMessage.deleteMany({ where: { conversation: { userId, endedAt: { not: null } } } })
  return count
}
