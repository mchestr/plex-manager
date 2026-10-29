"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Inbox } from "lucide-react"

import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import type { ApplicationRow } from "@/lib/data/affiliates"
import { useFormat } from "@/lib/format-context"

import { ApproveDialog, RefuseDialog } from "./affiliate-dialogs"
import { FlagBadges, MemberCell } from "./member-cell"

/** Pending applications. Only admins see Approve and Refuse. */
export function ApplicationsTable({ rows, admin }: { rows: ApplicationRow[]; admin: boolean }) {
  const f = useFormat()

  const columns: ColumnDef<ApplicationRow>[] = [
    { id: "member", header: "Member", cell: ({ row }) => <MemberCell member={row.original.member} linked={admin} />, meta: { card: "title" } },
    {
      id: "hours",
      header: "Watch hours",
      cell: ({ row }) =>
        row.original.watchHours === null ? (
          "Not read"
        ) : (
          <span className="flex flex-col">
            <span className="tabular-nums">{f.number(Math.round(row.original.watchHours))} h</span>
            {row.original.watchHoursReadAt && <span className="text-label text-muted-foreground">Read {f.date(row.original.watchHoursReadAt)}</span>}
          </span>
        ),
      meta: { card: "field" },
    },
    { id: "since", header: "Member since", cell: ({ row }) => f.date(row.original.memberSince), meta: { card: "field" } },
    { id: "applied", header: "Applied", cell: ({ row }) => f.date(row.original.appliedAt), meta: { card: "field", priority: 3 } },
    { id: "note", header: "Note", cell: ({ row }) => row.original.note ?? "None", meta: { card: "field" } },
    {
      id: "flags",
      header: "Flags",
      cell: ({ row }) => <FlagBadges flags={row.original.flags} testId={`admin-affiliates-application-flags-${row.original.id}`} />,
      meta: { card: "field" },
    },
  ]
  if (admin) {
    columns.push({
      id: "decide",
      header: "Decision",
      cell: ({ row }) => (
        <span className="flex gap-2">
          <ApproveDialog application={{ id: row.original.id, name: row.original.member.name }} />
          <RefuseDialog application={{ id: row.original.id, name: row.original.member.name }} />
        </span>
      ),
      meta: { card: "field" },
    })
  }

  return (
    <DataTable
      label="Applications"
      noun="applications"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      pagination={{ page: 1, pageSize: Math.max(rows.length, 1), total: rows.length }}
      size="wide"
      empty={<EmptyState kind="first-use" icon={Inbox} title="No applications" data-testid="admin-affiliates-applications-empty" />}
      data-testid="admin-affiliates-applications"
    />
  )
}
