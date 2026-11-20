/**
 * The latest step of a member's report in their words, for Your reports on
 * `/report`: what a fix did, who closed it and why, or where it is now.
 * Event data is parsed on read, and data of the wrong shape reads as the
 * plain step.
 *
 * @module lib/member/report-latest
 */

import type { FixAction } from "@/lib/problem-reports/fixes"
import { closedEventDataSchema, fixedEventDataSchema } from "@/lib/validations/problem-reports"

/** What a fix that worked did, in the member's words. */
const FIXED_WORDS: Record<FixAction, string> = {
  SWAP: "A different copy is on the server now",
  BETTER_COPY: "A better copy is on the server now",
  LOOK_FOR_MISSING: "The missing episodes are on the server now",
  FIX_MATCH: "The title and poster are fixed",
  REFRESH: "The details are refreshed",
  REMOVE_AND_SEARCH: "A new copy is on the server now",
}

/** The latest step in the member's words, and why a closed report closed. */
export function latestWords(event: { kind: string; data: unknown } | undefined, own: boolean): { words: string; statusSub: string | null } {
  if (event?.kind === "FIXED") {
    const fixed = fixedEventDataSchema.safeParse(event.data).data
    return { words: fixed?.reason === "fix" && fixed.action ? FIXED_WORDS[fixed.action] : "The server admin fixed it", statusSub: null }
  }
  if (event?.kind === "REOPENED") return { words: own ? "You sent it to the server admin" : "It's with the server admin now", statusSub: null }
  const closed = event?.kind === "CLOSED" ? closedEventDataSchema.safeParse(event.data) : null
  if (closed?.success && closed.data.reason === "admin") return { words: "The server admin closed it", statusSub: "By the server admin" }
  if (closed?.success && closed.data.reason === "no_better_copy") return { words: "We looked, but there's no better copy right now", statusSub: "No better copy right now" }
  if (closed?.success) {
    // A follower didn't cancel it, so say who did without naming them
    return own ? { words: "You cancelled it", statusSub: "Cancelled" } : { words: "The member who reported it cancelled it", statusSub: "By the member who reported it" }
  }
  return { words: own ? "You sent it" : "You're following it", statusSub: null }
}
