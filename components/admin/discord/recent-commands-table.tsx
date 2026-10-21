"use client"

import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"

import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { Time } from "@/components/ui/time"
import { userDetail } from "@/lib/admin/routes"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import type { StatusValue } from "@/lib/ui/status"
import type { BoundFormat } from "@/lib/utils/format"

export interface RecentCommand {
  id: string
  discordUsername: string | null
  discordUserId: string
  userId: string | null
  commandName: string
  status: StatusValue<"discordCommand">
  responseTimeMs: number | null
  createdAt: string
}

/** The member's Discord name, linked to their admin page when the account is linked (UI-06). */
export function DiscordMember({ name, userId }: { name: string; userId: string | null }) {
  if (!userId) return <span className="text-foreground">{name}</span>
  return (
    <Link href={userDetail(userId)} className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline">
      {name}
    </Link>
  )
}

function columns(f: BoundFormat): ColumnDef<RecentCommand>[] {
  return [
    {
      id: "member",
      header: "Member",
      cell: ({ row }) => (
        <DiscordMember name={row.original.discordUsername ?? row.original.discordUserId} userId={row.original.userId} />
      ),
      meta: { mobile: "title" },
    },
    {
      id: "command",
      header: "Command",
      cell: ({ row }) => <span className="font-mono text-ui">{row.original.commandName}</span>,
      meta: { mobile: "sub" },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge domain="discordCommand" value={row.original.status} />,
      meta: { mobile: "badges" },
    },
    {
      id: "response",
      header: "Response time",
      cell: ({ row }) => (row.original.responseTimeMs === null ? "—" : `${f.number(row.original.responseTimeMs)} ms`),
      meta: { align: "end", priority: 3 },
    },
    { id: "when", header: "When", cell: ({ row }) => <Time value={row.original.createdAt} />, meta: { mobile: "meta" } },
  ]
}

/** The latest bot commands (P10.5): who ran what, how it went and how fast. */
export function RecentCommandsTable({ rows, total }: { rows: RecentCommand[]; total: number }) {
  const f = useFormat()
  return (
    <DataTable
      label="Recent commands"
      noun="commands"
      columns={columns(f)}
      data={rows}
      getRowId={(row) => row.id}
      pagination={{ page: 1, pageSize: Math.max(rows.length, 1), total: rows.length }}
      toolbar={<p className="text-label text-muted-foreground">{f.number(total)} commands logged in all</p>}
      empty={
        <EmptyState
          kind="first-use"
          icon={icons.discordBot}
          title="No commands yet"
          description="Commands members run in Discord show here."
        />
      }
      data-testid="discord-recent-commands"
    />
  )
}
