"use client"

import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"

import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { userDetail } from "@/lib/admin/routes"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"

export interface InviteUsageRow {
  id: string
  usedAt: Date
  user: { id: string; name: string | null; email: string | null }
}

/**
 * Who joined with an invite, newest first (P10.1): each member links to
 * their detail page (UI-06), and the time carries the server zone.
 */
export function InviteUsageTable({ usages }: { usages: InviteUsageRow[] }) {
  const f = useFormat()
  const columns: ColumnDef<InviteUsageRow>[] = [
    {
      id: "member",
      header: "Member",
      cell: ({ row }) => (
        <Link data-testid={`admin-invite-usage-member-${row.original.user.id}`} href={userDetail(row.original.user.id)} className="rounded-sm font-medium text-foreground hover:underline">
          {row.original.user.name || row.original.user.email || "Unknown member"}
        </Link>
      ),
      meta: { mobile: "title" },
    },
    { id: "email", header: "Email", cell: ({ row }) => row.original.user.email ?? "–", meta: { mobile: "sub", priority: 2 } },
    {
      id: "usedAt",
      header: "Joined",
      cell: ({ row }) => f.dateTime(row.original.usedAt, { zoneLabel: true }),
      meta: { mobile: "meta" },
    },
  ]

  return (
    <DataTable
      label="Members who joined with this invite"
      noun="members"
      columns={columns}
      data={usages}
      getRowId={(row) => row.id}
      pagination={{ page: 1, pageSize: Math.max(usages.length, 1), total: usages.length }}
      empty={
        <EmptyState
          kind="first-use"
          icon={icons.users}
          title="No one has joined yet"
          description="Members who join with this invite show here."
          data-testid="admin-invite-usage-empty"
        />
      }
      data-testid="admin-invite-usage"
    />
  )
}
