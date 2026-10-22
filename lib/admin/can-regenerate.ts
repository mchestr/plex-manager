/**
 * Whether an admin may regenerate a member's Rewind for a year (UI-29), on the
 * user detail page, the users list menu and the Overview. Pure, so client
 * menus can call it.
 *
 * True for a failed, completed or missing row. A generating row is eligible
 * only once its run has been going for more than 15 minutes, P2.5's stale rule
 * (the same window as `STUCK_AFTER_MS` in `lib/wrapped/admin/season.ts`), so a
 * stuck run can be retried without starting a second live one.
 *
 * @module lib/admin/can-regenerate
 */

export const REGENERATE_STALE_AFTER_MS = 15 * 60 * 1000

export interface RegenerateRow {
  /** `PlexWrapped.status` for the year, or null when there is no row. */
  status: string | null
  /** When the active run started (or was queued), or null when none is known. */
  runStartedAt: Date | string | null
}

export function canRegenerate(row: RegenerateRow, now: number): boolean {
  if (row.status !== "generating") return true
  if (row.runStartedAt === null) return false
  return now - new Date(row.runStartedAt).getTime() > REGENERATE_STALE_AFTER_MS
}
