"use client"

import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"

import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { itemName } from "@/components/admin/cleanup/results/view"
import { isChangeMode } from "@/components/admin/cleanup/turn-on/turn-on-words"
import { WhySheet } from "@/components/admin/cleanup/why/why-sheet"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { Poster } from "@/components/ui/poster"
import { cleanupRule } from "@/lib/admin/routes"
import { plural } from "@/lib/cleanup/action-words"
import { NOUNS } from "@/lib/cleanup/fields/words"
import type { RequestedBy } from "@/lib/cleanup/types/preview"
import type { TurnOnLargestRow } from "@/lib/cleanup/types/rule-parts"
import type { CleanupTurnOnData } from "@/lib/cleanup/types/screens"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import type { BoundFormat } from "@/lib/utils/format"

/** "Nobody", "Nobody (import list)", "{name}, former member", "{name}, {month year}" (UX 8.4, X8). @internal Exported for tests. */
export function requesterLines(value: RequestedBy, f: BoundFormat): string[] {
  if (value === null) return ["Unknown"]
  if (value === "none" || value.length === 0) return ["Nobody"]
  if (value === "importList") return ["Nobody (import list)"]
  return value.map((r) => (r.status === "former" ? `${r.name}, former member` : r.status === "unknown" ? r.name : `${r.name}, ${f.date(r.at, "month-year-short")}`))
}

/** "Never", the date, or "Unknown" (UX 8.4). @internal Exported for tests. */
export function playedText(value: TurnOnLargestRow["lastPlayedAt"], f: BoundFormat): string {
  if (value === "never") return "Never"
  return value === null ? "Unknown" : f.date(value)
}

/** "The 10 largest", or fewer when the set is smaller. @internal Exported for tests. */
export const largestTitle = (rows: number): string => (rows === 1 ? "The largest" : `The ${rows === 0 ? 10 : rows} largest`)

/** A size or a date stays on one line, as in `shots/06-turn-on.png`. */
const Nowrap = ({ children }: { children: string }) => <span className="whitespace-nowrap">{children}</span>

/** The id of a row's "Why" button, for the focus after a Sheet action. */
const whyButtonId = (base: string, key: string) => `${base}-why-${key}`

/** The columns. Built once per format and id: a new cell function would mount a new "Why" button, and its focus would be lost. */
function columns(f: BoundFormat, base: string, onWhy: (key: string) => void): ColumnDef<TurnOnLargestRow>[] {
  return [
    {
      id: "title",
      header: "Title",
      cell: ({ row: { original: row } }) => (
        <span className="flex items-center gap-3">
          <Poster ratingKey={row.posterKey} title={itemName(row)} size="xs" style={{ width: 32 }} decorative />
          <span className="min-w-0">
            <span className="font-semibold text-foreground">{itemName(row)}</span>
            {row.year !== null && <span className="text-muted-foreground"> ({row.year})</span>}
          </span>
        </span>
      ),
    },
    { id: "size", header: "Size", meta: { align: "end", card: "field" }, cell: ({ row }) => <Nowrap>{sizeText(row.original.sizeBytes)}</Nowrap> },
    { id: "lastPlayed", header: "Last played", meta: { card: "field" }, cell: ({ row }) => <Nowrap>{playedText(row.original.lastPlayedAt, f)}</Nowrap> },
    {
      id: "added",
      header: "Added",
      meta: { card: "field" },
      cell: ({ row }) => <Nowrap>{row.original.addedAt ? f.date(row.original.addedAt) : "Unknown"}</Nowrap>,
    },
    {
      id: "requestedBy",
      header: "Requested by",
      meta: { card: "field" },
      cell: ({ row }) => (
        <span className="flex flex-col">
          {requesterLines(row.original.requestedBy, f).map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      ),
    },
    {
      id: "why",
      header: () => <span className="sr-only">Why</span>,
      meta: { align: "end", card: "field" },
      cell: ({ row: { original: row } }) => (
        <Button
          variant="outline"
          size="sm"
          id={whyButtonId(base, row.itemKey)}
          aria-label={`Why: ${itemName(row)}`}
          onClick={() => onWhy(row.itemKey)}
          data-testid={`admin-cleanup-turn-on-largest-${row.itemKey}-why`}
        >
          Why
        </Button>
      ),
    },
  ]
}

/**
 * "The 10 largest" (UX 4.6, `shots/06-turn-on.png`): a bordered table of
 * the ten largest titles with their size, last play, added date and
 * requesters, and "Why" on each row, which opens the wave 4 Why Sheet.
 * "See all in the rule preview" opens the rule.
 *
 * After an exclusion or a postpone from the Sheet, focus goes back to the
 * row's "Why" button. When the row is gone, it goes to this card's heading
 * (owner-r8-1, ux-a11y-r8-1): at the close, and again on the first render
 * with new rows while focus is on `body` or on a removed element
 * (ux-a11y-r8-2). The Sheet closes when the route hides (TS 12.1 item 8.2).
 */
export function LargestTable({ data }: { data: CleanupTurnOnData }) {
  const f = useFormat()
  const id = useId()
  const [whyKey, setWhyKey] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  // The row of the last Postpone or Exclude from the Sheet, until focus has a place
  const acted = useRef<string | null>(null)
  const rows = data.largest
  const rowKeys = rows.map((row) => row.itemKey).join(" ")

  useLayoutEffect(() => () => setWhyKey(null), [])

  const target = (): HTMLElement | null => (acted.current ? document.getElementById(whyButtonId(id, acted.current)) : null) ?? heading.current
  const tableColumns = useMemo(() => columns(f, id, setWhyKey), [f, id])

  useEffect(() => {
    if (acted.current === null) return
    const active = document.activeElement
    if (active === null || active === document.body || !active.isConnected) target()?.focus()
    acted.current = null
    // Only a new set of rows can remove the acted row
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKeys])

  const items = NOUNS[data.rule.level][1]
  const open = rows.find((row) => row.itemKey === whyKey)
  return (
    <Card data-testid="admin-cleanup-turn-on-largest-card">
      {/* The count line sits beside the title, and under it on a phone */}
      <CardHeader className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <CardTitle as="h2" ref={heading} tabIndex={-1} className="outline-none">
          {largestTitle(rows.length)}
        </CardTitle>
        <p className="text-label text-muted-foreground">
          Of {plural(data.count, data.rule.level)}.{" "}
          <Link
            href={cleanupRule(data.rule.id)}
            className="rounded-sm font-medium text-foreground underline decoration-border-strong underline-offset-3 hover:decoration-foreground"
            data-testid="admin-cleanup-turn-on-preview-link"
          >
            See all in the rule preview
          </Link>
        </p>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={tableColumns}
          data={[...rows]}
          getRowId={(row) => row.itemKey}
          label={largestTitle(rows.length)}
          noun={`largest ${items}`}
          pagination={{ page: 1, pageSize: Math.max(rows.length, 1), total: rows.length }}
          empty={<EmptyState kind="first-use" icon={icons.cleanup} title={`No ${items} to show`} />}
          data-testid="admin-cleanup-turn-on-largest"
        />
      </CardContent>
      <WhySheet
        itemKey={whyKey}
        onClose={() => setWhyKey(null)}
        scope={data.rule.id}
        ruleId={data.rule.id}
        surface={isChangeMode(data) ? "leaving" : "preview"}
        title={open ? itemName(open) : undefined}
        onActionDone={() => {
          acted.current = whyKey
        }}
        finalFocus={() => (acted.current ? (target() ?? true) : true)}
      />
    </Card>
  )
}
