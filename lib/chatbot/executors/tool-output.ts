import "server-only"

import { type ConnectionResult } from "@/types/connection"

/** A connection result as tool output: the data, or `{ error }` with the client's fixed message. */
export function toToolOutput(result: ConnectionResult<unknown>): string {
  return JSON.stringify(result.success ? result.data : { error: result.error })
}

/**
 * A Plex or Tautulli tool's answer for a Discord member whose account is on
 * Jellyfin alone (P11.12): there is no Plex activity of theirs to show, and
 * the model can say so instead of reporting nothing playing.
 */
export const JELLYFIN_MEMBER = { unavailable: "jellyfin-member" } as const
