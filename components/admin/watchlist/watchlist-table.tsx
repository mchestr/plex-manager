"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { SearchX } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterBar } from "@/components/ui/filter-bar"
import { StatusBadge } from "@/components/ui/status-badge"
import { useReplaceParams } from "@/hooks/use-replace-params"
import { userDetail } from "@/lib/admin/routes"
import { WATCHLIST_STATUS_OF } from "@/lib/admin/watchlist-filter"
import type { WatchlistRow } from "@/lib/data/watchlist"
import type { MediaType } from "@/lib/generated/prisma/client"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import { resolveStatus } from "@/lib/ui/status"
import type { TableSort } from "@/lib/ui/table-params"
import type { BoundFormat } from "@/lib/utils/format"

const TYPE_LABEL: Record<MediaType, string> = { MOVIE: "Film", TV_SERIES: "Series", EPISODE: "Episode" }

const FILTERS = [
  {
    param: "status",
    label: "Status",
    options: [
      { value: "all", label: "All" },
      ...Object.entries(WATCHLIST_STATUS_OF).map(([value, status]) => ({ value, label: resolveStatus("watchlistSync", status).label })),
    ],
  },
  {
    param: "type",
    label: "Type",
    options: [
      { value: "all", label: "All" },
      { value: "movie", label: TYPE_LABEL.MOVIE },
      { value: "tv", label: TYPE_LABEL.TV_SERIES },
    ],
  },
]

const MOBILE_SORTS = [
  { value: "-synced", label: "Synced, newest" },
  { value: "synced", label: "Synced, oldest" },
  { value: "title", label: "Title" },
  { value: "member", label: "Member" },
  { value: "-requested", label: "Requested, newest" },
]

function columns(f: BoundFormat): ColumnDef<WatchlistRow>[] {
  return [
    {
      id: "title",
      header: "Title",
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.title}
          {row.original.year !== null && <span className="font-normal text-muted-foreground"> ({row.original.year})</span>}
        </span>
      ),
      meta: { card: "title" },
    },
    { id: "type", header: "Type", cell: ({ row }) => TYPE_LABEL[row.original.mediaType], meta: { card: "sub" } },
    {
      id: "member",
      header: "Member",
      enableSorting: true,
      cell: ({ row }) => {
        const { user } = row.original
        return (
          <Link
            href={userDetail(user.id)}
            className="rounded-sm text-foreground hover:underline"
            data-testid={`admin-watchlist-member-${row.original.id}`}
          >
            {user.name || user.email || "Unknown member"}
          </Link>
        )
      },
      meta: { card: "field" },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge domain="watchlistSync" value={row.original.status} />,
      meta: { card: "field" },
    },
    {
      id: "synced",
      header: "Synced",
      enableSorting: true,
      cell: ({ row }) => f.date(row.original.syncedAt, "short"),
      meta: { card: "field" },
    },
    {
      id: "requested",
      header: "Requested",
      enableSorting: true,
      cell: ({ row }) => (row.original.requestedAt ? f.date(row.original.requestedAt, "short") : "—"),
      meta: { card: "field", priority: 3 },
    },
  ]
}

interface WatchlistTableProps {
  /** This page's rows, filtered, sorted and paged on the server. */
  rows: WatchlistRow[]
  /** Rows matching the filters, across every page. */
  total: number
  /** Every title, for "3 of 12 titles" and the first-use empty state. */
  all: number
  page: number
  pageSize: number
  sort: TableSort
  /** The global switch, which the first-use empty state names while it is off. */
  syncEnabled: boolean
}

/**
 * Every title members' watchlists synced, one row per member and title, on
 * the invites list's pattern: filters, sort and page live in the URL, the
 * member links to their user page, and the status reads from the
 * `watchlistSync` vocabulary.
 */
export function WatchlistTable({ rows, total, all, page, pageSize, sort, syncEnabled }: WatchlistTableProps) {
  const f = useFormat()
  const { replace } = useReplaceParams()

  const empty =
    all === 0 ? (
      <EmptyState
        kind="first-use"
        icon={icons.watchlist}
        title="No watchlist titles yet"
        description={
          syncEnabled
            ? "A title appears here when a member with sync on adds it to their Plex watchlist."
            : "Turn on watchlist sync in Sync settings. Then members can turn on sync from their home page."
        }
        data-testid="admin-watchlist-empty"
      />
    ) : (
      <EmptyState
        kind="filtered"
        icon={SearchX}
        title="No titles match these filters"
        primaryAction={
          <Button data-testid="admin-watchlist-clear-filters" variant="secondary" onClick={() => replace({ q: null, status: null, type: null, page: null })}>
            Clear filters
          </Button>
        }
        data-testid="admin-watchlist-empty-filtered"
      />
    )

  return (
    <DataTable
      label="Watchlist titles"
      noun="titles"
      columns={columns(f)}
      data={rows}
      getRowId={(row) => row.id}
      pagination={{ page, pageSize, total }}
      sort={sort}
      empty={empty}
      toolbar={
        <FilterBar
          search={{ param: "q", placeholder: "Search titles or members" }}
          filters={FILTERS}
          sort={{ param: "sort", options: MOBILE_SORTS }}
          resultCount={{ shown: total, total: all, noun: "titles" }}
          data-testid="admin-watchlist-filters"
        />
      }
      data-testid="admin-watchlist"
    />
  )
}
