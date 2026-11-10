"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { SearchX } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useLayoutEffect, useMemo, useRef, useState } from "react"

import { ExcludeDialog } from "@/components/admin/cleanup/leaving/exclude-dialog"
import type { LeavingFocus } from "@/components/admin/cleanup/leaving/leaving-tab"
import { PostponeDialog } from "@/components/admin/cleanup/leaving/postpone-dialog"
import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { itemName } from "@/components/admin/cleanup/results/view"
import { WhySheet } from "@/components/admin/cleanup/why/why-sheet"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table/data-table"
import { DataTableBulkBar } from "@/components/ui/data-table/bulk-bar"
import type { RowAction } from "@/components/ui/data-table/row-actions"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterBar } from "@/components/ui/filter-bar"
import { Poster } from "@/components/ui/poster"
import { StatusBadge } from "@/components/ui/status-badge"
import { useReplaceParams } from "@/hooks/use-replace-params"
import { cleanup } from "@/lib/admin/routes"
import { plural } from "@/lib/cleanup/action-words"
import { ITEM_STATUSES, type ItemStatus } from "@/lib/cleanup/constants"
import { LIST_PAGE_SIZES } from "@/lib/cleanup/screens/leaving/params"
import type { LeavingGroup, LeavingRow } from "@/lib/cleanup/types/list-parts"
import type { CleanupLeavingData } from "@/lib/cleanup/types/screens"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import { posterPalette } from "@/lib/ui/poster-palette"
import { resolveStatus } from "@/lib/ui/status"
import { type BoundFormat, formatBytes } from "@/lib/utils/format"
import { dayKey } from "@/lib/utils/zoned-time"

const BASE = "admin-cleanup-leaving"
const DAY = "day-month-short" as const
const PAGE_SIZES = [...LIST_PAGE_SIZES].sort((a, b) => a - b)
const FILTER_PARAMS = ["q", "rule", "status", "library"] as const

/** A status as the Status filter names it: "Deletes on {day}" has no day there. */
const statusLabel = (status: ItemStatus) => (status === "deletesOn" ? "Deletes on a planned day" : resolveStatus("cleanupItem", status).label)
const toBigInt = (value: string | null) => (value !== null && /^\d+$/.test(value) ? BigInt(value) : 0n)
const rowsSize = (rows: readonly LeavingRow[]) => formatBytes(rows.reduce((sum, row) => sum + toBigInt(row.sizeBytes), 0n))

/** "Supernatural, Season 4" or "5 seasons" under the title. */
function subLine(row: LeavingRow): string | null {
  if (row.level === "season" && row.seasonNumber !== null) return `Season ${row.seasonNumber}`
  if (row.level === "show" && row.seasonCount !== null) return `${row.seasonCount} ${row.seasonCount === 1 ? "season" : "seasons"}`
  return row.year === null ? null : String(row.year)
}

/** The status with its sub-line (UX 4.12.6): the day of a planned delete, the budget day, who postponed it, or the cause. */
export function StatusCell({ row, f }: { row: LeavingRow; f: BoundFormat }) {
  const day = row.statusValues.day ? f.dayKey(row.statusValues.day, DAY) : undefined
  const note = row.statusValues.note
  if (row.status === "deletesOn") return <StatusBadge tone="destructive" label={day ? `Deletes on ${day}` : "Deletes soon"} />
  let sub: string | undefined
  if (row.status === "waitsForBudget" && day) sub = `Then ${day}`
  if (row.status === "postponed" && day) sub = `To ${day}${note ? ` by ${note}` : ""}`
  if (row.status === "onHold" || row.status === "failed") sub = note
  return <StatusBadge domain="cleanupItem" value={row.status} sub={sub} />
}

function columns(totals: CleanupLeavingData["totals"], f: BoundFormat): ColumnDef<LeavingRow>[] {
  return [
    {
      id: "title",
      header: "Title",
      cell: ({ row: { original: row } }) => (
        <span className="flex items-center gap-3">
          <Poster ratingKey={row.posterKey} title={row.title} size="xs" style={{ width: 32 }} decorative
            fallback={<span className="block size-full" style={{ background: posterPalette(row.posterKey ?? row.title).field }} />} />
          <span className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{row.title}</span>
            {subLine(row) && <span className="text-label text-muted-foreground">{subLine(row)}</span>}
          </span>
        </span>
      ),
      footer: () => plural(totals.count, "title"),
      meta: { card: "title" },
    },
    { id: "library", header: "Library", cell: ({ row }) => <span className="text-muted-foreground">{row.original.library}</span>, meta: { priority: 3 } },
    { id: "size", header: "Size", cell: ({ row }) => sizeText(row.original.sizeBytes), footer: () => sizeText(totals.bytes), meta: { align: "end", card: "field" } },
    {
      id: "rules",
      header: "Rules",
      cell: ({ row: { original: row } }) => (
        <span className="flex flex-col">
          <span>{row.rules[0]?.name ?? "A deleted rule"}</span>
          {row.rules[1] && <span className="text-label text-muted-foreground">Also: {row.rules[1].name}</span>}
          {row.showAlsoLeaving && <span className="text-label text-muted-foreground">The whole show is also leaving, after this season</span>}
        </span>
      ),
      footer: () => (
        <span className="font-normal text-muted-foreground">
          {totals.volumePercent !== null ? `${totals.volumePercent} % of the volume. ` : ""}Each group shows its first rows.
        </span>
      ),
      meta: { card: "sub" },
    },
    { id: "leaves", header: "Leaves on", cell: ({ row }) => (row.original.leaveAt ? f.dayKey(row.original.leaveAt, DAY) : "None"), meta: { card: "field" } },
    { id: "status", header: "Status", cell: ({ row }) => <StatusCell row={row.original} f={f} />, meta: { card: "field" } },
  ]
}

