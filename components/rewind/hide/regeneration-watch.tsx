"use client"

import { useRewindStatus } from "@/hooks/use-rewind-status"

/**
 * Watches the member's Rewind status after a hide or unhide (P7.7):
 * `useRewindStatus` polls while the no-LLM run is queued or running, and
 * refreshes the page when it lands. `HideProvider` mounts it anew after each
 * change; the issue passes it in, so the stage never imports the status action.
 */
export function RegenerationWatch({ year }: { year: number }) {
  useRewindStatus(year)
  return null
}
