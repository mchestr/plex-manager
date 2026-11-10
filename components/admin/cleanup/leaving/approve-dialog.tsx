"use client"

import type { RefObject } from "react"

import { deleteCleanupBatch } from "@/actions/admin/cleanup-items"
import { type BatchTotals, selectedSummary, type UntickedRow } from "@/components/admin/cleanup/leaving/selected-summary"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { actionWords, approveDescription, plural } from "@/lib/cleanup/action-words"
import { useCloseFocus } from "@/lib/cleanup/actions/items/dialog-focus"
import { approvedToast, SELECT_ONE } from "@/lib/cleanup/actions/items/words"
import { TYPED_APPROVAL_ABOVE } from "@/lib/cleanup/constants"
import { joinAnd } from "@/lib/cleanup/fields/words"
import type { DeleteCleanupBatchResult } from "@/lib/cleanup/types/actions"
import type { BatchRow, DeletionBatchData } from "@/lib/cleanup/types/list-parts"
import { useFormat } from "@/lib/format-context"
import { addDays } from "@/lib/ui/date-range"
import { type BoundFormat, formatBytes } from "@/lib/utils/format"
import { dayKey } from "@/lib/utils/zoned-time"

/** The 10 largest selected titles are listed, then "and {N} more" (UX 8.6). */
const LISTED = 10

