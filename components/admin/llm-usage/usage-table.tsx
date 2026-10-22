"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Cpu, SearchX } from "lucide-react"
import Link from "next/link"

import { DataTable } from "@/components/ui/data-table/data-table"
import { DateRangeFilter } from "@/components/ui/date-range-filter"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterBar } from "@/components/ui/filter-bar"
import { Time } from "@/components/ui/time"
import type { LlmUsageFilterOptions, LlmUsageGroupRow } from "@/lib/admin/analytics/llm-usage"
import { userDetail } from "@/lib/admin/routes"
import { useFormat } from "@/lib/format-context"
import type { BoundFormat } from "@/lib/utils/format"

const PURPOSE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "rewind", label: "Rewind" },
  { value: "assistant", label: "Assistant" },
  { value: "discord", label: "Discord" },
]

function columns(f: BoundFormat): ColumnDef<LlmUsageGroupRow>[] {
  return [
    { id: "started", header: "Started", cell: ({ row }) => <Time value={row.original.startedAt} />, meta: { mobile: "title" } },
    {
      id: "member",
      header: "Member",
      cell: ({ row }) => (
        <Link data-testid={`admin-llm-usage-member-${row.original.key}`} href={userDetail(row.original.userId)} className="rounded-sm underline-offset-4 hover:underline">
          {row.original.memberName}
        </Link>
      ),
      meta: { mobile: "sub" },
    },
    { id: "context", header: "Context", accessorKey: "context", meta: { mobile: "meta" } },
    {
      id: "model",
      header: "Model",
      cell: ({ row }) => <span className="font-mono text-label">{row.original.model ?? "—"}</span>,
      meta: { priority: 3 },
    },
    { id: "tokens", header: "Tokens", cell: ({ row }) => f.number(row.original.tokens), meta: { align: "end" } },
    { id: "cost", header: "Cost", cell: ({ row }) => f.money(row.original.cost), meta: { align: "end", mobile: "meta" } },
  ]
}

interface UsageTableProps {
  rows: LlmUsageGroupRow[]
  /** Groups matching the filters. */
  total: number
  page: number
  pageSize: number
  filtered: boolean
  options: LlmUsageFilterOptions
  zone: string
}

/**
 * LLM usage by conversation or call (UI-23): the first cell opens the calls,
 * the member cell opens the member, and every filter and page lives in the URL.
 */
export function UsageTable({ rows, total, page, pageSize, filtered, options, zone }: UsageTableProps) {
  const f = useFormat()
  return (
    <DataTable
      label="LLM usage"
      noun="rows"
      columns={columns(f)}
      data={rows}
      getRowId={(row) => row.key}
      getRowHref={(row) => row.href}
      pagination={{ page, pageSize, total }}
      toolbar={
        <div className="flex flex-col gap-3">
          <DateRangeFilter zone={zone} data-testid="llm-usage-dates" />
          <FilterBar
            filters={[
              {
                param: "userId",
                label: "Member",
                options: [{ value: "all", label: "All" }, ...options.members.map((m) => ({ value: m.id, label: m.name }))],
              },
              { param: "purpose", label: "Purpose", options: PURPOSE_OPTIONS },
              {
                param: "model",
                label: "Model",
                options: [{ value: "all", label: "All" }, ...options.models.map((model) => ({ value: model, label: model }))],
              },
            ]}
            resultCount={{ shown: total, total, noun: "rows" }}
            data-testid="llm-usage-filters"
          />
        </div>
      }
      empty={
        filtered ? (
          <EmptyState
            kind="filtered"
            icon={SearchX}
            title="No LLM usage matches these filters"
            description="Clear the filters or pick a longer range."
          />
        ) : (
          <EmptyState kind="first-use" icon={Cpu} title="No LLM usage yet" description="Calls show here once Rewind or the assistant runs." />
        )
      }
      data-testid="llm-usage"
    />
  )
}
