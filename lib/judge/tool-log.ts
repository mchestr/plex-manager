/**
 * The tool log of an assistant turn: each tool call's arguments and result,
 * kept on the answer's `ChatConversationMessage.toolLog` (encrypted) so the
 * conversation judge can check the answer against what the tools returned.
 *
 * ## Capture
 *
 * `runConversationLoop` collects the calls and passes them through
 * {@link capToolLog} before they leave the loop:
 *
 * 1. The tool name (the model chooses it), args and result go through
 *    `redactCredentials` (`lib/mcp/redact.ts`).
 * 2. Only then is anything cut, so a cut only shortens redacted text: the name
 *    to 100 characters, args to 2 KB, each result to 8 KB, and the turn's args
 *    and results together to 32 KB. Calls past the turn's budget keep their
 *    name and `ok` with empty text. Anything cut carries `truncated: true`.
 *
 * Invite codes are not redacted here: the invite tool returns only a code's
 * last four characters. The log never goes on `ChatMessage` or `ChatResponse`,
 * which reach the browser, the MCP chat tool and Discord's session JSON.
 *
 * @module lib/judge/tool-log
 */

import { z } from "zod"

import { redactCredentials } from "@/lib/mcp/redact"

export type ToolLogEntry = { tool: string; args: string; result: string; ok: boolean; truncated?: true }

/** In characters. */
const LIMITS = { tool: 100, args: 2048, result: 8192, turn: 32_768 } as const

const toolLogSchema = z.array(
  z.object({ tool: z.string(), args: z.string(), result: z.string(), ok: z.boolean(), truncated: z.literal(true).optional() })
)

/** Every entry redacted, then cut to the name, args, result and turn limits. */
export function capToolLog(entries: ToolLogEntry[]): ToolLogEntry[] {
  let budget: number = LIMITS.turn
  const cut = (text: string, limit: number) => {
    const kept = text.slice(0, Math.min(limit, budget))
    budget -= kept.length
    return kept
  }
  return entries.map(({ tool, args, result, ok }) => {
    const fullTool = redactCredentials(tool).text
    const fullArgs = redactCredentials(args).text
    const fullResult = redactCredentials(result).text
    const cutTool = fullTool.slice(0, LIMITS.tool)
    const cutArgs = cut(fullArgs, LIMITS.args)
    const cutResult = cut(fullResult, LIMITS.result)
    const truncated = cutTool.length < fullTool.length || cutArgs.length < fullArgs.length || cutResult.length < fullResult.length
    return { tool: cutTool, args: cutArgs, result: cutResult, ok, ...(truncated && { truncated: true as const }) }
  })
}

/** The column's text: `'[]'` for a turn that called no tools, null only when no log was captured. */
export function serializeToolLog(entries?: ToolLogEntry[]): string | null {
  return entries === undefined ? null : JSON.stringify(entries)
}

/**
 * A stored log, or null when it is missing (a turn from before the tool log), no longer decrypts or is not a log.
 *
 * @internal Only the tests read it until the judge's review job does; drop the tag then.
 */
export function parseToolLog(text: string | null): ToolLogEntry[] | null {
  if (text === null) return null
  try {
    const parsed = toolLogSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
