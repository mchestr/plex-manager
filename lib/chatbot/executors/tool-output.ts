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

/**
 * A Plex or Tautulli tool's answer for a Discord member whose account is on
 * Jellyfin alone (P11.12): there is no Plex activity of theirs to show, and
 * the model can say so instead of reporting nothing playing.
 */
export const JELLYFIN_MEMBER = { unavailable: "jellyfin-member" } as const
