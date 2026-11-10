"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { SearchX } from "lucide-react"
import { type RefObject, useState } from "react"

import { type KeptDialog, KeptDialogs } from "@/components/admin/cleanup/kept/kept-dialogs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table/data-table"
import type { RowAction } from "@/components/ui/data-table/row-actions"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterBar } from "@/components/ui/filter-bar"
import { Poster } from "@/components/ui/poster"
import { useReplaceParams } from "@/hooks/use-replace-params"
import { lastDay, titleName, typeLine } from "@/lib/cleanup/actions/keeps/words"
import type { ProtectionRow } from "@/lib/cleanup/types/list-parts"
import type { CleanupProtectionsData } from "@/lib/cleanup/types/screens"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import { posterPalette } from "@/lib/ui/poster-palette"
import type { BoundFormat } from "@/lib/utils/format"

const BASE = "admin-cleanup-kept"

const FILTERS = [
  {
    param: "kind",
    label: "Kind",
    options: [
      { value: "all", label: "All" },
      { value: "keep", label: "Member Keeps" },
      { value: "exclude", label: "Exclusions" },
    ],
  },
]

/** "Kept by Sam Rivera" or "Excluded by you" (UX 4.8). */
function Protection({ row }: { row: ProtectionRow }) {
  const by = row.by ? (row.by.isYou ? "you" : row.by.name) : null
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {row.kind === "keep" ? (
        <Badge variant="success" icon={icons.keep}>
          Kept
        </Badge>
      ) : (
        <Badge variant="outline">Excluded</Badge>
      )}
      {by && <span className="text-ui text-foreground">by {by}</span>}
    </span>
  )
}

function columns(f: BoundFormat): ColumnDef<ProtectionRow>[] {
  return [
    {
      id: "title",
      header: "Title",
      cell: ({ row }) => (
        <span className="flex items-center gap-3">
          <Poster
            ratingKey={row.original.posterKey}
            title={titleName(row.original)}
            size="xs"
            style={{ width: 32 }}
            decorative
            // A title does not fit 32 px: the fallback keeps the palette colour only
            fallback={<span className="block size-full" style={{ background: posterPalette(row.original.posterKey ?? row.original.title).field }} />}
          />
          <span className="flex min-w-0 flex-col">
            <span className="font-medium text-foreground">{row.original.title}</span>
            <span className="text-label text-muted-foreground">{typeLine(row.original)}</span>
          </span>
        </span>
      ),
      meta: { card: "title" },
    },
    { id: "protection", header: "Protection", cell: ({ row }) => <Protection row={row.original} />, meta: { card: "field" } },
    {
      id: "until",
      header: "Until",
      cell: ({ row }) => <span className="whitespace-nowrap">{row.original.until ? f.date(lastDay(row.original.until), "short") : "No end date"}</span>,
      meta: { card: "field" },
    },
    {
      id: "since",
      header: "Since",
      cell: ({ row }) => <span className="whitespace-nowrap">{f.date(row.original.since, "short")}</span>,
      meta: { card: "field", priority: 3 },
    },
    {
      id: "note",
      header: "Note",
      cell: ({ row }) => (row.original.note ? <span className="text-muted-foreground">{row.original.note}</span> : null),
      meta: { card: "sub", priority: 3 },
    },
  ]
}

interface KeptTableProps {
  data: Pick<CleanupProtectionsData, "rows" | "total" | "page" | "size">
  /** Every protection that protects now, over all filters: the tiles' count. Zero shows the first-use empty state. */
  all: number
  /** Where focus goes after a row leaves the list. */
  successFocus?: RefObject<HTMLElement | null>
}

/**
 * The member Keeps and admin exclusions that protect now (UX 4.8): search
 * and Kind in the URL, newest first, one page from the server. A Keep has
 * "End keep..."; an exclusion "Change end date..." and "Remove
 * exclusion...". Keep forever marks are not listed: members own them on
 * Account.
 */
export function KeptTable({ data, all, successFocus }: KeptTableProps) {
  const f = useFormat()
  const { replace } = useReplaceParams()
  const [row, setRow] = useState<ProtectionRow | null>(null)
  const [dialog, setDialog] = useState<KeptDialog | null>(null)
  const open = (target: ProtectionRow, which: KeptDialog) => {
    setRow(target)
    setDialog(which)
  }

  const actions = (target: ProtectionRow): RowAction[] =>
    target.kind === "keep"
      ? [{ id: "end-keep", label: "End keep...", variant: "destructive", onSelect: () => open(target, "endKeep") }]
      : [
          { id: "change-end-date", label: "Change end date...", icon: icons.postpone, onSelect: () => open(target, "endDate") },
          { id: "remove-exclusion", label: "Remove exclusion...", variant: "destructive", onSelect: () => open(target, "removeExclusion") },
        ]

  const empty =
    all === 0 ? (
      <EmptyState
        kind="first-use"
        icon={icons.keep}
        title="No kept or excluded titles"
        description="Members keep titles from the Leaving soon page. You exclude titles from the Why panel or the Leaving soon list."
        data-testid={`${BASE}-empty`}
      />
    ) : (
      <EmptyState
        kind="filtered"
        icon={SearchX}
        title="No titles match these filters"
        primaryAction={
          <Button variant="secondary" onClick={() => replace({ q: null, kind: null, page: null })} data-testid={`${BASE}-clear-filters`}>
            Clear filters
          </Button>
        }
        data-testid={`${BASE}-empty`}
      />
    )

  return (
    <>
      <DataTable
        label="Kept and excluded titles"
        noun="titles"
        columns={columns(f)}
        data={data.rows}
        getRowId={(target) => target.id}
        getRowName={(target) => titleName(target)}
        rowActions={actions}
        toolbar={
          <FilterBar
            search={{ param: "q", placeholder: "Search titles" }}
            filters={FILTERS}
            resultCount={{ shown: data.total, total: data.total, noun: "titles" }}
            data-testid={`${BASE}-filters`}
          />
        }
        pagination={{ page: data.page, pageSize: data.size, total: data.total }}
        // The tab reads its page size from `size`, so the table offers no other size
        pageSizes={[data.size]}
        empty={empty}
        data-testid={BASE}
      />
      <KeptDialogs row={row} open={dialog} onOpenChange={(next) => !next && setDialog(null)} successFocus={successFocus} />
    </>
  )
}
