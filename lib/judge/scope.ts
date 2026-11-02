/**
 * Which conversations the judge reviews: admin assistant conversations that
 * are still open, meaning no Discord session and no ending. Support-owned
 * assistant conversations are in scope like admin ones; member Discord chats
 * never are. `enqueueReview`, the nightly sweep and the review loaders all
 * filter on this one value.
 *
 * @module lib/judge/scope
 */

import type { Prisma } from "@/lib/generated/prisma/client"

export const REVIEWABLE_CONVERSATION = { endedAt: null, discordSessions: { none: {} } } satisfies Prisma.ChatConversationWhereInput
