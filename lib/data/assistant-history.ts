/**
 * The assistant page's reads (`app/admin/assistant`): the caller's own
 * conversations, checked for `assistant:use` next to the data (P11.5). An
 * admin sees only their own history here too; everyone's calls stay on the
 * LLM usage pages.
 *
 * @module lib/data/assistant-history
 */

import "server-only"

import { assertPermission } from "@/lib/admin"
import { openConversationsOf, STORED_MESSAGE_SELECT, toChatMessages } from "@/lib/chatbot/history"
import type { AssistantConversation, AssistantHistoryItem } from "@/lib/chatbot/types"
import { prisma } from "@/lib/prisma"
import { retentionDays } from "@/lib/retention/policy"
import { assistantDisclosure } from "@/lib/ui/privacy-copy"

/** How many conversations the history lists, newest first. @internal */
export const HISTORY_LIMIT = 100

/** How many of a conversation's newest messages the page shows. @internal */
export const TRANSCRIPT_LIMIT = 200

/** A title that no longer decrypts reads as this. */
const UNTITLED = "Untitled conversation"

export interface AssistantPageData {
  /** False while AI features are off or no chat model is active: the history still opens, but nothing can be sent. */
  available: boolean
  /** What admins can see, and who processes the messages (P11.16). */
  disclosure: string
  /** How long admins can still read a deleted conversation's calls on the LLM usage pages. */
  usageTextDays: number
  /** How long a conversation stays in the history after its last message. */
  historyDays: number
  history: AssistantHistoryItem[]
  /** The history reached {@link HISTORY_LIMIT}, so older conversations are not listed. */
  historyCapped: boolean
  /** The open conversation: null for a new one, and for an id that is not one of the caller's open conversations. */
  conversation: AssistantConversation | null
}

/** Everything the assistant page renders, for a new conversation (`null`) or one of the caller's. */
export async function getAssistantPage(conversationId: string | null): Promise<AssistantPageData> {
  const session = await assertPermission("assistant:use")
  const own = openConversationsOf(session.user.id)
  const [config, provider, rows, open] = await Promise.all([
    prisma.config.findUnique({ where: { id: "config" }, select: { llmDisabled: true } }),
    prisma.lLMProvider.findFirst({ where: { isActive: true, purpose: "chat" }, select: { provider: true } }),
    prisma.chatConversation.findMany({
      where: { ...own, lastMessageAt: { not: null } },
      orderBy: { lastMessageAt: "desc" },
      take: HISTORY_LIMIT,
      select: { id: true, title: true, lastMessageAt: true },
    }),
    conversationId
      ? prisma.chatConversation.findFirst({
          where: { ...own, id: conversationId },
          select: {
            id: true,
            title: true,
            messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: TRANSCRIPT_LIMIT, select: STORED_MESSAGE_SELECT },
          },
        })
      : null,
  ])
  const days = retentionDays()

  return {
    available: !config?.llmDisabled && provider !== null,
    disclosure: assistantDisclosure(provider?.provider ?? null),
    usageTextDays: days.assistantLlmText,
    historyDays: days.assistantChats,
    history: rows.map((row) => ({ id: row.id, title: row.title ?? UNTITLED, lastMessageAt: row.lastMessageAt?.getTime() ?? 0 })),
    historyCapped: rows.length === HISTORY_LIMIT,
    conversation: open && {
      id: open.id,
      title: open.title ?? UNTITLED,
      messages: toChatMessages(open.messages.reverse()),
    },
  }
}
