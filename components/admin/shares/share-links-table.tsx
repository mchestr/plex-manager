"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Link2 } from "lucide-react"

import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusBadge } from "@/components/ui/status-badge"
import type { ShareLinkRow } from "@/lib/admin/analytics/shares"
import { userRewind } from "@/lib/admin/routes"
import { useFormat } from "@/lib/format-context"
import type { TableSort } from "@/lib/ui/table-params"
import type { BoundFormat } from "@/lib/utils/format"

function columns(f: BoundFormat): ColumnDef<ShareLinkRow>[] {
  return [
    { id: "member", header: "Member", accessorKey: "memberName", meta: { card: "title" } },
    { id: "year", header: "Year", accessorKey: "year", meta: { card: "sub" } },
    {
      id: "pages",
      header: "Pages published",
      cell: ({ row }) => f.number(row.original.pages),
      meta: { align: "end", priority: 3 },
    },
    {
      id: "created",
      header: "Created",
      enableSorting: true,
      cell: ({ row }) => f.date(row.original.createdAt),
      meta: { card: "field" },
    },
    {
      id: "expires",
      header: "Expires",
      enableSorting: true,
      cell: ({ row }) => (row.original.expiresAt ? f.date(row.original.expiresAt) : "Never"),
      meta: { priority: 3 },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge domain="share" value={row.original.status} />,
      meta: { card: "field" },
    },
    {
      id: "visits",
      header: "Visits",
      cell: ({ row }) => f.number(row.original.visits),
      meta: { align: "end", card: "field" },
    },
  ]
}

interface ShareLinksTableProps {
  rows: ShareLinkRow[]
  total: number
  page: number
  pageSize: number
  sort: TableSort
}

/**
 * Every public Rewind link (P10.2): the member's cell opens their Rewind for
 * that link's year (UI-06). No token or URL is shown.
 */
export function ShareLinksTable({ rows, total, page, pageSize, sort }: ShareLinksTableProps) {
  const f = useFormat()
  return (
    <DataTable
      label="Share links"
      noun="links"
      columns={columns(f)}
      data={rows}
      getRowId={(row) => row.id}
      getRowHref={(row) => userRewind(row.userId, row.year)}
      pagination={{ page, pageSize, total }}
      sort={sort}
      empty={
        <EmptyState
          kind="first-use"
          icon={Link2}
          title="No share links yet"
          description="Members create share links from their Rewind."
        />
      }
      data-testid="admin-shares"
    />
  )
}
