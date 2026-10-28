"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Copy, SearchX, Trash2 } from "lucide-react"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterBar } from "@/components/ui/filter-bar"
import { StatusBadge } from "@/components/ui/status-badge"
import { useCopyInviteLink } from "@/hooks/admin/use-copy-invite-link"
import { useReplaceParams } from "@/hooks/use-replace-params"
import type { AdminInviteRow } from "@/lib/admin/invites/queries"
import { invite as inviteRoute } from "@/lib/admin/routes"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import type { TableSort } from "@/lib/ui/table-params"

import { DeleteInviteDialog } from "./delete-invite-dialog"

const FILTERS = [
  {
    param: "status",
    label: "Status",
    options: [
      { value: "all", label: "All" },
      { value: "active", label: "Active" },
      { value: "expired", label: "Expired" },
      { value: "usedUp", label: "Used up" },
    ],
  },
  {
    param: "server",
    label: "Server",
    options: [
      { value: "all", label: "All" },
      { value: "plex", label: "Plex" },
      { value: "jellyfin", label: "Jellyfin" },
    ],
  },
]

const MOBILE_SORTS = [
  { value: "-created", label: "Created, newest" },
  { value: "created", label: "Created, oldest" },
  { value: "code", label: "Code" },
  { value: "expires", label: "Expires, soonest" },
]

interface InvitesTableProps {
  /** This page's rows, filtered, sorted and paged on the server. */
  rows: AdminInviteRow[]
  /** Rows matching the filters, across every page. */
  total: number
  /** Every invite, for "3 of 7 invites" and the first-use empty state. */
  all: number
  page: number
  pageSize: number
  sort: TableSort
  /** The first-use empty state's "Create invite". */
  createAction: ReactNode
}

/**
 * The invites list (P10.1), on the users page's pattern (P10.18): the code
 * links to the detail page, filters and sort live in the URL, and each row's
 * menu holds Copy link and "Delete...".
 */
export function InvitesTable({ rows, total, all, page, pageSize, sort, createAction }: InvitesTableProps) {
  const f = useFormat()
  const { replace } = useReplaceParams()
  const copy = useCopyInviteLink()
  const [deleting, setDeleting] = useState<AdminInviteRow | null>(null)

  const columns: ColumnDef<AdminInviteRow>[] = [
    {
      id: "code",
      header: "Code",
      enableSorting: true,
      cell: ({ row }) => <span className="font-mono font-medium tracking-wider">{row.original.code}</span>,
      meta: { card: "title" },
    },
    { id: "server", header: "Server", cell: ({ row }) => (row.original.serverType === "JELLYFIN" ? "Jellyfin" : "Plex"), meta: { card: "sub" } },
    {
      id: "uses",
      header: "Uses",
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.useCount} of {row.original.maxUses}
        </span>
      ),
      meta: { card: "field" },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge domain="invite" value={row.original.status} />,
      meta: { card: "field" },
    },
    {
      id: "expires",
      header: "Expires",
      enableSorting: true,
      cell: ({ row }) => (row.original.expiresAt ? f.date(row.original.expiresAt, "short") : "Never"),
      meta: { card: "field" },
    },
    { id: "created", header: "Created", enableSorting: true, cell: ({ row }) => f.date(row.original.createdAt, "short"), meta: { priority: 3 } },
  ]

  const empty =
    all === 0 ? (
      <EmptyState
        kind="first-use"
        icon={icons.invites}
        title="No invites yet"
        description="An invite is a link that lets someone join your server."
        primaryAction={createAction}
        data-testid="admin-invites-empty"
      />
    ) : (
      <EmptyState
        kind="filtered"
        icon={SearchX}
        title="No invites match these filters"
        description="Change the search or the filters."
        primaryAction={
          <Button data-testid="admin-invites-clear-filters" variant="secondary" onClick={() => replace({ q: null, status: null, server: null, page: null })}>
            Clear filters
          </Button>
        }
        data-testid="admin-invites-empty-filtered"
      />
    )

  return (
    <>
      <DataTable
        label="Invites"
        noun="invites"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        getRowHref={(row) => inviteRoute(row.id)}
        getRowName={(row) => `invite ${row.code}`}
        rowActions={(row) => [
          { id: "copy", label: "Copy link", icon: Copy, onSelect: () => void copy(row.code) },
          { id: "delete", label: "Delete...", icon: Trash2, variant: "destructive", onSelect: () => setDeleting(row) },
        ]}
        pagination={{ page, pageSize, total }}
        sort={sort}
        empty={empty}
        toolbar={
          <FilterBar
            search={{ param: "q", placeholder: "Search codes" }}
            filters={FILTERS}
            sort={{ param: "sort", options: MOBILE_SORTS }}
            resultCount={{ shown: total, total: all, noun: "invites" }}
            data-testid="admin-invites-filters"
          />
        }
        data-testid="admin-invites"
      />
      <DeleteInviteDialog invite={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </>
  )
}
