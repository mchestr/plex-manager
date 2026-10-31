/**
 * The size cap on MCP tool results.
 *
 * Every result lands in the model's context. Claude Code warns above 10,000
 * tokens of MCP output, so a result over {@link MAX_RESULT_CHARS} characters
 * (about 10k tokens of JSON) is refused with `RESULT_TOO_LARGE` and advice to
 * ask for less: list tools page, and lookups take a search, filter or limit.
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

/** `result` when it fits `limit`, else a refusal that says how big it was and how to ask for less. */
export function limitResult(result: McpToolResult, limit: number = MAX_RESULT_CHARS): McpToolResult & { tooLarge: boolean } {
  const size = result.text.length
  if (size <= limit) return { ...result, tooLarge: false }
  const tokens = Math.round(size / CHARS_PER_TOKEN / 1000)
  const error =
    `The result is ${size} characters (about ${tokens}k tokens), over this server's ` +
    `${limit}-character limit. Ask for less: a search or filter, a smaller page, pageSize or limit, ` +
    "a narrower date range, or a more specific tool."
  return { text: JSON.stringify({ success: false, code: "RESULT_TOO_LARGE", error }), isError: true, tooLarge: true }
}
