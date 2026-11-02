import type { ColumnDef } from "@tanstack/react-table"
import type { ReactNode } from "react"

import { DataTable } from "@/components/ui/data-table/data-table"
import { Time } from "@/components/ui/time"
import { aiActivity } from "@/lib/admin/routes"
import type { groupFindings } from "@/lib/data/conversation-findings"
import type { FindingSeverity } from "@/lib/generated/prisma/client"
import type { DayRange } from "@/lib/ui/date-range"
import { FINDING_TYPE_LABEL } from "@/lib/ui/finding-labels"

export type FindingGroup = Awaited<ReturnType<typeof groupFindings>>[number]

/** A group's row id: its type and tool, `none` for findings that name no tool. */
const groupId = (group: FindingGroup) => `${group.type}-${group.tool ?? "none"}`

const COLUMNS: ColumnDef<FindingGroup>[] = [
  { id: "type", header: "Type", cell: ({ row }) => FINDING_TYPE_LABEL[row.original.type], meta: { card: "title" } },
  {
    id: "tool",
    header: "Tool",
    cell: ({ row }) => <span className="font-mono text-label">{row.original.tool ?? "No tool"}</span>,
    meta: { card: "sub" },
  },
  {
    id: "open",
    header: "Open findings",
    cell: ({ row }) => <span data-testid={`findings-group-open-${groupId(row.original)}`}>{row.original.open}</span>,
    meta: { align: "end", card: "field" },
  },
  {
    id: "conversations",
    header: "Conversations",
    cell: ({ row }) => <span data-testid={`findings-group-conversations-${groupId(row.original)}`}>{row.original.conversations}</span>,
    meta: { align: "end", card: "field" },
  },
  { id: "latest", header: "Latest", cell: ({ row }) => <Time value={row.original.latest} />, meta: { card: "field" } },
]

interface FindingsGroupsProps {
  groups: FindingGroup[]
  /** The severity filter and range the groups were counted on, which a group's link keeps. */
  severity?: FindingSeverity
  range: DayRange | null
  toolbar: ReactNode
  empty: ReactNode
}

/**
 * The open backlog by type and tool, most open first: recurring gaps across
 * conversations. A row's link opens the list filtered to that group (a tool
 * of "" for findings that name none).
 */
export function FindingsGroups({ groups, severity, range, toolbar, empty }: FindingsGroupsProps) {
  return (
    <DataTable
      label="Open findings by type and tool"
      noun="groups"
      columns={COLUMNS}
      data={groups}
      getRowId={groupId}
      getRowHref={(group) =>
        aiActivity({ view: "findings", type: group.type, severity, tool: group.tool ?? "", from: range?.from, to: range?.to })
      }
      pagination={{ page: 1, pageSize: Math.max(groups.length, 1), total: groups.length }}
      toolbar={toolbar}
      empty={empty}
      data-testid="findings-groups"
    />
  )
}