export interface ApproveDialogProps {
  /** The deletion batch as the card shows it: `count`, `keysHash` and `reviewedAt` go back to the server. */
  batch: DeletionBatchData
  /** The unticked rows of this browser tab (E36). Only rows with `inBatch: true` leave the counts; every key goes in `excludeKeys`. */
  unticked: readonly UntickedRow[]
  /** The rows to list, largest first. Default: the rows of the batch data. Pass the first page. */
  rows?: readonly BatchRow[]
  /** The daily deletion budget (Settings): at most `items` titles and `bytes` (a decimal string) a day. */
  budget: { items: number; bytes: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  onApproved?: (result: DeleteCleanupBatchResult) => void
  /** `CLEANUP_REVIEW_STALE`: the dialog closes, focus goes back to its opener, and the card reloads (UX 4.7.1 item 4). */
  onStale: () => void
  /** Where focus goes after a successful approval: the card heading, or the list heading once the card is gone (UX 7.9). */
  successFocus?: RefObject<HTMLElement | null>
}

const sizeOf = (value: string | null) => (value !== null && /^\d+$/.test(value) ? BigInt(value) : 0n)
const bySize = (a: BatchRow, b: BatchRow) => (sizeOf(b.sizeBytes) > sizeOf(a.sizeBytes) ? 1 : sizeOf(b.sizeBytes) < sizeOf(a.sizeBytes) ? -1 : 0)
const rowTitle = (row: BatchRow) => (row.level === "season" && row.seasonNumber !== null ? `${row.title}, Season ${row.seasonNumber}` : row.title)

/**
 * "from {day} to {day}": the budget plan of the batch, from today or tomorrow
 * when today's budget is used. Today is the day of `reviewedAt`, the server
 * time of the render: an approval more than 15 minutes later is stale anyway.
 */
function planDays(batch: DeletionBatchData, f: BoundFormat): { from: string; to: string } {
  const today = dayKey(Date.parse(batch.reviewedAt), f.settings.timeZone)
  const from = batch.plan.today.count > 0 ? today : addDays(today, 1)
  const to = batch.plan.lastDay !== null && batch.plan.lastDay > from ? batch.plan.lastDay : from
  return { from: f.dayKey(from, "day-month-short"), to: f.dayKey(to, "day-month-short") }
}

/** "{N} {items} are larger than the daily space budget. Each goes alone on its own day: {title} on {day}." (X13). */
function oversizeLine(batch: DeletionBatchData, f: BoundFormat): string | null {
  if (batch.oversize.length === 0) return null
  const days = batch.oversize.map((o) => `${o.title} on ${f.dayKey(o.day, "day-month-short")}`)
  return `${plural(batch.oversize.length, batch.level)} ${batch.oversize.length === 1 ? "is" : "are"} larger than the daily space budget. Each goes alone on its own day: ${joinAnd(days)}.`
}

function Titles({ rows, more }: { rows: readonly BatchRow[]; more: number }) {
  return (
    <div className="flex flex-col gap-2" data-testid="admin-cleanup-approve-titles">
      <ul className="divide-y rounded-md border text-ui">
        {rows.map((row) => (
          <li key={row.itemKey} className="flex items-baseline justify-between gap-4 px-3 py-1.5">
            <span className="min-w-0 truncate text-foreground">{rowTitle(row)}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">{formatBytes(sizeOf(row.sizeBytes))}</span>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="text-label text-muted-foreground">and {more} more</p>}
    </div>
  )
}

/**
 * The approve dialog of a deletion batch (UX 4.7.1 item 2, 8.6, E35, E36):
 * a destructive `ConfirmDialog` whose title, sentence and button come from
 * `actionWords()` for the least careful action of the selected titles. It
 * takes its numbers from `selectedSummary()`, so the footer and the dialog
 * name the same count, and it sends them as `selected`. It lists the 10
 * largest selected titles with their sizes. Above 50 titles the count must
 * be typed. A stale answer closes it and calls `onStale`.
 */
export function ApproveDialog({ batch, unticked, rows, budget, open, onOpenChange, onApproved, onStale, successFocus }: ApproveDialogProps) {
  const f = useFormat()
  const toast = useToast()
  const focus = useCloseFocus(open, successFocus)
  const totals: BatchTotals = batch
  const summary = selectedSummary(totals, unticked)
  const action = summary.action ?? batch.action
  const size = formatBytes(BigInt(summary.bytes))
  const words = actionWords(action, { exclusion: summary.exclusionCount > 0, count: summary.count, level: batch.level, size })
  const { from, to } = planDays(batch, f)
  const budgetWords = { upTo: size, budgetItems: budget.items, budgetSize: formatBytes(sizeOf(budget.bytes)), from, to, exclusionCount: summary.exclusionCount }
  const description = [...approveDescription(action, { count: summary.count, level: batch.level, size }, budgetWords), oversizeLine(batch, f)]
  const out = new Set(unticked.map((row) => row.itemKey))
  const listed = [...(rows ?? batch.rows)].filter((row) => !out.has(row.itemKey)).sort(bySize).slice(0, LISTED)
  const typed = summary.count > TYPED_APPROVAL_ABOVE

  const approve = async () => {
    if (summary.action === null) return { error: SELECT_ONE }
    const result = await deleteCleanupBatch({
      batchId: batch.id,
      count: batch.count,
      keysHash: batch.keysHash,
      excludeKeys: unticked.map((row) => row.itemKey),
      selected: { count: summary.count, action: summary.action, exclusionCount: summary.exclusionCount },
      reviewedAt: batch.reviewedAt,
      ...(typed ? { typedCount: summary.count } : {}),
    })
    if (!result.success) {
      if (result.code !== "CLEANUP_REVIEW_STALE") return { error: result.error }
      focus.toOpener()
      onStale()
      return {}
    }
    focus.toTarget()
    toast.showSuccess(approvedToast(result.data.actQueued))
    onApproved?.(result.data)
    return {}
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={words.dialogTitle}
      description={description.filter(Boolean).join(" ")}
      confirmLabel={words.confirmLabel}
      pendingLabel="Approving"
      tone="destructive"
      typeToConfirm={typed ? String(summary.count) : undefined}
      action={approve}
      successFocus={focus.successFocus}
      data-testid="admin-cleanup-approve-dialog"
      confirmTestId="admin-cleanup-approve-confirm"
    >
      <Titles rows={listed} more={summary.count - listed.length} />
    </ConfirmDialog>
  )
}
