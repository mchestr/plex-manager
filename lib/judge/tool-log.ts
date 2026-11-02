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
 *    `redactCredentials` (`lib/mcp/redact.ts`). One whose redaction throws,
 *    such as JSON nested too deep for its walk (a `RangeError`), is stored
 *    empty and named in the entry's `withheld` list, so the turn still
 *    answers. It is never stored as its text, nor as words standing in for
 *    it, which a tool or the model could return too: the list is a field of
 *    the entry, outside any text, and the judge's prompt writes its own note
 *    in place of each field it names (`NOTES.withheld`, `lib/judge/fence.ts`).
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

/** An entry's text fields, in the order it holds them. */
const FIELDS = ["tool", "args", "result"] as const

export type ToolLogField = (typeof FIELDS)[number]

export type ToolLogEntry = {
  tool: string
  args: string
  result: string
  ok: boolean
  truncated?: true
  /** The fields capture could not check for credentials, each stored empty; see "Capture" in the module comment. */
  withheld?: ToolLogField[]
}

/** In characters. */
const LIMITS = { tool: 100, args: 2048, result: 8192, turn: 32_768 } as const

const toolLogSchema = z.array(
  z.object({
    tool: z.string(),
    args: z.string(),
    result: z.string(),
    ok: z.boolean(),
    truncated: z.literal(true).optional(),
    withheld: z.array(z.enum(FIELDS)).optional(),
  })
)

/** The text with its credentials redacted, or null when redacting it throws. */
function redacted(text: string): string | null {
  try {
    return redactCredentials(text).text
  } catch {
    return null
  }
}

/** Every entry redacted, then cut to the name, args, result and turn limits. It never throws: a field whose redaction throws is stored empty and listed in `withheld`. */
export function capToolLog(entries: ToolLogEntry[]): ToolLogEntry[] {
  let budget: number = LIMITS.turn
  const cut = (text: string, limit: number) => {
    const kept = text.slice(0, Math.min(limit, budget))
    budget -= kept.length
    return kept
  }
  return entries.map(({ tool, args, result, ok }) => {
    const full = { tool: redacted(tool), args: redacted(args), result: redacted(result) }
    const withheld = FIELDS.filter((field) => full[field] === null)
    const fullTool = full.tool ?? ""
    const fullArgs = full.args ?? ""
    const fullResult = full.result ?? ""
    const cutTool = fullTool.slice(0, LIMITS.tool)
    const cutArgs = cut(fullArgs, LIMITS.args)
    const cutResult = cut(fullResult, LIMITS.result)
    const truncated = cutTool.length < fullTool.length || cutArgs.length < fullArgs.length || cutResult.length < fullResult.length
    return { tool: cutTool, args: cutArgs, result: cutResult, ok, ...(truncated && { truncated: true as const }), ...(withheld.length > 0 && { withheld }) }
  })
}

/** The column's text: `'[]'` for a turn that called no tools, null only when no log was captured. */
export function serializeToolLog(entries?: ToolLogEntry[]): string | null {
  return entries === undefined ? null : JSON.stringify(entries)
}

/** A stored log, or null when it is missing (a turn from before the tool log), no longer decrypts or is not a log. */
export function parseToolLog(text: string | null): ToolLogEntry[] | null {
  if (text === null) return null
  try {
    const parsed = toolLogSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
