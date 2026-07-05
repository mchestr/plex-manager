/**
 * Pure, side-effect-free helpers for Discord chat history stored on
 * `DiscordChatSession.messages` (a JSON column).
 *
 * ## Overview
 *
 * The `messages` column is untyped JSON, so anything read back from it must be
 * defensively validated before it is trusted as a {@link ChatMessage}. These
 * helpers do exactly that — and nothing else. They perform no I/O, which makes
 * them trivially unit-testable and safe to call inside a transaction.
 */

import { type ChatMessage } from "@/actions/chatbot/types"
import { Prisma } from "@/lib/generated/prisma/client"

/**
 * Maximum number of turns retained on a session. Older entries are dropped by
 * {@link trimHistory} so the JSON blob (and the prompt fed to the LLM) stays
 * bounded.
 */
export const HISTORY_LIMIT = 12

/**
 * Coerce an untrusted JSON value from the database into a validated array of
 * {@link ChatMessage}.
 *
 * ## Validation rules
 *
 * - Non-array input (including `null`/`undefined`) yields `[]`.
 * - Entries that are not objects are dropped.
 * - Entries whose `role` is not exactly `"user"` or `"assistant"` are dropped
 *   (note: `"system"` is intentionally not accepted here).
 * - Entries whose `content` is not a string are dropped.
 * - A non-numeric `timestamp` is replaced with `Date.now()`.
 * - `sources` is preserved only when it is an array; otherwise it is `undefined`.
 *
 * @param value - Raw JSON read from `DiscordChatSession.messages`.
 * @returns A validated (and possibly empty) list of chat messages.
 */
export function coerceHistory(value: Prisma.JsonValue | null | undefined): ChatMessage[] {
  if (!Array.isArray(value)) {
    return []
  }

  const result: ChatMessage[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue
    }
    const record = entry as Record<string, unknown>
    if (record.role !== "user" && record.role !== "assistant") {
      continue
    }
    if (typeof record.content !== "string") {
      continue
    }
    result.push({
      role: record.role,
      content: record.content,
      timestamp: typeof record.timestamp === "number" ? record.timestamp : Date.now(),
      sources: Array.isArray(record.sources)
        ? (record.sources as Array<{ tool: string; description: string }>)
        : undefined,
    })
  }
  return result
}

/**
 * Trim a history list to at most {@link HISTORY_LIMIT} entries, keeping the most
 * recent ones. Lists at or below the limit are returned unchanged.
 *
 * @param messages - The full (already-coerced) history.
 * @returns The trimmed history (the tail of the input).
 */
export function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= HISTORY_LIMIT) {
    return messages
  }

  return messages.slice(messages.length - HISTORY_LIMIT)
}
