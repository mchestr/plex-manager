import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import type { ReactNode } from "react"

import { DataTable } from "@/components/ui/data-table/data-table"
import { Time } from "@/components/ui/time"
import { aiActivityConversation } from "@/lib/admin/routes"
import type { FindingRow } from "@/lib/data/conversation-findings"
import { FINDING_SEVERITY_LABEL, FINDING_STATUS_LABEL, FINDING_TYPE_LABEL } from "@/lib/ui/finding-labels"

const COLUMNS: ColumnDef<FindingRow>[] = [
  { id: "severity", header: "Severity", cell: ({ row }) => FINDING_SEVERITY_LABEL[row.original.severity], meta: { card: "field" } },
  { id: "type", header: "Type", cell: ({ row }) => FINDING_TYPE_LABEL[row.original.type], meta: { card: "title" } },
  {
    id: "claim",
    header: "Claim",
    // Judge text quotes conversations and tool output: plain text, one line
    cell: ({ row }) => (
      <span className="line-clamp-1 max-w-md wrap-anywhere" title={row.original.claim} data-testid={`findings-claim-${row.original.id}`}>
        {row.original.claim}
      </span>
    ),
    meta: { card: "sub" },
  },
  {
    id: "tool",
    header: "Tool",
    cell: ({ row }) => <span className="font-mono text-label">{row.original.tool ?? "—"}</span>,
    meta: { card: "field", priority: 3 },
  },
  {
    id: "conversation",
    header: "Conversation",
    cell: ({ row }) => (
      <Link
        href={aiActivityConversation(row.original.conversationId)}
        className="rounded-sm underline-offset-4 hover:underline"
        data-testid={`findings-conversation-${row.original.id}`}
      >
        Open conversation
      </Link>
    ),
    meta: { card: "field" },
  },
  { id: "date", header: "Date", cell: ({ row }) => <Time value={row.original.createdAt} />, meta: { card: "field" } },
  { id: "status", header: "Status", cell: ({ row }) => FINDING_STATUS_LABEL[row.original.status], meta: { card: "field" } },
  {
    id: "seen",
    header: "Seen",
    cell: ({ row }) => <span data-testid={`findings-seen-${row.original.id}`}>{row.original.seenCount}</span>,
    meta: { align: "end", card: "field" },
  },
]

interface FindingsTableProps {
  rows: FindingRow[]
  /** Findings matching the filters. */
  total: number
  page: number
  pageSize: number
  /** The Findings tab's filters. */
  toolbar: ReactNode
  empty: ReactNode
}

/**
 * Findings across conversations, newest first: one line of the claim, a link
 * to the conversation, and Seen, how many reviews raised the same finding.
 */
export function FindingsTable({ rows, total, page, pageSize, toolbar, empty }: FindingsTableProps) {
  return (
    <DataTable
      label="Findings"
      noun="findings"
      columns={COLUMNS}
      data={rows}
      getRowId={(row) => row.id}
      pagination={{ page, pageSize, total }}
      toolbar={toolbar}
      empty={empty}
      size="wide"
      data-testid="findings-table"
    />
  )
}
