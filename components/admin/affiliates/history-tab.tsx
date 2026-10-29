"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { History, ShieldCheck } from "lucide-react"

import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusBadge } from "@/components/ui/status-badge"
import type { BlockRow, HistoryRow } from "@/lib/data/affiliate-history"
import { useFormat } from "@/lib/format-context"

import { UnblockDialog } from "./affiliate-dialogs"
import { MemberCell } from "./member-cell"

const STATUS: Record<HistoryRow["status"], { label: string; tone: "destructive" | "warning" | "neutral" }> = {
  REFUSED: { label: "Refused", tone: "warning" },
  REVOKED: { label: "Revoked", tone: "destructive" },
  ENDED: { label: "Ended", tone: "neutral" },
  CLOSED: { label: "Closed", tone: "neutral" },
  PENDING: { label: "Pending", tone: "neutral" },
  APPROVED: { label: "Approved", tone: "neutral" },
}

const CAUSE: Record<NonNullable<HistoryRow["endCause"]>, string> = {
  DISABLED: "Account disabled",
  REMOVED: "Member removed",
  UNSHARED: "Plex access removed",
  ACCESS_REVOKED: "Subscription ended",
}

/** Past applications with their reasons, and the block list (admins only). */
export function HistoryTab({ applications, blocks }: { applications: HistoryRow[]; blocks: BlockRow[] }) {
  const f = useFormat()

  const applicationColumns: ColumnDef<HistoryRow>[] = [
    { id: "member", header: "Member", cell: ({ row }) => <MemberCell member={row.original.member} linked />, meta: { card: "title" } },
    {
      id: "status",
      header: "Result",
      cell: ({ row }) => <StatusBadge tone={STATUS[row.original.status].tone} label={STATUS[row.original.status].label} />,
      meta: { card: "field" },
    },
    {
      id: "reason",
      header: "Reason",
      cell: ({ row }) => row.original.reason ?? (row.original.endCause ? CAUSE[row.original.endCause] : "None"),
      meta: { card: "field" },
    },
    { id: "at", header: "Date", cell: ({ row }) => (row.original.at ? f.date(row.original.at) : "Not known"), meta: { card: "field" } },
  ]

  const blockColumns: ColumnDef<BlockRow>[] = [
    { id: "hash", header: "Account", cell: ({ row }) => <span className="font-mono">{row.original.hashPrefix}</span>, meta: { card: "title" } },
    { id: "created", header: "Blocked", cell: ({ row }) => f.date(row.original.createdAt), meta: { card: "field" } },
    { id: "by", header: "By", cell: ({ row }) => row.original.createdBy, meta: { card: "field" } },
    { id: "unblock", header: "Unblock", cell: ({ row }) => <UnblockDialog blockId={row.original.id} />, meta: { card: "field" } },
  ]

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" aria-labelledby="admin-affiliates-history-heading">
        <h2 id="admin-affiliates-history-heading" className="text-h3">
          Past applications
        </h2>
        <DataTable
          label="Past applications"
          noun="applications"
          columns={applicationColumns}
          data={applications}
          getRowId={(row) => row.id}
          pagination={{ page: 1, pageSize: Math.max(applications.length, 1), total: applications.length }}
          empty={<EmptyState kind="first-use" icon={History} title="No past applications" data-testid="admin-affiliates-history-empty" />}
          data-testid="admin-affiliates-history"
        />
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="admin-affiliates-blocks-heading">
        <h2 id="admin-affiliates-blocks-heading" className="text-h3">
          Blocked accounts
        </h2>
        <p className="text-ui text-muted-foreground">Affiliate invites refuse these Plex accounts. Only a part of each hash shows.</p>
        <DataTable
          label="Blocked accounts"
          noun="blocked accounts"
          columns={blockColumns}
          data={blocks}
          getRowId={(row) => row.id}
          pagination={{ page: 1, pageSize: Math.max(blocks.length, 1), total: blocks.length }}
          size="narrow"
          empty={<EmptyState kind="first-use" icon={ShieldCheck} title="No blocked accounts" data-testid="admin-affiliates-blocks-empty" />}
          data-testid="admin-affiliates-blocks"
        />
      </section>
    </div>
  )
}
