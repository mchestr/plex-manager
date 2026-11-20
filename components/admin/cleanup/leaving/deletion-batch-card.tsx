"use client"

import { HardDrive } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useLayoutEffect, useRef, useState } from "react"

import { ApproveDialog } from "@/components/admin/cleanup/leaving/approve-dialog"
import { BatchFooter } from "@/components/admin/cleanup/leaving/batch-footer"
import { BatchSheet, BatchTable } from "@/components/admin/cleanup/leaving/batch-sheet"
import { BatchTitles } from "@/components/admin/cleanup/leaving/batch-titles"
import { ExcludeDialog } from "@/components/admin/cleanup/leaving/exclude-dialog"
import type { LeavingFocus } from "@/components/admin/cleanup/leaving/leaving-tab"
import { PostponeDialog } from "@/components/admin/cleanup/leaving/postpone-dialog"
import { selectedSummary } from "@/components/admin/cleanup/leaving/selected-summary"
import { useBatchSelection } from "@/components/admin/cleanup/leaving/use-batch-selection"
import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { itemName } from "@/components/admin/cleanup/results/view"
import { type WhyActionResult, WhySheet } from "@/components/admin/cleanup/why/why-sheet"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/components/ui/toast"
import { plural } from "@/lib/cleanup/action-words"
import { joinAnd, nounWord } from "@/lib/cleanup/fields/words"
import type { BatchRow, DeletionBatchData } from "@/lib/cleanup/types/list-parts"
import { useFormat } from "@/lib/format-context"
import { addDays } from "@/lib/ui/date-range"
import { icons } from "@/lib/ui/icons"
import { type BoundFormat, formatBytes } from "@/lib/utils/format"
import { dayKey } from "@/lib/utils/zoned-time"
import type { BatchTarget } from "@/lib/validations/cleanup-actions"

/** The error toast of an untick at the limit of 500 (UX 4.7.1 item 1, 8.9). @internal */
export const LIMIT_WORDS = "You can leave out at most 500 titles of a batch. Postpone the titles that you leave out, then approve."
/** The `-changed` alert (UX 8.7). @internal */
export const CHANGED_WORDS = { changed: "The numbers changed. Check them again.", lost: "Your earlier selection is lost. Every title is selected. Check the selection again." }

const DAY = "day-month-short" as const

type Dialog = "approve" | "postpone" | "exclude"

export interface DeletionBatchCardProps {
  batch: DeletionBatchData
  /** The daily deletion budget: at most `items` titles and `bytes` a day. */
  budget: { items: number; bytes: string }
  /** Cleanup is off or paused: the approve button waits, with its reason. */
  paused: boolean
  focus: LeavingFocus
}

/** "Today: 1 show, 410 GB. The rest go on Nov 9 to Nov 10." (TS 8.7, UX 8.7). */
function planLine(batch: DeletionBatchData, today: string, f: BoundFormat): string {
  const { today: now, lastDay } = batch.plan
  const first = now.count > 0 ? `Today: ${plural(now.count, batch.level)}, ${sizeText(now.bytes)}.` : "Today's budget is used."
  if (lastDay === null) return first
  const from = addDays(today, 1)
  const range = lastDay > from ? `${f.dayKey(from, DAY)} to ${f.dayKey(lastDay, DAY)}` : f.dayKey(lastDay, DAY)
  return `${first} ${now.count > 0 ? "The rest go" : "They go"} on ${range}.`
}

/** The heading, the badge and the description of UX 4.7.1. */
function headWords(batch: DeletionBatchData, today: string, f: BoundFormat) {
  const { count, level } = batch
  const one = count === 1
  const when =
    batch.dueSince >= today
      ? `${one ? `This ${nounWord(1, level)}` : `These ${nounWord(2, level)}`} reached ${one ? "its" : "their"} leave date today.`
      : batch.dueSince === batch.dueAt
        ? `${plural(count, level)} reached ${one ? "its" : "their"} leave date on ${f.dayKey(batch.dueSince, DAY)}.`
        : `${plural(count, level)} reached their leave date between ${f.dayKey(batch.dueSince, DAY)} and ${f.dayKey(batch.dueAt, DAY)}.`
  return {
    title: `${plural(count, level)} ${one ? "waits" : "wait"} for your approval`,
    due: batch.dueSince < today ? `Due since ${f.dayKey(batch.dueSince, DAY)}` : "Due today",
    description: `${batch.ruleName} is in Review first. ${when} Nothing is deleted until you approve.`,
  }
}

