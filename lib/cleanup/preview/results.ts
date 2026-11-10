/**
 * The Results list of a preview (TS 10.6 steps 4 and 5, UX 4.3.7): the
 * active tab, the near-miss chip, the title search, the sort and one page of
 * 50. Pure and client-safe.
 *
 * | Sort         | Order                                                     |
 * |--------------|-----------------------------------------------------------|
 * | `largest`    | size, largest first; an unknown size last                 |
 * | `closest`    | near-miss gap, closest first; no gap last                 |
 * | `oldestPlay` | never played first, then the oldest counted play; unknown last |
 * | `title`      | title                                                     |
 *
 * Ties sort by title, then by item key, so a page never shifts between calls.
 *
 * @module lib/cleanup/preview/results
 */

import { RESULTS_PAGE_SIZE } from "@/lib/cleanup/constants"
import type { Classification, ItemClass, ItemResult } from "@/lib/cleanup/engine/types"
import type { PreviewSort, PreviewTab } from "@/lib/validations/cleanup-actions"

/** One evaluated item of the rule with its class. `gap` is set for near misses. */
export interface Evaluated {
  result: ItemResult
  classification: Classification
  gap?: number | null
}

export interface ResultsView {
  tab: PreviewTab
  sort: PreviewSort
  page: number
  search?: string
  nearMissCondition?: string
}

export interface ResultsPage {
  rows: Evaluated[]
  /** The rows of the tab after the chip and the search. */
  total: number
  page: number
  pageCount: number
}

/** The class each tab lists. */
const TAB_CLASS: Record<PreviewTab, ItemClass> = {
  matches: "match",
  nearMisses: "nearMiss",
  protected: "protected",
  missing: "missing",
  cannotDelete: "cannotDelete",
}

const byTitle = (a: Evaluated, b: Evaluated) =>
  a.result.item.title.localeCompare(b.result.item.title, "en") || a.result.item.key.localeCompare(b.result.item.key, "en")

/** Ascending by `key`, with null after every number, then by title. */
function ascending(key: (e: Evaluated) => number | null): (a: Evaluated, b: Evaluated) => number {
  return (a, b) => {
    const x = key(a)
    const y = key(b)
    if (x !== y) {
      if (x === null) return 1
      if (y === null) return -1
      return x - y
    }
    return byTitle(a, b)
  }
}

/** Never played sorts as minus infinity, an unknown play history as null. */
const playKey = (e: Evaluated): number | null => {
  const plays = e.result.item.plays
  if (!plays) return null
  return plays.lastCountedAt ?? Number.NEGATIVE_INFINITY
}

const SORTS: Record<PreviewSort, (a: Evaluated, b: Evaluated) => number> = {
  largest: ascending((e) => (e.result.item.sizeBytes === null ? null : -e.result.item.sizeBytes)),
  closest: ascending((e) => e.gap ?? null),
  oldestPlay: ascending(playKey),
  title: byTitle,
}

/** The items of one tab, with the near-miss chip and the case-insensitive title search applied. */
export function tabEntries(entries: readonly Evaluated[], view: Pick<ResultsView, "tab" | "search" | "nearMissCondition">): Evaluated[] {
  const wanted = TAB_CLASS[view.tab]
  const query = view.search?.trim().toLowerCase() ?? ""
  const chip = view.tab === "nearMisses" ? view.nearMissCondition : undefined
  return entries.filter(
    (e) =>
      e.classification.class === wanted &&
      (chip === undefined || e.classification.failing === chip) &&
      (query === "" || e.result.item.title.toLowerCase().includes(query)),
  )
}

/** Sorts the entries in place by the view's sort, and returns its page of 50 (TS 10.6 step 4). */
export function pageOf(entries: Evaluated[], view: Pick<ResultsView, "sort" | "page">): ResultsPage {
  entries.sort(SORTS[view.sort])
  const pageCount = Math.max(1, Math.ceil(entries.length / RESULTS_PAGE_SIZE))
  const page = Math.min(Math.max(1, view.page), pageCount)
  const start = (page - 1) * RESULTS_PAGE_SIZE
  return { rows: entries.slice(start, start + RESULTS_PAGE_SIZE), total: entries.length, page, pageCount }
}

/** The largest matches, largest first: the preview card's four rows, the recipe Sheet's six posters. */
export function largestMatches(entries: readonly Evaluated[], count: number): Evaluated[] {
  return entries.filter((e) => e.classification.class === "match").sort(SORTS.largest).slice(0, count)
}
