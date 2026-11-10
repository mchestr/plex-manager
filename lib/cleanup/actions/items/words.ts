/**
 * The words around the item actions (UX 8.6, 8.9): the toasts after an
 * approval, a Postpone and an Exclude, and the new leave date line of the
 * Postpone dialog. Pure and client-safe.
 *
 * @module lib/cleanup/actions/items/words
 */

import { plural } from "@/lib/cleanup/action-words"
import { NOUNS } from "@/lib/cleanup/fields/words"
import type { ExcludeCleanupItemsResult, PostponeCleanupItemsResult } from "@/lib/cleanup/types/actions"
import { addDays } from "@/lib/ui/date-range"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** "Select at least one title": an approval or a batch form with nothing left (TS 10.3 step 4, UX 8.7). */
export const SELECT_ONE = "Select at least one title"

/** A toast: its words, and whether it is an error toast. */
export interface ToastWords {
  text: string
  error: boolean
}

/** The toast after an approval: the deletions start now, or at the nightly run when the queue did not take the act step. */
export const approvedToast = (actQueued: boolean): string =>
  actQueued ? "Batch approved. Deletions start now." : "Batch approved. The deletions start at the next nightly run."

const skippedWords = (skipped: number) => (skipped === 1 ? " 1 is being deleted and was skipped." : ` ${skipped} are being deleted and were skipped.`)

/** Nothing done: every title is being deleted. `selected` is the count the dialog named. */
const noneWords = (selected: number, verb: string) =>
  selected === 1 ? `This title is being deleted. Nothing was ${verb}.` : `These titles are being deleted. Nothing was ${verb}.`

/** The toast after a Postpone (UX 8.9): an error toast when nothing moved. */
export function postponedToast(result: PostponeCleanupItemsResult, selected: number): ToastWords {
  if (result.postponed === 0) return { text: noneWords(selected, "postponed"), error: true }
  const text = `${plural(result.postponed, "title")} postponed.`
  return { text: result.skipped > 0 ? `${text}${skippedWords(result.skipped)}` : text, error: false }
}

/** The toast after an Exclude (UX 8.9). One title named by its level reads "Movie excluded.". */
export function excludedToast(result: ExcludeCleanupItemsResult, selected: number, level?: Level): ToastWords {
  if (result.excluded === 0) return { text: noneWords(selected, "excluded"), error: true }
  if (selected === 1 && result.excluded === 1 && level) {
    const noun = NOUNS[level][0]
    return { text: `${noun.charAt(0).toUpperCase()}${noun.slice(1)} excluded.`, error: false }
  }
  const text = `${plural(result.excluded, "title")} excluded.`
  return { text: result.skipped > 0 ? `${text}${skippedWords(result.skipped)}` : text, error: false }
}

/** The new leave dates of a Postpone by `days`: each date moves from `max(leaveOn, today)` (TS 10.3). Day keys, first and last. */
export function newLeaveDates(leaveOns: readonly (string | null)[], today: string, days: number): { first: string; last: string } {
  const dates = (leaveOns.length > 0 ? leaveOns : [null]).map((leaveOn) => addDays(leaveOn !== null && leaveOn > today ? leaveOn : today, days)).sort()
  return { first: dates[0], last: dates[dates.length - 1] }
}