/** The fact lines: the check, the budget plan, the read before each delete, and the titles above the daily space budget. */
function facts(batch: DeletionBatchData, today: string, f: BoundFormat) {
  const lines = []
  if (batch.checkedAt) {
    const day = dayKey(Date.parse(batch.checkedAt), f.settings.timeZone)
    const when = day === today ? "today" : `on ${f.dayKey(day, DAY)}`
    lines.push({ icon: icons.success, text: `Checked again at ${f.time(batch.checkedAt)} ${when}: no play, no Keep, no new request, no new episode.` })
  }
  lines.push({ icon: HardDrive, text: planLine(batch, today, f) })
  lines.push({ icon: icons.info, text: `Each ${nounWord(1, batch.level)} is read again just before it goes. If anything changed, it stays.` })
  if (batch.oversize.length > 0) {
    const days = batch.oversize.map((o) => `${o.title} on ${f.dayKey(o.day, DAY)}`)
    const are = batch.oversize.length === 1 ? "is" : "are"
    lines.push({ icon: icons.warning, text: `${plural(batch.oversize.length, batch.level)} ${are} larger than the daily space budget. Each goes alone on its own day: ${joinAnd(days)}.` })
  }
  return lines
}

/**
 * A deletion batch card (UX 4.7.1, TS 12.6 `leaving/` item 2): a warning
 * border, the due badge, three fact lines with the budget plan and the
 * oversize line, the rows (the 10 largest, then "Show all {N}" with pages
 * of 50), and the footer. The selection lives in `use-batch-selection.ts`
 * (E36). The footer, the approve button and the dialog take one summary.
 * Postpone... and Exclude... act on the selection on every page (E37). On a
 * phone, the first 6 titles show, and "Review each" opens the rows in a
 * Sheet. After an approval or a footer action, focus goes to the card
 * heading, or to the list heading once the card is gone (UX 7.9).
 */
