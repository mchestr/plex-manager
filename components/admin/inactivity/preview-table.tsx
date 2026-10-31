"use client"

import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"

import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { userDetail } from "@/lib/admin/routes"
import type { InactivityPreviewRow } from "@/lib/data/inactivity-preview"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import type { BoundFormat } from "@/lib/utils/format"

/** A day in the app zone, as the server renders it. */
function Day({ value, testId }: { value: Date; testId: string }) {
  const f = useFormat()
  return (
    <time dateTime={value.toISOString()} className="whitespace-nowrap" data-testid={testId}>
      {f.date(value)}
    </time>
  )
}

function columns(f: BoundFormat, now: number): ColumnDef<InactivityPreviewRow>[] {
  return [
    {
      id: "member",
      header: "Member",
      cell: ({ row }) => (
        <Link
          href={userDetail(row.original.id)}
          className="rounded-sm font-medium text-foreground hover:underline"
          data-testid={`admin-inactivity-member-${row.original.id}`}
        >
          {row.original.name}
        </Link>
      ),
      meta: { card: "title" },
    },
    {
      id: "lastSeen",
      header: "Last seen",
      cell: ({ row }) =>
        row.original.lastSeenAt ? <Day value={row.original.lastSeenAt} testId={`admin-inactivity-last-seen-${row.original.id}-timestamp`} /> : "Never",
      meta: { card: "field" },
    },
    {
      id: "joined",
      header: "Joined",
      cell: ({ row }) => <Day value={row.original.createdAt} testId={`admin-inactivity-joined-${row.original.id}-timestamp`} />,
      meta: { card: "field" },
    },
    {
      id: "lastActive",
      header: "Last active",
      cell: ({ row }) => <span className="whitespace-nowrap">{f.relative(row.original.lastActiveAt, now)}</span>,
      meta: { card: "field" },
    },
  ]
}

interface PreviewTableProps {
  rows: InactivityPreviewRow[]
  /** A read of Tautulli has worked, so an empty list means no one is inactive. */
  read: boolean
  /** The server's clock at render, so "8 months ago" reads the same on the server and the client. */
  now: number
}

/** The members a run would remove now, the longest inactive first, each linked to their page. */
export function PreviewTable({ rows, read, now }: PreviewTableProps) {
  const f = useFormat()
  return (
    <DataTable
      label="Members a run would remove"
      noun="members"
      columns={columns(f, now)}
      data={rows}
      getRowId={(row) => row.id}
      pagination={{ page: 1, pageSize: Math.max(rows.length, 1), total: rows.length }}
      empty={
        read ? (
          <EmptyState kind="first-use" icon={icons.inactivity} title="No inactive members" data-testid="admin-inactivity-preview-empty" />
        ) : (
          <EmptyState
            kind="first-use"
            icon={icons.inactivity}
            title="Tautulli has not been read yet"
            description="Run now reads last seen from Tautulli. The daily run does too."
            data-testid="admin-inactivity-preview-unread"
          />
        )
      }
      data-testid="admin-inactivity-preview"
    />
  )
}
