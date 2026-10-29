"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Users } from "lucide-react"

import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusBadge } from "@/components/ui/status-badge"
import type { AffiliateState } from "@/lib/admin/affiliates/rows"
import type { AffiliateRow } from "@/lib/data/affiliates"
import { useFormat } from "@/lib/format-context"

import { OverrideDialog, RevokeDialog } from "./affiliate-dialogs"
import { FlagBadges, MemberCell } from "./member-cell"
import { OpenInvitesDialog } from "./open-invites-dialog"

const STATE: Record<AffiliateState, { label: string; tone: "success" | "warning" | "neutral" }> = {
  active: { label: "Active", tone: "success" },
  paid: { label: "Paused while paid", tone: "warning" },
  override_zero: { label: "Paused (0 invites)", tone: "neutral" },
}

/** Approved affiliates. Only admins see Set invites, Revoke and the open invites. */
export function AffiliatesTable({ rows, admin }: { rows: AffiliateRow[]; admin: boolean }) {
  const f = useFormat()

  const columns: ColumnDef<AffiliateRow>[] = [
    { id: "member", header: "Member", cell: ({ row }) => <MemberCell member={row.original.member} linked={admin} />, meta: { card: "title" } },
    {
      id: "allowance",
      header: "Invites per 30 days",
      cell: ({ row }) => (
        <span className="flex flex-col" data-testid={`admin-affiliates-allowance-${row.original.id}`}>
          <span className="tabular-nums">{row.original.allowance.invites}</span>
          <span className="text-label text-muted-foreground">{row.original.allowance.source === "override" ? "Set by an admin" : "From their tier"}</span>
        </span>
      ),
      meta: { card: "field" },
    },
    {
      id: "used",
      header: "Used",
      cell: ({ row }) => (
        <span className="tabular-nums" data-testid={`admin-affiliates-used-${row.original.id}`}>
          {row.original.slotsUsed} of {row.original.allowance.invites}
        </span>
      ),
      meta: { card: "field" },
    },
    { id: "joins", header: "Joined", cell: ({ row }) => f.number(row.original.totalJoins), meta: { card: "field", align: "end" } },
    { id: "expired", header: "Expired unused", cell: ({ row }) => f.number(row.original.expiredUnused), meta: { card: "field", align: "end", priority: 3 } },
    {
      id: "state",
      header: "State",
      cell: ({ row }) => <StatusBadge tone={STATE[row.original.state].tone} label={STATE[row.original.state].label} data-testid={`admin-affiliates-state-${row.original.id}`} />,
      meta: { card: "field" },
    },
    {
      id: "flags",
      header: "Flags",
      cell: ({ row }) => <FlagBadges flags={row.original.flags} testId={`admin-affiliates-flags-${row.original.id}`} />,
      meta: { card: "field" },
    },
  ]
  if (admin) {
    columns.push({
      id: "manage",
      header: "Manage",
      cell: ({ row }) => {
        const target = { id: row.original.id, name: row.original.member.name }
        return (
          <span className="flex flex-wrap gap-2">
            <OpenInvitesDialog name={target.name} invites={row.original.openInvites ?? []} testId={`admin-affiliates-invites-${target.id}`} />
            <OverrideDialog affiliate={target} current={row.original.inviteOverride} />
            <RevokeDialog affiliate={target} />
          </span>
        )
      },
      meta: { card: "field" },
    })
  }

  return (
    <DataTable
      label="Affiliates"
      noun="affiliates"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      pagination={{ page: 1, pageSize: Math.max(rows.length, 1), total: rows.length }}
      size="wide"
      empty={<EmptyState kind="first-use" icon={Users} title="No affiliates" data-testid="admin-affiliates-affiliates-empty" />}
      data-testid="admin-affiliates-affiliates"
    />
  )
}
