/**
 * The size cap on MCP tool results.
 *
 * Every result lands in the model's context. Claude Code warns above 10,000
 * tokens of MCP output, so a read's result over {@link MAX_RESULT_CHARS}
 * characters (about 10k tokens of JSON) is refused with `RESULT_TOO_LARGE` and
 * advice to ask for less: list tools page, and lookups take a search, filter
 * or limit.
 *
 * A tool that changes something has already done it by the time its result is
 * measured, so its oversized result is not an error: the reply keeps the
 * call's success or failure, leaves the result out and says to read the new
 * state, so a client never retries a change that happened.
 *
 * A tool whose result is one record that cannot be split (a member's whole
 * Rewind) declares a larger `maxResultChars` instead.
 *
 * @module lib/mcp/result-limit
 */

import type { McpToolResult } from "@/lib/mcp/types"

/** The most characters a tool result may have, unless the tool declares more. */
export const MAX_RESULT_CHARS = 40_000

/** JSON averages about 3.5 characters a token. */
const CHARS_PER_TOKEN = 3.5

interface LimitOptions {
  /** Whether the tool only reads; see the module notes for a tool that changes something. */
  readOnly: boolean
  limit?: number
}

/**
 * `result` when it fits the limit. Over it, a read is refused with how big it
 * was and how to ask for less; a change keeps its outcome without its result.
 */
export function limitResult(result: McpToolResult, { readOnly, limit = MAX_RESULT_CHARS }: LimitOptions): McpToolResult & { tooLarge: boolean } {
  const size = result.text.length
  if (size <= limit) return { ...result, tooLarge: false }
  const over = `${size} characters (about ${Math.round(size / CHARS_PER_TOKEN / 1000)}k tokens), over this server's ${limit}-character limit`
  if (!readOnly) {
    const note =
      `The tool ran${result.isError ? " and failed" : ""}, but its result was ${over}, so it is left out. ` +
      "Read the new state with a list_* or get_* tool."
    return { text: JSON.stringify({ success: !result.isError, resultOmitted: true, note }), isError: result.isError, tooLarge: true }
  }
  const error = `The result is ${over}. Ask for less: a search or filter, a smaller page, pageSize or limit, a narrower date range, or a more specific tool.`
  return { text: JSON.stringify({ success: false, code: "RESULT_TOO_LARGE", error }), isError: true, tooLarge: true }
}
