"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Copy, FileText, Pencil, Sparkles, Trash2 } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table/data-table"
import type { RowAction } from "@/components/ui/data-table/row-actions"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { newStyleGuide, promptDetail, promptEdit } from "@/lib/admin/routes"
import type { PromptRow } from "@/lib/admin/prompts/queries"
import { useFormat } from "@/lib/format-context"
import type { BoundFormat } from "@/lib/utils/format"
import { STYLE_GUIDE_MAX_CHARS } from "@/lib/validations/prompt"

import { DeletePromptDialog, UseForRewindDialog } from "./prompt-dialogs"

function columns(f: BoundFormat): ColumnDef<PromptRow>[] {
  return [
    { id: "name", header: "Name", accessorKey: "name", meta: { mobile: "title" } },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge domain="prompt" value={row.original.status} />,
      meta: { mobile: "badges" },
    },
    { id: "version", header: "Version", cell: ({ row }) => `v${row.original.version}`, meta: { priority: 3 } },
    {
      id: "length",
      header: "Length",
      cell: ({ row }) =>
        row.original.status === "v2"
          ? f.number(row.original.length)
          : `${f.number(row.original.length)} of ${f.number(STYLE_GUIDE_MAX_CHARS)}`,
      meta: { mobile: "meta", priority: 2 },
    },
    { id: "updated", header: "Updated", cell: ({ row }) => f.date(row.original.updatedAt), meta: { mobile: "sub" } },
    { id: "updatedBy", header: "Updated by", cell: ({ row }) => row.original.updatedByName ?? "—", meta: { priority: 3 } },
  ]
}

interface PromptsTableProps {
  rows: PromptRow[]
  /** The season line for the activation confirm, or null outside the season. */
  seasonNote: string | null
}

type Pending = { kind: "activate" | "delete"; row: PromptRow } | null

/** The prompts list (P10.4): style guides and v2 templates with their state and row actions. */
export function PromptsTable({ rows, seasonNote }: PromptsTableProps) {
  const f = useFormat()
  const [pending, setPending] = useState<Pending>(null)
  const current = rows.find((row) => row.status === "inUse")?.name ?? null
  const close = (open: boolean) => !open && setPending(null)

  const actions = (row: PromptRow): RowAction[] => [
    row.status === "v2"
      ? { id: "copy", label: "Copy into a new style guide", icon: Copy, href: newStyleGuide(row.id) }
      : { id: "edit", label: "Edit", icon: Pencil, href: promptEdit(row.id) },
    ...(row.status === "notInUse"
      ? [{ id: "activate", label: "Use for Rewind...", icon: Sparkles, onSelect: () => setPending({ kind: "activate", row }) }]
      : []),
    {
      id: "delete",
      label: "Delete...",
      icon: Trash2,
      variant: "destructive",
      disabled: row.status === "inUse",
      onSelect: () => setPending({ kind: "delete", row }),
    },
  ]

  return (
    <>
      <DataTable
        label="Prompts"
        noun="prompts"
        columns={columns(f)}
        data={rows}
        getRowId={(row) => row.id}
        getRowHref={(row) => promptDetail(row.id)}
        getRowName={(row) => row.name}
        rowActions={actions}
        pagination={{ page: 1, pageSize: Math.max(rows.length, 1), total: rows.length }}
        empty={
          <EmptyState
            kind="first-use"
            icon={FileText}
            title="No style guides yet"
            description="A style guide sets the voice of every member's Rewind."
            primaryAction={
              <Button data-testid="admin-prompts-new-style-guide" nativeButton={false} render={<Link href={newStyleGuide()} />}>
                New style guide
              </Button>
            }
          />
        }
        data-testid="admin-prompts"
      />
      {pending?.kind === "activate" && (
        <UseForRewindDialog prompt={pending.row} current={current} seasonNote={seasonNote} open onOpenChange={close} />
      )}
      {pending?.kind === "delete" && <DeletePromptDialog prompt={pending.row} open onOpenChange={close} />}
    </>
  )
}