/** "Nov 19: 12 seasons, 210 GB", and for the due group "Today, Nov 8: 6 shows, 1.24 TB. Shown above." (UX 4.7.2). */
export function groupWords(key: string, group: LeavingGroup | undefined, today: string, f: BoundFormat): string {
  const day = key === "due" ? `Today, ${f.dayKey(today, DAY)}` : f.dayKey(key, DAY)
  if (!group) return day
  const words = `${day}: ${plural(group.count, group.level ?? "title")}, ${sizeText(group.bytes)}`
  return group.inBatch ? `${words}. Shown above.` : words
}

type ListDialog = { kind: "postpone" | "exclude"; rows: LeavingRow[]; bulk: boolean }

/**
 * Everything in Leaving soon (UX 4.7.2, TS 12.6 `leaving/` item 3): a
 * `DataTable` with row selection and leave-date groups (4 rows, then "Show
 * all {N}"), the filters, the bulk bar, the row actions Why, Postpone...,
 * Exclude... and Open in Plex, and the totals row. Titles of a deletion
 * batch show in their card; their group reads "Shown above". After a bulk
 * Postpone or Exclude, focus goes to the list heading. After a Postpone or
 * an exclusion from the Why Sheet, focus goes back to the row's actions
 * button, or to the list heading once the row is gone (UX 7.9).
 */
