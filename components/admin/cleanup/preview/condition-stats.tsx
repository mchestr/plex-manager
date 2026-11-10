"use client"

import { useId, useState } from "react"

import { type ClauseLabel, labelOf } from "@/components/admin/cleanup/preview/clause-labels"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import type { PreviewResponse } from "@/lib/cleanup/types/preview"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"
import type { BoundFormat } from "@/lib/utils/format"

interface ConditionStatsProps {
  /** The pass count and held-back count of each clause (TS 10.5). */
  clauses: PreviewResponse["clauses"]
  labels: readonly ClauseLabel[]
  checked: number
  allConditions: number
  matches: number
  protectedAll: number
  f: BoundFormat
}

/** A pass count over the checked items, in `chart-1`. The facts are in the text beside it, so the bar is hidden (UX 11.3 item 3). */
function Bar({ value, of }: { value: number; of: number }) {
  const percent = of > 0 ? Math.min(100, (value / of) * 100) : 0
  return (
    <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-chart-1" style={{ width: `${percent}%` }} />
    </div>
  )
}

/**
 * "What each condition does" (UX 4.3.6): one row for each condition and
 * group with its sentence, "N more without it" and its pass count over a
 * bar, then "All of these" and the matches after Never touch. Both numbers
 * are order-free.
 *
 * The list renders once (ux-a11y-r3-3). Below `lg` it folds behind a toggle
 * button that holds a state, and the list takes `hidden lg:block` while
 * folded. `Collapsible.Panel` would not do: Tailwind preflight hides its
 * `hidden` attribute with `!important`, so `lg:block` could not show it.
 */
export function ConditionStats({ clauses, labels, checked, allConditions, matches, protectedAll, f }: ConditionStatsProps) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const rows = clauses.flatMap((clause) => {
    const label = labelOf(labels, clause.id)
    return label ? [{ ...clause, sentence: label.sentence }] : []
  })

  return (
    <div className="flex flex-col gap-3">
      <h3 className="hidden text-ui font-medium text-foreground lg:block">What each condition does</h3>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-between px-0 hover:bg-transparent lg:hidden"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        data-testid="admin-cleanup-preview-stats-toggle"
      >
        What each condition does
        <Icon icon={icons.chevronDown} className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      <ul id={listId} className={cn("space-y-4", open ? "block" : "hidden lg:block")}>
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-2" data-testid={`admin-cleanup-preview-stat-${row.id}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-ui text-foreground">{row.sentence}</p>
                <p className="text-label text-muted-foreground">
                  <strong className="font-semibold text-foreground">{f.number(row.heldBack)}</strong> more without it
                </p>
              </div>
              <p className="text-ui text-foreground tabular-nums">
                {f.number(row.passAlone)}
                <span className="sr-only"> pass it</span>
              </p>
            </div>
            <Bar value={row.passAlone} of={checked} />
          </li>
        ))}
        <li className="flex flex-col gap-2" data-testid="admin-cleanup-preview-stat-all">
          <div className="flex items-start justify-between gap-4">
            <p className="text-ui font-semibold text-foreground">All of these</p>
            <p className="text-ui text-foreground tabular-nums">{f.number(allConditions)}</p>
          </div>
          <Bar value={allConditions} of={checked} />
        </li>
        <li className="flex flex-col gap-2" data-testid="admin-cleanup-preview-stat-matches">
          <div className="flex items-start justify-between gap-4">
            <p className="text-ui text-foreground">
              <strong className="font-semibold">Matches</strong>, after Never touch keeps {f.number(protectedAll)} safe
            </p>
            <p className="text-ui text-foreground tabular-nums">{f.number(matches)}</p>
          </div>
          <Bar value={matches} of={checked} />
        </li>
      </ul>
    </div>
  )
}
