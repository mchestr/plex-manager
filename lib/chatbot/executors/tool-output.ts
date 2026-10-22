import "server-only"

import { type ConnectionResult } from "@/types/connection"

/** A connection result as tool output: the data, or `{ error }` with the client's fixed message. */
export function toToolOutput(result: ConnectionResult<unknown>): string {
  return JSON.stringify(result.success ? result.data : { error: result.error })
}
