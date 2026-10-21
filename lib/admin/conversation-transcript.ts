/**
 * A chat conversation's stored prompt as transcript messages (P10.6), for the
 * admin conversation page. Pure.
 *
 * A prompt that is a JSON array of `{ role, content, name? }` messages becomes
 * one entry each; a message whose content is JSON (tool output, usually) is
 * pretty-printed and marked `json`, so it renders as code, not Markdown.
 * Anything else returns null and the page shows the raw prompt.
 *
 * @module lib/admin/conversation-transcript
 */

import { z } from "zod"

export interface TranscriptMessage {
  /** "User", "Assistant", "Tool (search)" */
  speaker: string
  content: string
  json: boolean
}

const messageSchema = z.object({ role: z.string().optional(), content: z.unknown(), name: z.string().optional() })

function pretty(text: string): string | null {
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === "object" && value !== null ? JSON.stringify(value, null, 2) : null
  } catch {
    return null
  }
}

function speakerOf(role: string | undefined, name: string | undefined): string {
  const word = role ? role.charAt(0).toUpperCase() + role.slice(1) : "Unknown"
  return name ? `${word} (${name})` : word
}

/** The messages, or null when the prompt is not a chat message array. */
export function parseTranscript(prompt: string): TranscriptMessage[] | null {
  let value: unknown
  try {
    value = JSON.parse(prompt)
  } catch {
    return null
  }
  const parsed = z.array(messageSchema).min(1).safeParse(value)
  if (!parsed.success) return null

  return parsed.data.map((message) => {
    const speaker = speakerOf(message.role, message.name)
    if (typeof message.content === "string") {
      const json = pretty(message.content)
      return json ? { speaker, content: json, json: true } : { speaker, content: message.content, json: false }
    }
    return { speaker, content: JSON.stringify(message.content ?? null, null, 2), json: true }
  })
}
