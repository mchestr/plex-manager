/**
 * Which conversations the judge reviews: admin assistant conversations that
 * are still open, meaning no Discord session, no ending and a stored turn.
 * Support-owned assistant conversations are in scope like admin ones; member
 * Discord chats never are. `enqueueReview`, the nightly sweep and the review
 * loaders all filter on this one value.
 *
 * Only the admin assistant's `saveTurn` (`lib/chatbot/history.ts`) sets
 * `lastMessageAt`; the Discord path stamps only its `DiscordChatSession`. So a
 * conversation that never stored a turn is never reviewable, and neither is a
 * Discord conversation that an unlink left open without a session (unlinking
 * ends such conversations now, but older ones may still be open).
 *
 * @module lib/judge/scope
 */

import type { Prisma } from "@/lib/generated/prisma/client"

export const REVIEWABLE_CONVERSATION = {
  endedAt: null,
  discordSessions: { none: {} },
  lastMessageAt: { not: null },
} satisfies Prisma.ChatConversationWhereInput
