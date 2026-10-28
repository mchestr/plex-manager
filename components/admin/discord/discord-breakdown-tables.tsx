"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { Time } from "@/components/ui/time"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"

import { DiscordMember } from "./recent-commands-table"
import { COMMAND_TYPE_LABELS } from "./specs"

const onePage = (rows: unknown[]) => ({ page: 1, pageSize: Math.max(rows.length, 1), total: rows.length })

const noCommands = (
  <EmptyState kind="first-use" icon={icons.discordBot} title="No commands in this period" description="Pick a longer period above." />
)

interface ActiveMember {
  discordUserId: string
  discordUsername: string | null
  userId: string | null
  commandCount: number
  lastActiveAt: Date
}

/** The period's most active members, linked to their admin pages. */
export function ActiveMembersTable({ rows }: { rows: ActiveMember[] }) {
  const f = useFormat()
  const columns: ColumnDef<ActiveMember>[] = [
    {
      id: "member",
      header: "Member",
      cell: ({ row }) => <DiscordMember name={row.original.discordUsername ?? row.original.discordUserId} userId={row.original.userId} />,
      meta: { card: "title" },
    },
    { id: "commands", header: "Commands", cell: ({ row }) => f.number(row.original.commandCount), meta: { align: "end", card: "field" } },
    { id: "last", header: "Last active", cell: ({ row }) => <Time value={row.original.lastActiveAt} />, meta: { card: "sub" } },
  ]
  return (
    <DataTable
      label="Most active members"
      size="narrow"
      noun="members"
      columns={columns}
      data={rows}
      getRowId={(row) => row.discordUserId}
      pagination={onePage(rows)}
      empty={noCommands}
      data-testid="discord-active-members"
    />
  )
}

interface CommandTypeRow {
  type: string
  count: number
}

/** Commands by type with their share of the period, largest first. */
export function CommandTypesTable({ rows, total }: { rows: CommandTypeRow[]; total: number }) {
  const f = useFormat()
  const sorted = [...rows].sort((a, b) => b.count - a.count)
  const columns: ColumnDef<CommandTypeRow>[] = [
    { id: "type", header: "Type", cell: ({ row }) => COMMAND_TYPE_LABELS[row.original.type] ?? row.original.type, meta: { card: "title" } },
    { id: "count", header: "Commands", cell: ({ row }) => f.number(row.original.count), meta: { align: "end", card: "field" } },
    {
      id: "share",
      header: "Share",
      cell: ({ row }) => (total > 0 ? f.percent(row.original.count / total) : "—"),
      meta: { align: "end", card: "field" },
    },
  ]
  return (
    <DataTable
      label="Commands by type"
      size="narrow"
      noun="types"
      columns={columns}
      data={sorted}
      getRowId={(row) => row.type}
      pagination={onePage(sorted)}
      empty={noCommands}
      data-testid="discord-command-types"
    />
  )
}
