"use client"

import { useId } from "react"

import type { SelectedSummary } from "@/components/admin/cleanup/leaving/selected-summary"
import { Button } from "@/components/ui/button"
import { actionWords, plural } from "@/lib/cleanup/action-words"
import { SELECT_ONE } from "@/lib/cleanup/actions/items/words"
import { formatBytes } from "@/lib/utils/format"
import type { ActionId, Level } from "@/lib/validations/cleanup-vocabulary"

/** The reasons of the three footer buttons, in the order of UX 4.7.1. */
export const FOOTER_REASONS = {
  paused: "Cleanup is paused. Resume it first.",
  checking: "Checking the selection again.",
  none: SELECT_ONE,
} as const

const toBigInt = (value: string) => (/^\d+$/.test(value) ? BigInt(value) : 0n)

/** How many days the daily budget needs for the selection, largest first: at least 1. */
export function budgetDays(summary: Pick<SelectedSummary, "count" | "bytes">, budget: { items: number; bytes: string }): number {
  const byItems = budget.items > 0 ? Math.ceil(summary.count / budget.items) : 1
  const perDay = toBigInt(budget.bytes)
  const bytes = toBigInt(summary.bytes)
  const byBytes = perDay > 0n ? Number((bytes + perDay - 1n) / perDay) : 1
  return Math.max(1, byItems, byBytes)
}

export interface BatchFooterProps {
  /** `admin-cleanup-batch-{batchId}`. */
  base: string
  level: Level
  /** The selected titles (`selectedSummary`): the footer, the approve button and the dialog name the same count. */
  summary: SelectedSummary
  /** The batch's own action, for the button words at 0 selected. */
  fallbackAction: ActionId
  budget: { items: number; bytes: string }
  /** Unticked titles that are in the batch, for the muted line. */
  notSelected: number
  paused: boolean
  checking: boolean
  onReviewEach: () => void
  onPostpone: () => void
  onExclude: () => void
  onApprove: () => void
}

/**
 * The footer of a deletion batch card (UX 4.7.1, TS 12.6 `leaving/` item 9):
 * "{N} selected, {size}." with the budget days, or the words for 0 selected,
 * the muted line while titles are unticked, then "Review each" (phone only),
 * "Postpone...", "Exclude..." and the approve button. Each button exists
 * once: CSS `order` gives the phone order, and the approve button takes the
 * full width there. A disabled button stays focusable and names its reason:
 * paused (the approve button only), then checking, then 0 selected.
 */
export function BatchFooter(props: BatchFooterProps) {
  const { base, level, summary, budget, notSelected, paused, checking } = props
  const id = useId()
  const size = formatBytes(toBigInt(summary.bytes))
  const words = actionWords(summary.action ?? props.fallbackAction, { exclusion: summary.exclusionCount > 0, count: summary.count, level, size })
  const actReason = checking ? FOOTER_REASONS.checking : summary.count === 0 ? FOOTER_REASONS.none : null
  const approveReason = paused ? FOOTER_REASONS.paused : actReason
  const days = budgetDays(summary, budget)
  const disabled = (reason: string | null, reasonId: string) =>
    reason === null ? {} : { disabled: true, focusableWhenDisabled: true, "aria-describedby": reasonId }

  return (
    <div className="flex flex-col gap-3 border-t px-5 py-4 md:flex-row md:items-center md:justify-between" data-testid={`${base}-footer`}>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-ui text-muted-foreground" aria-live="polite">
          {summary.count === 0 ? (
            <span className="font-semibold text-foreground">0 selected. Select a title to approve, postpone or exclude it.</span>
          ) : (
            <>
              <span className="font-semibold text-foreground">
                {summary.count} selected, {size}.
              </span>{" "}
              The daily budget is {formatBytes(toBigInt(budget.bytes))}, so the deletions take {days} {days === 1 ? "day" : "days"}, largest first.
            </>
          )}
        </p>
        {notSelected > 0 && (
          <p className="text-label text-muted-foreground" data-testid={`${base}-not-selected`}>
            {plural(notSelected, "title")} not selected. This browser tab keeps your choice. To keep a title out for longer, postpone or exclude it.
          </p>
        )}
      </div>
      <div className="grid shrink-0 grid-cols-3 gap-2 md:flex md:items-center">
        <Button variant="outline" size="sm" className="order-1 px-2 md:hidden" onClick={props.onReviewEach} data-testid={`${base}-review-each`}>
          Review each
        </Button>
        <Button variant="outline" size="sm" className="order-2 max-md:px-2" onClick={props.onPostpone} {...disabled(actReason, `${id}-act`)} data-testid={`${base}-postpone`}>
          Postpone...
        </Button>
        <Button variant="outline" size="sm" className="order-3 max-md:px-2" onClick={props.onExclude} {...disabled(actReason, `${id}-act`)} data-testid={`${base}-exclude`}>
          Exclude...
        </Button>
        <Button
          variant="destructive-solid"
          size="sm"
          className="order-4 col-span-3 max-md:h-10"
          onClick={props.onApprove}
          {...disabled(approveReason, `${id}-approve`)}
          data-testid={`${base}-approve`}
        >
          {words.footerLabel}
        </Button>
        {actReason !== null && (
          <span id={`${id}-act`} className="sr-only">
            {actReason}
          </span>
        )}
        {approveReason !== null && (
          <span id={`${id}-approve`} className="sr-only">
            {approveReason}
          </span>
        )}
      </div>
    </div>
  )
}
