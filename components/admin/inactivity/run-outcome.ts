import type { InactivityRunRow } from "@/lib/data/inactivity"
import { inactivityBlockLabel } from "@/lib/inactivity/blocks"

/** "1 member", "3 members". */
export function memberCount(count: number): string {
  return `${count} ${count === 1 ? "member" : "members"}`
}

/**
 * What a run came to, in a few words: why it removed no one or stopped, or
 * how many of the inactive members it removed. A run with no finish time is
 * still going, or was cut off before it could store its counts.
 */
export function runOutcome(run: Pick<InactivityRunRow, "finishedAt" | "blocked" | "qualified" | "removed">): string {
  if (!run.finishedAt) return "Not finished"
  if (run.blocked) return inactivityBlockLabel(run.blocked)
  if (run.qualified === 0) return "No inactive members"
  return `Removed ${run.removed} of ${memberCount(run.qualified)}`
}
