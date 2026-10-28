"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Bookmark, Trash2 } from "lucide-react"
import { useState } from "react"

import { deleteMyMark } from "@/actions/member-data"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { Time } from "@/components/ui/time"
import { useToast } from "@/components/ui/toast"
import type { MarkRow } from "@/lib/member/your-data"

const COLUMNS: ColumnDef<MarkRow>[] = [
  { id: "title", header: "Title", accessorKey: "title", meta: { card: "title" } },
  { id: "mark", header: "Mark", accessorKey: "mark", meta: { card: "field" } },
  { id: "markedAt", header: "Marked", cell: ({ row }) => <Time value={row.original.markedAt} />, meta: { card: "sub" } },
]

interface MarksTableProps {
  rows: MarkRow[]
  page: number
  pageSize: number
  total: number
}

/** The member's media marks, with Delete on each row (P11.15). */
export function MarksTable({ rows, page, pageSize, total }: MarksTableProps) {
  const toast = useToast()
  const [deleting, setDeleting] = useState<MarkRow | null>(null)

  return (
    <>
      <DataTable
        label="Your marks"
      size="narrow"
        noun="marks"
        columns={COLUMNS}
        data={rows}
        getRowId={(row) => row.id}
        getRowName={(row) => row.title}
        rowActions={(row) => [
          { id: "delete", label: "Delete...", icon: Trash2, variant: "destructive", onSelect: () => setDeleting(row), testId: `account-mark-delete-${row.id}` },
        ]}
        pagination={{ page, pageSize, total }}
        pageSizes={[pageSize]}
        empty={<EmptyState kind="first-use" icon={Bookmark} title="No marks" description="Titles you mark with /mark in Discord show here." />}
        data-testid="account-marks"
      />
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Delete your mark on ${deleting.title}?`}
          description="It leaves your marks here and in /mymarks."
          confirmLabel="Delete"
          pendingLabel="Deleting"
          tone="destructive"
          action={async () => {
            const result = await deleteMyMark({ markId: deleting.id })
            if (!result.success) return { error: result.error }
            toast.showSuccess("Mark deleted")
            return {}
          }}
          data-testid="account-mark-delete-dialog"
          confirmTestId="account-mark-delete-confirm"
        />
      )}
    </>
  )
}