export function LeavingTable({ data, focus }: { data: CleanupLeavingData; focus: LeavingFocus }) {
  const f = useFormat()
  const { searchParams, replace } = useReplaceParams()
  const [now] = useState(() => Date.now())
  const today = dayKey(now, f.settings.timeZone)
  const [selected, setSelected] = useState<string[]>([])
  // The last dialog stays while it closes, so its words do not change during the fade
  const [dialog, setDialog] = useState<ListDialog | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [why, setWhy] = useState<LeavingRow | null>(null)
  useLayoutEffect(
    () => () => {
      setDialogOpen(false)
      setWhy(null)
    },
    []
  )
  const openDialog = (next: ListDialog) => {
    opener.current = next.bulk ? focus.listHeading.current : actionsOf(next.rows[0])
    setDialog(next)
    setDialogOpen(true)
  }

  const columnDefs = useMemo(() => columns(data.totals, f), [data.totals, f])
  const selectedRows = data.rows.filter((row) => selected.includes(row.itemKey))
  // The actions button of the row that opened a dialog or the Why Sheet: focus goes back to it (UX 7.9)
  const opener = useRef<HTMLElement | null>(null)
  const actionsOf = (row: LeavingRow) => document.querySelector<HTMLElement>(`[data-testid="${BASE}-actions-${row.itemKey}"]`)
  const filtered = FILTER_PARAMS.some((param) => searchParams.get(param))
  const above = data.groups.filter((group) => group.inBatch && !data.rows.some((row) => row.group === group.date))
  const aboveLines = above.map((group) => (
    <p key={group.date} className="text-label text-muted-foreground" data-testid={`${BASE}-above`}>
      {groupWords(group.date, group, today, f)}
    </p>
  ))
  const afterAction = () => {
    if (dialog?.bulk) setSelected([])
    focus.afterRemoval(() => focus.listHeading.current)
  }

  const actions = (row: LeavingRow): RowAction[] => [
    {
      id: "why",
      label: "Why",
      icon: icons.info,
      onSelect: () => {
        opener.current = actionsOf(row)
        setWhy(row)
      },
    },
    { id: "postpone", label: "Postpone...", icon: icons.postpone, onSelect: () => openDialog({ kind: "postpone", rows: [row], bulk: false }) },
    { id: "exclude", label: "Exclude...", icon: icons.exclude, onSelect: () => openDialog({ kind: "exclude", rows: [row], bulk: false }) },
    ...(row.plexUrl ? [{ id: "open-plex", label: "Open in Plex", icon: icons.externalLink, href: row.plexUrl as Route }] : []),
  ]

  let empty = <div className="flex flex-col gap-1 px-4 py-3">{aboveLines}</div>
  if (above.length === 0 && !filtered) {
    empty = (
      <EmptyState kind="first-use" icon={icons.leavingSoon} title="Nothing is leaving soon"
        description="Rules in Review first or Automatic put their matches here. Rules in Dry run only record them."
        primaryAction={<Button variant="outline" nativeButton={false} render={<Link href={cleanup()} />} data-testid={`${BASE}-empty-rules`}>Open rules</Button>}
        data-testid={`${BASE}-empty`} />
    )
  } else if (above.length === 0) {
    const clear = Object.fromEntries([...FILTER_PARAMS, "page"].map((param) => [param, null]))
    empty = (
      <EmptyState kind="filtered" icon={SearchX} title="No titles match these filters"
        primaryAction={<Button variant="secondary" onClick={() => replace(clear)} data-testid={`${BASE}-clear-filters`}>Clear filters</Button>}
        data-testid={`${BASE}-empty`} />
    )
  }

  const single = dialog && !dialog.bulk ? dialog.rows[0] : null
  const keys = dialog?.rows.map((row) => row.itemKey) ?? []
  return (
    <>
      <DataTable
        label="Everything in Leaving soon"
        noun="titles"
        size="wide"
        columns={columnDefs}
        data={data.rows}
        getRowId={(row) => row.itemKey}
        getRowName={(row) => itemName(row)}
        rowActions={actions}
        selectable={{ selected: selectedRows.map((row) => row.itemKey), onSelectedChange: setSelected, getRowLabel: (row) => itemName(row) }}
        groupBy={{
          getGroupKey: (row) => row.group,
          renderHeader: (key) => groupWords(key, data.groups.find((group) => group.date === key), today, f),
          initialRows: 4,
        }}
        bulkBar={
          <DataTableBulkBar count={selectedRows.length} label={`up to ${rowsSize(selectedRows)}`} onClear={() => setSelected([])} data-testid={`${BASE}-bulk`}>
            <Button variant="outline" size="sm" onClick={() => openDialog({ kind: "postpone", rows: selectedRows, bulk: true })} data-testid={`${BASE}-bulk-postpone`}>
              Postpone...
            </Button>
            <Button variant="outline" size="sm" onClick={() => openDialog({ kind: "exclude", rows: selectedRows, bulk: true })} data-testid={`${BASE}-bulk-exclude`}>
              Exclude...
            </Button>
          </DataTableBulkBar>
        }
        toolbar={
          <>
            <FilterBar
              search={{ param: "q", placeholder: "Search titles" }}
              filters={[
                { param: "rule", label: "Rule", options: [{ value: "all", label: "All rules" }, ...data.filters.rules.map((r) => ({ value: r.id, label: r.name }))] },
                { param: "status", label: "Status", options: [{ value: "all", label: "All" }, ...ITEM_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))] },
                { param: "library", label: "Library", options: [{ value: "all", label: "All" }, ...data.filters.libraries.map((l) => ({ value: l.sectionId, label: l.title }))] },
              ]}
              resultCount={{ shown: data.totals.count, total: data.totals.count, noun: `${data.totals.count === 1 ? "title" : "titles"}, ${sizeText(data.totals.bytes)}` }}
              data-testid={`${BASE}-filters`}
            />
            {data.rows.length > 0 && aboveLines}
          </>
        }
        pagination={{ page: data.page, pageSize: data.size, total: data.total }}
        pageSizes={PAGE_SIZES}
        empty={empty}
        data-testid={BASE}
      />
      <PostponeDialog
        target={{ itemKeys: keys, leaveOns: dialog?.rows.map((row) => row.leaveAt) ?? [], seasons: dialog?.rows.some((row) => row.level === "season") }}
        open={dialogOpen && dialog?.kind === "postpone"}
        onOpenChange={setDialogOpen}
        onDone={afterAction}
        successFocus={opener}
      />
      <ExcludeDialog
        target={single ? { itemKeys: keys, title: itemName(single), level: single.level } : { itemKeys: keys }}
        open={dialogOpen && dialog?.kind === "exclude"}
        onOpenChange={setDialogOpen}
        onDone={afterAction}
        successFocus={opener}
      />
      <WhySheet
        itemKey={why?.itemKey ?? null}
        title={why ? itemName(why) : undefined}
        onClose={() => setWhy(null)}
        scope={why?.rules[0]?.id ?? "leaving"}
        ruleId={why?.rules[0]?.id}
        surface="leaving"
        onActionDone={() => focus.afterRemoval(() => focus.listHeading.current)}
        finalFocus={opener}
      />
    </>
  )
}
