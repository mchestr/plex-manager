/**
 * The words of the Keep controls and the Kept and excluded tab (UX 8.6, 8.7,
 * 8.9, 9.2, 9.4). Pure and client-safe.
 *
 * A failed Keep, Undo or End keep shows the words of its code. The codes
 * whose words a member can act on keep them: the title is being deleted,
 * it left Leaving soon, the Keep limit, plex.tv did not answer, too many
 * tries. Any other failure shows `CONFIRM_FALLBACK_ERROR` (UX 7.12).
 *
 * @module lib/cleanup/actions/keeps/words
 */

import { CLEANUP_ERRORS, CLEANUP_UPSTREAM_WORDS, keepLimitWords } from "@/lib/cleanup/constants"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** `CONFIRM_FALLBACK_ERROR` of `components/ui/confirm-dialog.tsx`, which a pure module cannot import. */
export const FALLBACK_ERROR = "That didn't work. Try again."

/** The member toasts of UX 8.9. */
export const KEEP_TOASTS = { ended: "Keep ended", undone: "Keep undone" } as const

/** The words of a failed Keep, Undo or End keep, by its code (UX 7.12, 8.9). */
export function keepErrorWords(failure: { code: string; error: string }, limit: number): string {
  switch (failure.code) {
    case "CLEANUP_DELETING":
      return CLEANUP_ERRORS.CLEANUP_DELETING
    case "CLEANUP_NOT_LEAVING":
      return CLEANUP_ERRORS.CLEANUP_NOT_LEAVING
    case "CLEANUP_KEEP_LIMIT":
      return keepLimitWords(limit)
    case "UPSTREAM_UNAVAILABLE":
      return CLEANUP_UPSTREAM_WORDS.plex
    case "RATE_LIMITED":
      return failure.error
    default:
      return FALLBACK_ERROR
  }
}

/** The member's End keep dialog (UX 8.6). Without the shortest grace period, "a full grace period" (UX 9.2.2). */
export function endKeepWords(title: string, graceDays?: number) {
  const later = graceDays ? `a new leave date at least ${graceDays} ${graceDays === 1 ? "day" : "days"} away` : "a full grace period"
  return {
    title: `End your Keep on ${title}?`,
    description: `It can come back to Leaving soon after the next nightly check, with ${later}.`,
  }
}

/** A title as a screen names it: "Supernatural, Season 4" for a season. */
export function titleName(item: { title: string; level: Level; seasonNumber: number | null }): string {
  return item.level === "season" && item.seasonNumber !== null ? `${item.title}, Season ${item.seasonNumber}` : item.title
}

/**
 * The type line under a title in a table: "Movie", "Whole show" or "Season 9"
 * (shot 08). Members read "Show", as on their pages (shot 13).
 */
export function typeLine(item: { level: Level; seasonNumber: number | null }, audience: "admin" | "member" = "admin"): string {
  if (item.level === "movie") return "Movie"
  if (item.level === "show") return audience === "admin" ? "Whole show" : "Show"
  return item.seasonNumber === null ? "Season" : `Season ${item.seasonNumber}`
}

/**
 * The last day that a protection protects, as an instant to format: an end
 * at midnight belongs to the day before it (an exclusion ends at the end of
 * its day, `dayEndsAt`).
 */
export function lastDay(until: string): Date {
  return new Date(Date.parse(until) - 1)
}
