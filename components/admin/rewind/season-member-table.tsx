"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { RefreshCw, SearchX, Users } from "lucide-react"
import { useRouter } from "next/navigation"

import { adminRegenerateRewind } from "@/actions/rewind-generation"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterBar } from "@/components/ui/filter-bar"
import { StatusBadge } from "@/components/ui/status-badge"
import { useToast } from "@/components/ui/toast"
import { useFormat } from "@/lib/format-context"
import type { BoundFormat } from "@/lib/utils/format"
import type { SeasonMemberState } from "@/lib/wrapped/admin/season"
import type { SeasonMemberRow } from "@/lib/wrapped/admin/season-members"

const STATE_BADGE = {
  ready: { domain: "rewind", value: "ready" },
  generating: { domain: "rewind", value: "generating" },
  failed: { domain: "rewind", value: "failed" },
  notStarted: { domain: "rewind", value: "notStarted" },
} as const

function StateBadge({ state }: { state: SeasonMemberState }) {
  if (state === "stuck") return <StatusBadge tone="warning" label="Stuck" />
  return <StatusBadge {...STATE_BADGE[state]} sub="" />
}

const EDITIONS = [
  { value: "all", label: "All" },
  { value: "full", label: "Full" },
  { value: "pocket", label: "Pocket" },
  { value: "postcard", label: "Postcard" },
]

const COPY_SOURCES = [
  { value: "all", label: "All" },
  { value: "llm", label: "AI" },
  { value: "repair", label: "AI, repaired" },
  { value: "mixed", label: "Mixed" },
  { value: "template", label: "Template" },
]

const STATES = [
  { value: "all", label: "All" },
  { value: "ready", label: "Ready" },
  { value: "generating", label: "Generating" },
  { value: "failed", label: "Failed" },
  { value: "stuck", label: "Stuck" },
  { value: "notStarted", label: "Not started" },
]

const labelOf = (options: { value: string; label: string }[], value: string | null) =>
  value ? (options.find((o) => o.value === value)?.label ?? value) : "—"

function columns(f: BoundFormat, now: number): ColumnDef<SeasonMemberRow>[] {
  const when = (iso: string | null) => (iso ? f.relative(iso, now) : "—")
  return [
    { id: "name", header: "Name", accessorKey: "name", meta: { mobile: "title" } },
    { id: "state", header: "Status", cell: ({ row }) => <StateBadge state={row.original.state} />, meta: { mobile: "badges" } },
    { id: "edition", header: "Edition", cell: ({ row }) => labelOf(EDITIONS, row.original.edition), meta: { mobile: "meta" } },
    { id: "copy", header: "Copy", cell: ({ row }) => labelOf(COPY_SOURCES, row.original.copySource), meta: { mobile: "meta", priority: 3 } },
    { id: "facts", header: "Facts age", cell: ({ row }) => when(row.original.factsAt), meta: { priority: 3 } },
    { id: "generated", header: "Last generated", cell: ({ row }) => when(row.original.lastGeneratedAt), meta: { mobile: "sub" } },
    { id: "cost", header: "Cost", cell: ({ row }) => f.money(row.original.costUsd), meta: { align: "end", mobile: "meta" } },
    { id: "share", header: "Share", cell: ({ row }) => (row.original.shared ? "On" : "Off"), meta: { priority: 3 } },
    {
      id: "failure",
      header: "Failure",
      cell: ({ row }) => (row.original.failureCode ? <Badge variant="outline">{row.original.failureCode}</Badge> : null),
      meta: { mobile: "badges" },
    },
  ]
}

interface SeasonMemberTableProps {
  year: number
  rows: SeasonMemberRow[]
  total: number
  /** Members before the filters, for the result count. */
  members: number
  page: number
  pageSize: number
  filtered: boolean
  /** Server time of the render, so relative ages match on both sides. */
  now: number
}

/** The season's members (P7.8): URL-driven pages and filters, and Regenerate per row. */
export function SeasonMemberTable({ year, rows, total, members, page, pageSize, filtered, now }: SeasonMemberTableProps) {
  const f = useFormat()
  const toast = useToast()
  const router = useRouter()

  const regenerate = async (row: SeasonMemberRow) => {
    const result = await adminRegenerateRewind({ userId: row.id, year })
    if (!result.success) {
      toast.showError(result.error)
      return
    }
    toast.showSuccess(result.data.alreadyQueued ? `${row.name}'s Rewind is already generating` : `Regenerating ${row.name}'s Rewind`)
    router.refresh()
  }

  return (
    <DataTable
      label="Members"
      noun="members"
      columns={columns(f, now)}
      data={rows}
      getRowId={(row) => row.id}
      getRowName={(row) => row.name}
      rowActions={(row) => [
        {
          id: "regenerate",
          label: row.state === "stuck" ? "Regenerate (stuck)" : "Regenerate",
          icon: RefreshCw,
          onSelect: () => void regenerate(row),
        },
      ]}
      pagination={{ page, pageSize, total }}
      toolbar={
        <FilterBar
          filters={[
            { param: "status", label: "Status", options: STATES },
            { param: "edition", label: "Edition", options: EDITIONS },
            { param: "copy", label: "Copy", options: COPY_SOURCES },
          ]}
          resultCount={{ shown: total, total: members, noun: "members" }}
          data-testid="admin-rewind-members-filters"
        />
      }
      empty={
        filtered ? (
          <EmptyState kind="filtered" icon={SearchX} title="No members match" description="Clear the filters to see every member." />
        ) : (
          <EmptyState kind="first-use" icon={Users} title="No members yet" description="Members with a Plex account show here." />
        )
      }
      data-testid="admin-rewind-members"
    />
  )
}
