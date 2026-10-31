import type { Session } from "next-auth"

/** What a tool call hands back: MCP `content` text, and whether it failed. */
export interface McpToolResult {
  text: string
  isError: boolean
}

/**
 * One tool the MCP endpoint offers. `allowed` decides whether the caller sees
 * it; the action guard, loader or assistant executor behind `run` checks again.
 */
export interface McpTool {
  name: string
  description: string
  /** JSON Schema of the arguments, always `type: "object"`. */
  inputSchema: Record<string, unknown>
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean }
  /**
   * The most characters the result may have, for a tool whose result is one
   * record that cannot be split. Others keep `MAX_RESULT_CHARS` (`lib/mcp/result-limit.ts`).
   */
  maxResultChars?: number
  /** Where the tool comes from, for the audit entry. */
  source: "action" | "loader" | "assistant"
  allowed: (session: Session) => boolean
  run: (args: Record<string, unknown>, session: Session) => Promise<McpToolResult>
}
