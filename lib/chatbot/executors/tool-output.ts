import "server-only"

import { type ConnectionResult } from "@/types/connection"

/** A connection result as tool output: the data, or `{ error }` with the client's fixed message. */
export function toToolOutput(result: ConnectionResult<unknown>): string {
  return JSON.stringify(result.success ? result.data : { error: result.error })
}

/**
 * True when an executor's output is an error: an `"Error..."` string, or JSON
 * with a non-null top-level `error` or `success: false`. The dispatcher hides
 * such output from Discord and scoped roles, and the MCP endpoint marks it
 * `isError`.
 */
export function isToolError(output: string): boolean {
  if (output.startsWith("Error")) return true
  try {
    const parsed: unknown = JSON.parse(output)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false
    const { error, success } = parsed as { error?: unknown; success?: unknown }
    return (error !== undefined && error !== null) || success === false
  } catch {
    return false
  }
}
