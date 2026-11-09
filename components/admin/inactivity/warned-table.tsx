"use client"

import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { userDetail } from "@/lib/admin/routes"
import type { CannotEmailRow, FirstWarningRow, WaitingRow } from "@/lib/data/inactivity-preview"
import { useFormat } from "@/lib/format-context"
import { CANNOT_EMAIL_LABELS, noticeStageLabel, noticeStatusLabel } from "@/lib/inactivity/notice-labels"
import { icons } from "@/lib/ui/icons"
import type { BoundFormat } from "@/lib/utils/format"

/** The member's name, linked to their page. `list` keeps the test ids apart when a member is in two tables. */
function Member({ id, name, list }: { id: string; name: string; list: string }) {
  return (
    <Link href={userDetail(id)} className="rounded-sm font-medium text-foreground hover:underline" data-testid={`admin-inactivity-${list}-member-${id}`}>
      {name}
    </Link>
  )
}

/** A removal date: a calendar day in the member's zone, not an instant. */
function RemovalDay({ day, testId }: { day: string; testId: string }) {
  const f = useFormat()
  return (
    <time dateTime={day} className="whitespace-nowrap" data-testid={testId}>
      {f.dayKey(day)}
    </time>
  )
}

const LIST_LABELS: Record<CannotEmailRow["list"], string> = {
  waiting: "Waiting for their date",
  first: "First warning at the next run",
}

function waitingColumns(f: BoundFormat): ColumnDef<WaitingRow>[] {
  return [
    { id: "member", header: "Member", cell: ({ row }) => <Member {...row.original} list="waiting" />, meta: { card: "title" } },
    {
      id: "removal",
      header: "Removal date",
      cell: ({ row }) => <RemovalDay day={row.original.removalDay} testId={`admin-inactivity-waiting-date-${row.original.id}`} />,
      meta: { card: "field" },
    },
    {
      id: "last",
      header: "Last email",
      cell: ({ row }) => {
        const { last } = row.original
        if (!last) return "None"
        return (
          <span className="flex flex-col">
            <span>{noticeStageLabel(last)}</span>
            <span className="text-caption text-muted-foreground">{f.date(last.at)}</span>
          </span>
        )
      },
      meta: { card: "field" },
    },
    {
      id: "status",
      header: "Email status",
      cell: ({ row }) => (row.original.last ? noticeStatusLabel(row.original.last) : "None"),
      meta: { card: "field" },
    },
  ]
}

function firstColumns(f: BoundFormat, now: number): ColumnDef<FirstWarningRow>[] {
  return [
    { id: "member", header: "Member", cell: ({ row }) => <Member {...row.original} list="first" />, meta: { card: "title" } },
    {
      id: "removal",
      header: "Removal on or after",
      cell: ({ row }) => <RemovalDay day={row.original.removalDay} testId={`admin-inactivity-first-date-${row.original.id}`} />,
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

const cannotEmailColumns: ColumnDef<CannotEmailRow>[] = [
  { id: "member", header: "Member", cell: ({ row }) => <Member {...row.original} list="cannot-email" />, meta: { card: "title" } },
  {
    id: "reason",
    header: "Why",
    cell: ({ row }) => (
      <span className="flex flex-wrap items-center gap-2">
        <Badge variant="warning" data-testid={`admin-inactivity-cannot-email-reason-${row.original.id}`}>
          {CANNOT_EMAIL_LABELS[row.original.code]}
        </Badge>
        <span className="font-mono text-caption text-muted-foreground">{row.original.code}</span>
      </span>
    ),
    meta: { card: "field" },
  },
  { id: "list", header: "List", cell: ({ row }) => LIST_LABELS[row.original.list], meta: { card: "field" } },
]

const NO_ROWS = <EmptyState kind="first-use" icon={icons.inactivity} title="No members" />

/** Members with an open warning, the soonest removal date first, with their newest email and its status. */
export function WaitingTable({ rows }: { rows: WaitingRow[] }) {
  const f = useFormat()
  return (
    <DataTable
      label="Members waiting for their removal date"
      noun="members"
      columns={waitingColumns(f)}
      data={rows}
      getRowId={(row) => row.id}
      pagination={{ page: 1, pageSize: Math.max(rows.length, 1), total: rows.length }}
      empty={NO_ROWS}
      data-testid="admin-inactivity-waiting"
    />
  )
}

/** Members the next daily run warns first, the longest inactive first, with the date that warning names. */
export function FirstWarningTable({ rows, now }: { rows: FirstWarningRow[]; now: number }) {
  const f = useFormat()
  return (
    <DataTable
      label="Members the next run warns first"
      noun="members"
      columns={firstColumns(f, now)}
      data={rows}
      getRowId={(row) => row.id}
      pagination={{ page: 1, pageSize: Math.max(rows.length, 1), total: rows.length }}
      empty={NO_ROWS}
      data-testid="admin-inactivity-first"
    />
  )
}

/** Members of the two lists whom the app cannot email, with the reason code, never the address. */
export function CannotEmailTable({ rows }: { rows: CannotEmailRow[] }) {
  return (
    <DataTable
      label="Members the app cannot email"
      noun="members"
      columns={cannotEmailColumns}
      data={rows}
      getRowId={(row) => row.id}
      pagination={{ page: 1, pageSize: Math.max(rows.length, 1), total: rows.length }}
      empty={NO_ROWS}
      data-testid="admin-inactivity-cannot-email"
    />
  )
}
