"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Pencil, Trash2 } from "lucide-react"
import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { MarkdownBody } from "@/components/ui/markdown-body"
import { StatusBadge } from "@/components/ui/status-badge"
import type { AdminAnnouncementRow } from "@/lib/admin/announcements"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import type { BoundFormat } from "@/lib/utils/format"

import { VisibilitySwitch } from "./visibility-switch"

function columns(f: BoundFormat, onEdit: (row: AdminAnnouncementRow) => void): ColumnDef<AdminAnnouncementRow>[] {
  return [
    {
      id: "title",
      header: "Title",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onEdit(row.original)}
          className="rounded-sm text-left font-medium text-foreground underline-offset-4 hover:underline"
          data-testid={`edit-announcement-${row.original.id}`}
        >
          {row.original.title}
        </button>
      ),
      meta: { mobile: "title" },
    },
    {
      id: "preview",
      header: "Preview",
      cell: ({ row }) => (
        <MarkdownBody className="line-clamp-3 max-w-md text-ui text-muted-foreground [--typeset-flow:0.25em]">
          {row.original.content}
        </MarkdownBody>
      ),
      meta: { mobile: "sub", priority: 2 },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <span className="flex flex-wrap gap-1.5">
          <StatusBadge domain="announcement" value={row.original.status} />
          {row.original.priority > 0 && <Badge variant="info">Priority {row.original.priority}</Badge>}
        </span>
      ),
      meta: { mobile: "badges" },
    },
    {
      id: "visible",
      header: "Visible on home page",
      cell: ({ row }) => <VisibilitySwitch id={row.original.id} title={row.original.title} isActive={row.original.isActive} />,
      meta: { mobile: "meta" },
    },
    {
      id: "expires",
      header: "Expires",
      cell: ({ row }) => (row.original.expiresAt ? f.date(row.original.expiresAt) : "Never"),
      meta: { priority: 3 },
    },
    { id: "created", header: "Created", cell: ({ row }) => f.date(row.original.createdAt), meta: { priority: 3 } },
  ]
}

interface AnnouncementsTableProps {
  rows: AdminAnnouncementRow[]
  onEdit: (row: AdminAnnouncementRow) => void
  onDelete: (row: AdminAnnouncementRow) => void
  /** The empty state's "New announcement" button. */
  createAction: ReactNode
}

/** Every announcement (P10.5): a rendered preview, the state, the home switch, and Edit and Delete. */
export function AnnouncementsTable({ rows, onEdit, onDelete, createAction }: AnnouncementsTableProps) {
  const f = useFormat()
  return (
    <DataTable
      label="Announcements"
      noun="announcements"
      columns={columns(f, onEdit)}
      data={rows}
      getRowId={(row) => row.id}
      getRowName={(row) => row.title}
      rowActions={(row) => [
        { id: "edit", label: "Edit", icon: Pencil, onSelect: () => onEdit(row) },
        { id: "delete", label: "Delete...", icon: Trash2, variant: "destructive", onSelect: () => onDelete(row) },
      ]}
      pagination={{ page: 1, pageSize: Math.max(rows.length, 1), total: rows.length }}
      empty={
        <EmptyState
          kind="first-use"
          icon={icons.announcements}
          title="No announcements yet"
          description="Announcements show on every member's home page."
          primaryAction={createAction}
          data-testid="announcements-empty-state"
        />
      }
      data-testid="admin-announcements"
    />
  )
}