export function DeletionBatchCard({ batch, budget, paused, focus }: DeletionBatchCardProps) {
  const f = useFormat()
  const toast = useToast()
  const router = useRouter()
  const selection = useBatchSelection(batch)
  const heading = useRef<HTMLHeadingElement>(null)
  const startedAt = useRef(batch.reviewedAt)
  const whyButton = useRef<HTMLElement | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [expanded, setExpanded] = useState(batch.rowsPage > 1)
  const [why, setWhy] = useState<{ row: BatchRow; startedAt: string } | null>(null)
  const [seenChange, setSeenChange] = useState(false)
  // A batch change closes an open batch dialog, which clears its typed count (TS 12.6 `leaving/` item 2.3)
  if (selection.changing !== seenChange) {
    setSeenChange(selection.changing)
    if (selection.changing) setDialog(null)
  }
  // The page keeps a route it leaves (Activity): open dialogs and Sheets close as it hides (TS 12.1 rule 8.2)
  useLayoutEffect(
    () => () => {
      setDialog(null)
      setSheetOpen(false)
      setWhy(null)
    },
    []
  )

  const base = `admin-cleanup-batch-${batch.id}`
  const today = dayKey(Date.parse(batch.reviewedAt), f.settings.timeZone)
  const words = headWords(batch, today, f)
  const { totals, unticked } = selection
  const summary = selectedSummary(totals, unticked)
  const current: DeletionBatchData = { ...batch, ...totals }
  const target: BatchTarget = { batchId: batch.id, count: totals.count, keysHash: totals.keysHash, excludeKeys: unticked.map((row) => row.itemKey),
    selectedCount: summary.count }
  // The first element that is still on the page when focus moves (UX 7.9)
  const first = (...elements: (HTMLElement | null)[]) => elements.find((element) => element?.isConnected) ?? null

  const onWhy = useCallback(
    (row: BatchRow, button: HTMLElement) => {
      whyButton.current = button
      setWhy({ row, startedAt: batch.reviewedAt })
    },
    [batch.reviewedAt]
  )
  const open = (which: Dialog) => {
    startedAt.current = batch.reviewedAt
    setDialog(which)
  }
  const onStale = () => {
    selection.stale()
    router.refresh()
  }
  const afterOwn = (from: string, row?: boolean) => {
    selection.ownAction(from)
    focus.afterRemoval(() => first(row ? whyButton.current : null, heading.current, focus.listHeading.current))
  }
  const onWhyDone = (result: WhyActionResult) => {
    const changed = "postponed" in result ? result.postponed : result.excluded
    if (changed > 0 && why) afterOwn(why.startedAt, true)
  }
  const dialogProps = (which: Dialog) => ({ open: dialog === which, onOpenChange: (next: boolean) => setDialog(next ? which : null), onStale })
  const table = {
    batch,
    selection,
    onLimit: () => toast.showError(LIMIT_WORDS),
    onWhy,
    expanded,
    onShowAll: () => setExpanded(true),
  }

  return (
    <Card className="border-warning/45" data-testid={base}>
      <div className="flex flex-col gap-3 px-5 pt-5 pb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 ref={heading} tabIndex={-1} className="text-h3 text-foreground outline-none">
            {words.title}
          </h2>
          <Badge variant="warning" dot>
            {words.due}
          </Badge>
        </div>
        <p className="text-ui text-muted-foreground">{words.description}</p>
        <ul className="flex flex-col gap-1.5 text-ui text-foreground max-md:hidden">
          {facts(batch, today, f).map((line) => (
            <li key={line.text} className="flex items-start gap-2">
              <Icon icon={line.icon} className="mt-0.5 text-muted-foreground" />
              <span>{line.text}</span>
            </li>
          ))}
        </ul>
        {selection.alert && (
          <Alert tone="warning" data-testid={`${base}-changed`}>
            {CHANGED_WORDS[selection.alert]}
          </Alert>
        )}
        <BatchTable base={base} className="max-md:hidden" {...table} />
        <BatchTitles batch={batch} base={base} />
      </div>
      <BatchFooter
        base={base}
        level={batch.level}
        summary={summary}
        fallbackAction={batch.action}
        budget={budget}
        notSelected={unticked.filter((row) => row.inBatch).length}
        paused={paused}
        checking={selection.checking}
        onReviewEach={() => setSheetOpen(true)}
        onPostpone={() => open("postpone")}
        onExclude={() => open("exclude")}
        onApprove={() => open("approve")}
      />
      <ApproveDialog
        batch={current}
        unticked={unticked}
        budget={budget}
        {...dialogProps("approve")}
        onApproved={() => afterOwn(startedAt.current)}
        successFocus={heading}
      />
      <PostponeDialog
        target={{ batch: target, seasons: batch.level === "season" }}
        {...dialogProps("postpone")}
        onDone={(result) => result.postponed > 0 && afterOwn(startedAt.current)}
        successFocus={heading}
      />
      <ExcludeDialog
        target={{ batch: target }}
        {...dialogProps("exclude")}
        onDone={(result) => result.excluded > 0 && afterOwn(startedAt.current)}
        successFocus={heading}
      />
      <BatchSheet
        base={base}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        selectedLine={summary.count === 0 ? "0 selected." : `${summary.count} selected, ${formatBytes(BigInt(summary.bytes))}.`}
        {...table}
      />
      <WhySheet
        itemKey={why?.row.itemKey ?? null}
        title={why ? itemName(why.row) : undefined}
        onClose={() => setWhy(null)}
        scope={batch.ruleId}
        ruleId={batch.ruleId}
        surface="leaving"
        onActionDone={onWhyDone}
        finalFocus={whyButton}
      />
    </Card>
  )
}
