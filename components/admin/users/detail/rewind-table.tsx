"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Eye, History, RefreshCw, Sparkles, Undo2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { getRewindRollbackTarget } from "@/actions/admin/rewind-season"
import { adminRegenerateRewind } from "@/actions/rewind-generation"
import { RollbackDialog } from "@/components/admin/rewind/rollback-dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DataTable } from "@/components/ui/data-table/data-table"
import type { RowAction } from "@/components/ui/data-table/row-actions"
import { EmptyState } from "@/components/ui/empty-state"
import { useToast } from "@/components/ui/toast"
import { rewindHistory, userRewind } from "@/lib/admin/routes"
import type { RewindRowState } from "@/lib/admin/user-detail-tabs"

import { RewindStateBadge } from "./rewind-state-badge"

/** One year, with its times and counts already formatted on the server. */
export interface RewindTableRow {
  wrappedId: string
  year: number
  state: RewindRowState
  edition: string
  generated: string
  shared: boolean
  visits: string
  canRollBack: boolean
  canRegenerate: boolean
  versions: { id: string; label: string }[]
}

const COLUMNS: ColumnDef<RewindTableRow>[] = [
  { id: "year", header: "Year", accessorKey: "year", meta: { mobile: "title" } },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => <RewindStateBadge state={row.original.state} data-testid={`admin-user-rewind-status-${row.original.year}`} />,
    meta: { mobile: "badges" },
  },
  { id: "edition", header: "Edition", accessorKey: "edition", meta: { mobile: "meta" } },
  { id: "generated", header: "Generated", accessorKey: "generated", meta: { mobile: "sub" } },
  { id: "share", header: "Share", cell: ({ row }) => (row.original.shared ? "On" : "Off"), meta: { priority: 3 } },
  { id: "visits", header: "Visits", accessorKey: "visits", meta: { align: "end", priority: 3 } },
]

interface RewindTableProps {
  userId: string
  name: string
  rows: RewindTableRow[]
  /** The Regenerate confirm's cost line (P7.8's estimate). */
  estimateCopy: string
}

/** The Rewind tab's table: Preview, the version history pages, Roll back and Regenerate (P10.6). */
export function RewindTable({ userId, name, rows, estimateCopy }: RewindTableProps) {
  const toast = useToast()
  const router = useRouter()
  const [rollback, setRollback] = useState<{ year: number; from: string | null } | null>(null)
  const [regenerate, setRegenerate] = useState<number | null>(null)

  const askRollback = async (year: number) => {
    const result = await getRewindRollbackTarget({ userId, year })
    if (!result.success) {
      toast.showError(result.error)
      return
    }
    setRollback({ year, from: result.data.from })
  }

  const actionsFor = (row: RewindTableRow): RowAction[] => [
    { id: "preview", label: "Preview", icon: Eye, href: userRewind(userId, row.year) },
    ...row.versions.map((version) => ({ id: `version-${version.id}`, label: version.label, icon: History, href: rewindHistory(row.wrappedId, version.id) })),
    ...(row.canRegenerate ? [{ id: "regenerate", label: "Regenerate...", icon: RefreshCw, onSelect: () => setRegenerate(row.year) }] : []),
    ...(row.canRollBack
      ? [{ id: "rollback", label: "Roll back...", icon: Undo2, variant: "destructive" as const, onSelect: () => void askRollback(row.year) }]
      : []),
  ]

  return (
    <>
      <DataTable
        label={`${name}'s Rewind years`}
        noun="years"
        columns={COLUMNS}
        data={rows}
        getRowId={(row) => String(row.year)}
        getRowHref={(row) => userRewind(userId, row.year)}
        getRowName={(row) => String(row.year)}
        rowActions={actionsFor}
        pagination={{ page: 1, pageSize: Math.max(rows.length, 1), total: rows.length }}
        empty={<EmptyState kind="first-use" icon={Sparkles} title="No Rewind yet" description="This member's Rewind years show here once one is generated." />}
        data-testid="admin-user-rewind"
      />
      {rollback && (
        <RollbackDialog
          userId={userId}
          year={rollback.year}
          name={name}
          from={rollback.from}
          open
          onOpenChange={(open) => !open && setRollback(null)}
        />
      )}
      {regenerate !== null && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRegenerate(null)}
          title={`Regenerate ${name}'s Rewind ${regenerate}?`}
          description={`A new run replaces the current version when it finishes. ${estimateCopy}`.trim()}
          confirmLabel="Regenerate"
          pendingLabel="Starting"
          action={async () => {
            const result = await adminRegenerateRewind({ userId, year: regenerate })
            if (!result.success) return { error: result.error }
            toast.showSuccess(result.data.alreadyQueued ? `${name}'s Rewind is already generating` : `Regenerating ${name}'s Rewind`)
            router.refresh()
            return {}
          }}
          data-testid="admin-user-regenerate-dialog"
          confirmTestId="admin-user-regenerate-confirm"
        />
      )}
    </>
  )
}
