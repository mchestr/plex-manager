/**
 * The view of the Results section (UX 4.3.7, plan D11): the tab, sort,
 * search, page and near-miss chip that the editor root holds and sends in
 * `PreviewRequest`. Also the words of each tab and sort, the title words of a
 * row, and the focus moves that the preview card and the count bar use to
 * reach Results. Client-safe.
 *
 * @module components/admin/cleanup/results/view
 */

import type { ItemRef } from "@/lib/cleanup/types/preview"
import type { PreviewSort, PreviewTab } from "@/lib/validations/cleanup-actions"

export interface ResultsView {
  tab: PreviewTab
  sort: PreviewSort
  /** The server search (`PreviewRequest.search`), trimmed. Empty: no search. */
  search: string
  /** 1-based, 50 rows a page. */
  page: number
  /** A clause id (`PreviewRequest.nearMissCondition`), or null for "All". */
  chip: string | null
}

export const RESULTS_PAGE_SIZE = 50

export const DEFAULT_RESULTS_VIEW: ResultsView = { tab: "matches", sort: "largest", search: "", page: 1, chip: null }

/** The tab part of the test ids (UX 10.2). */
export const TAB_IDS: Record<PreviewTab, string> = {
  matches: "matches",
  nearMisses: "near-misses",
  protected: "protected",
  missing: "missing",
  cannotDelete: "cannot-delete",
}

export const TAB_LABELS: Record<PreviewTab, string> = {
  matches: "Matches",
  nearMisses: "Near misses",
  protected: "Protected",
  missing: "Missing data",
  cannotDelete: "Cannot delete",
}

/** The empty tab words (UX 8.4). */
export const EMPTY_TAB_WORDS: Record<PreviewTab, string> = {
  matches: "No matches",
  nearMisses: "No near misses",
  protected: "Nothing is protected",
  missing: "No missing data",
  cannotDelete: "Nothing here that cannot be deleted",
}

export const SORT_LABELS: Record<PreviewSort, string> = {
  largest: "Largest first",
  closest: "Closest first",
  oldestPlay: "Oldest play first",
  title: "Title",
}

/** The sorts of a tab, the default first. Only near misses have a gap to sort by (TS 10.6 step 4). */
export function sortsOf(tab: PreviewTab): PreviewSort[] {
  return tab === "nearMisses" ? ["closest", "largest", "oldestPlay", "title"] : ["largest", "oldestPlay", "title"]
}

/** A new tab starts on its default sort, on page 1, with no chip. The search stays. */
export function viewForTab(view: ResultsView, tab: PreviewTab): ResultsView {
  return { ...view, tab, sort: sortsOf(tab)[0], page: 1, chip: null }
}

/** "Napoleon", or "Supernatural, Season 4" for a season row (UX 4.3.7). */
export function itemName(item: Pick<ItemRef, "title" | "level" | "seasonNumber">): string {
  return item.level === "season" && item.seasonNumber !== null ? `${item.title}, Season ${item.seasonNumber}` : item.title
}

/** The `h2` "Results" (`tabIndex={-1}`): the target of "See all results", the count bar and a gone row (UX 7.9). */
export const RESULTS_HEADING_ID = "admin-cleanup-results-heading"

/** Moves focus to the Results heading and brings it into view. */
export function focusResultsHeading(): void {
  const heading = document.getElementById(RESULTS_HEADING_ID)
  heading?.scrollIntoView({ block: "start" })
  heading?.focus()
}

/** Moves focus to the tab of Results that shows `tab`. */
export function focusResultsTab(tab: PreviewTab): void {
  document.querySelector<HTMLElement>(`[data-cleanup-results-tab="${tab}"]`)?.focus()
}
