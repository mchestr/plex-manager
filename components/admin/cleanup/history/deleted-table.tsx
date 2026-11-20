"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { SearchX } from "lucide-react"
import { useCallback, useLayoutEffect, useMemo, useState } from "react"

import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { itemName } from "@/components/admin/cleanup/results/view"
import { WhySheet } from "@/components/admin/cleanup/why/why-sheet"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterBar } from "@/components/ui/filter-bar"
import { Poster } from "@/components/ui/poster"
import { StatusBadge } from "@/components/ui/status-badge"
import { useReplaceParams } from "@/hooks/use-replace-params"
import { SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import { LIST_PAGE_SIZES } from "@/lib/cleanup/screens/leaving/params"
import type { HistoryTitle } from "@/lib/cleanup/types/list-parts"
import type { CleanupHistoryData } from "@/lib/cleanup/types/screens"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import { posterPalette } from "@/lib/ui/poster-palette"
import type { BoundFormat } from "@/lib/utils/format"

const BASE = "admin-cleanup-deleted"
const PAGE_SIZES = [...LIST_PAGE_SIZES].sort((a, b) => a - b)

/** "Season 2" or the year under the title. */
const subLine = (row: HistoryTitle) => (row.level === "season" && row.seasonNumber !== null ? `Season ${row.seasonNumber}` : row.year === null ? null : String(row.year))

/** "Automatic", "You", the admin's name, or "No one" (UX 4.9 item 2). @internal */
export function approvedWords(value: HistoryTitle["approvedBy"]): string {
  if (value === "automatic") return "Automatic"
  if (value === null) return "No one"
  return value.isYou ? "You" : value.name
}

/** Deleted, Failed with its cause, or "Still unmonitored in {Service}" with the reason (UX 4.9 item 2). */
function ResultCell({ row }: { row: HistoryTitle }) {
  if (row.result === "stillUnmonitored") {
    const service = SERVICE_NAMES[row.stillUnmonitored ?? (row.level === "movie" ? "radarr" : "sonarr")]
    return <StatusBadge tone="warning" icon={icons.warning} label={`Still unmonitored in ${service}`} sub={row.cause ?? undefined} />
  }
  if (row.result === "failed") return <StatusBadge domain="cleanupItem" value="failed" sub={row.cause ?? undefined} />
  return <StatusBadge domain="cleanupItem" value="deleted" />
}

function columns(f: BoundFormat, onWhy: (row: HistoryTitle, button: HTMLElement) => void): ColumnDef<HistoryTitle>[] {
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
      meta: { card: "title" },
    },
    { id: "rule", header: "Rule", cell: ({ row }) => row.original.rule?.name ?? "No rule", meta: { card: "sub" } },
    {
      id: "deleted",
      header: "Deleted",
      cell: ({ row }) => (row.original.result === "stillUnmonitored" ? "Not deleted" : f.date(row.original.actedAt)),
      meta: { card: "field" },
    },
    {
      id: "freed",
      header: "Freed, up to",
      cell: ({ row }) => (row.original.result === "stillUnmonitored" ? "None" : sizeText(row.original.freedBytes)),
      meta: { align: "end", card: "field" },
    },
    { id: "approved", header: "Approved by", cell: ({ row }) => approvedWords(row.original.approvedBy), meta: { card: "field" } },
    { id: "result", header: "Result", cell: ({ row }) => <ResultCell row={row.original} />, meta: { card: "field" } },
    {
      id: "why",
      header: () => <span className="sr-only">Why</span>,
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          aria-label={`Why: ${itemName(row.original)}`}
          onClick={(event) => onWhy(row.original, event.currentTarget)}
          data-testid={`${BASE}-row-${row.original.id}-why`}
        >
          Why
        </Button>
      ),
      meta: { card: "field" },
    },
  ]
}

/**
 * The Deleted titles table of the History tab (UX 4.9 item 2): the deleted
 * and failed titles, and those left unmonitored, newest first, with search
 * and Rule. One title can have several rows, so each row is keyed by its
 * outcome id. "Why" opens the stored Why of that outcome, read only.
 */
export function DeletedTable({ data }: { data: Pick<CleanupHistoryData, "deleted" | "total" | "page" | "size" | "filters"> }) {
  const f = useFormat()
  const { searchParams, replace } = useReplaceParams()
  const [why, setWhy] = useState<HistoryTitle | null>(null)
  // The "Why" button that opened the Sheet: focus goes back to it (UX 7.9)
  const [opener, setOpener] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => () => setWhy(null), [])
  const onWhy = useCallback((row: HistoryTitle, button: HTMLElement) => {
    setOpener(button)
    setWhy(row)
  }, [])
  // Stable cells: a cell made per render would remount, and the "Why" button that opened the Sheet would be gone
  const columnDefs = useMemo(() => columns(f, onWhy), [f, onWhy])
  const filtered = Boolean(searchParams.get("q") || searchParams.get("rule"))

  const empty = filtered ? (
    <EmptyState kind="filtered" icon={SearchX} title="No titles match these filters"
      primaryAction={<Button variant="secondary" onClick={() => replace({ q: null, rule: null, page: null })} data-testid={`${BASE}-clear-filters`}>Clear filters</Button>}
      data-testid={`${BASE}-empty`} />
  ) : (
    <EmptyState kind="first-use" icon={icons.cleanup} title="No deleted titles yet" description="Titles that a rule deletes show here for 1 year." data-testid={`${BASE}-empty`} />
  )

  return (
    <>
      <DataTable
        label="Deleted titles"
        noun="titles"
        size="wide"
        columns={columnDefs}
        data={data.deleted}
        getRowId={(row) => row.id}
        toolbar={
          <FilterBar
            search={{ param: "q", placeholder: "Search titles" }}
            filters={[{ param: "rule", label: "Rule", options: [{ value: "all", label: "All rules" }, ...data.filters.rules.map((r) => ({ value: r.id, label: r.name }))] }]}
            resultCount={{ shown: data.total, total: data.total, noun: data.total === 1 ? "title" : "titles" }}
            data-testid={`${BASE}-filters`}
          />
        }
        pagination={{ page: data.page, pageSize: data.size, total: data.total }}
        pageSizes={PAGE_SIZES}
        empty={empty}
        data-testid={BASE}
      />
      <WhySheet
        itemKey={why?.itemKey ?? null}
        title={why ? itemName(why) : undefined}
        onClose={() => setWhy(null)}
        scope={why?.rule?.id ?? "history"}
        ruleId={why?.rule?.id}
        outcomeId={why?.id}
        surface="history"
        finalFocus={() => opener ?? true}
      />
    </>
  )
}
