"use client"

import { type ReactNode, useRef } from "react"

import type { ClauseLabel } from "@/components/admin/cleanup/preview/clause-labels"
import { readTimeText } from "@/components/admin/cleanup/preview/read-time"
import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { NearMissChips } from "@/components/admin/cleanup/results/near-miss-chips"
import { ResultsTable } from "@/components/admin/cleanup/results/results-table"
import { ResultsToolbar } from "@/components/admin/cleanup/results/results-toolbar"
import {
  EMPTY_TAB_WORDS,
  RESULTS_HEADING_ID,
  RESULTS_PAGE_SIZE,
  type ResultsView,
  TAB_IDS,
  TAB_LABELS,
  viewForTab,
} from "@/components/admin/cleanup/results/view"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { TableSkeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"
import { nounWord } from "@/lib/cleanup/fields/words"
import type { PreviewResponse } from "@/lib/cleanup/types/preview"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import { PREVIEW_TABS, type PreviewTab } from "@/lib/validations/cleanup-actions"

interface ResultsSectionProps {
  data: PreviewResponse
  /** The view the editor root holds and sends with the preview request (plan D11). */
  view: ResultsView
  onViewChange: (view: ResultsView) => void
  labels: readonly ClauseLabel[]
  /** The rule name for the table caption; "New rule" for a new rule. */
  ruleName: string
  /** The render's clock, for "today". */
  now: number
  /** A newer preview is on its way. The rows stay until it comes (UX 4.3.9). */
  updating?: boolean
  /** Opens the Why Sheet of a row. */
  onWhy: (itemKey: string) => void
}

/**
 * The Results section of the rule editor (UX 4.3.7), a controlled component:
 * the tab, sort, search, page and near-miss chip come in `view`, and each
 * change goes out through `onViewChange`. The server returns one sorted page
 * of 50 rows. A new tab starts on its default sort, on page 1, with no chip.
 */
export function ResultsSection({ data, view, onViewChange, labels, ruleName, now, updating = false, onWhy }: ResultsSectionProps) {
  const f = useFormat()
  const tableRef = useRef<HTMLTableElement>(null)
  const level = data.level
  const total = data.total
  const from = (data.page - 1) * RESULTS_PAGE_SIZE + 1
  const to = from + data.rows.length - 1
  const left = total - to
  const bytes = view.tab === "matches" && view.search === "" ? `, ${sizeText(data.bytes)}` : ""
  const readFrom = data.snapshot ? `, on the library data from ${readTimeText(f, data.snapshot.takenAt, now)}` : ""

  const change = (patch: Partial<ResultsView>) => onViewChange({ ...view, page: 1, ...patch })
  const turnPage = (page: number) => {
    onViewChange({ ...view, page })
    tableRef.current?.focus()
  }

  let list: ReactNode
  if (data.snapshot === null) {
    list = <TableSkeleton rows={5} columns={6} />
  } else if (data.rows.length === 0) {
    list = (
      <div className="rounded-lg border bg-card">
        <EmptyState kind="filtered" icon={icons.cleanup} title={EMPTY_TAB_WORDS[view.tab]} data-testid="admin-cleanup-results-empty" />
      </div>
    )
  } else {
    list = (
      <ResultsTable
        rows={data.rows}
        tab={view.tab}
        level={level}
        sort={view.sort}
        caption={`${TAB_LABELS[view.tab]} for ${ruleName}`}
        f={f}
        onWhy={onWhy}
        tableRef={tableRef}
      />
    )
  }

  return (
    <section aria-labelledby={RESULTS_HEADING_ID} className="flex min-w-0 flex-col gap-4" data-testid="admin-cleanup-results">
      <div className="flex flex-col gap-1">
        <h2 id={RESULTS_HEADING_ID} tabIndex={-1} className="text-h2 outline-none">
          Results
        </h2>
        <p className="text-ui text-muted-foreground">
          The same checks as a run{readFrom}. Your unsaved changes count.
        </p>
      </div>
      <Tabs
        value={view.tab}
        onValueChange={(tab: PreviewTab) => {
          if (tab !== view.tab) onViewChange(viewForTab(view, tab))
        }}
        className="gap-4"
      >
        <TabsList aria-label="Results">
          {PREVIEW_TABS.map((tab) => (
            <TabsTab key={tab} value={tab} data-cleanup-results-tab={tab} data-testid={`admin-cleanup-results-tab-${TAB_IDS[tab]}`}>
              {TAB_LABELS[tab]}{" "}
              <Badge className="ml-2 tabular-nums">{f.number(data.tabs[tab])}</Badge>
            </TabsTab>
          ))}
        </TabsList>
        <TabsPanel key={view.tab} value={view.tab} className="flex flex-col gap-4">
          <ResultsToolbar
            tab={view.tab}
            sort={view.sort}
            search={view.search}
            count={`${f.number(total)} ${nounWord(total, level)}${bytes}`}
            onSortChange={(sort) => change({ sort })}
            onSearch={(search) => change({ search })}
          />
          {view.tab === "nearMisses" && (
            <NearMissChips
              total={data.tabs.nearMisses}
              clauses={data.clauses}
              labels={labels}
              value={view.chip}
              onValueChange={(chip) => change({ chip })}
            />
          )}
          <div aria-busy={updating || undefined}>{list}</div>
          {data.snapshot !== null && data.rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-ui text-muted-foreground tabular-nums">
                Showing {f.number(from)} to {f.number(to)} of {f.number(total)} {nounWord(total, level)}
              </p>
              <div className="ml-auto flex gap-2 max-md:w-full">
                {data.page > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => turnPage(data.page - 1)} data-testid="admin-cleanup-results-previous">
                    Show the previous {RESULTS_PAGE_SIZE}
                  </Button>
                )}
                {left > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="max-md:h-11 max-md:flex-1"
                    onClick={() => turnPage(data.page + 1)}
                    data-testid="admin-cleanup-results-next"
                  >
                    Show the next {Math.min(left, RESULTS_PAGE_SIZE)}
                  </Button>
                )}
              </div>
            </div>
          )}
        </TabsPanel>
      </Tabs>
    </section>
  )
}
