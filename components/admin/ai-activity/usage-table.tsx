"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Cpu, SearchX } from "lucide-react"
import Link from "next/link"

import { DataTable } from "@/components/ui/data-table/data-table"
import { DateRangeFilter } from "@/components/ui/date-range-filter"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterBar } from "@/components/ui/filter-bar"
import { StatusBadge } from "@/components/ui/status-badge"
import { Time } from "@/components/ui/time"
import type { LlmUsageFilterOptions, LlmUsageGroupRow } from "@/lib/admin/analytics/llm-usage"
import { userDetail } from "@/lib/admin/routes"
import type { ReviewBadge } from "@/lib/data/conversation-review"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import type { BoundFormat } from "@/lib/utils/format"

const PURPOSE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "rewind", label: "Rewind" },
  { value: "assistant", label: "Assistant" },
  { value: "discord", label: "Discord" },
  { value: "judge", label: "Conversation review" },
]

/** A conversation's review state on its Calls row (spec §2); "N open" counts no unverified finding. */
function ReviewStatus({ conversationId, badge }: { conversationId: string; badge: ReviewBadge }) {
  const testId = `usage-row-review-badge-${conversationId}`
  switch (badge.state) {
    case "none":
      return <StatusBadge tone="neutral" label="Not reviewed" data-testid={testId} />
    case "clean":
      return <StatusBadge tone="success" label="No findings" icon={icons.done} data-testid={testId} />
    case "open":
      return <StatusBadge tone="warning" label={`${badge.open} open`} icon={icons.warning} data-testid={testId} />
    case "unverified_only":
      return <StatusBadge tone="outline" label="Unverified only" data-testid={testId} />
  }
}

function columns(f: BoundFormat, badges: Record<string, ReviewBadge>): ColumnDef<LlmUsageGroupRow>[] {
  return [
    { id: "started", header: "Started", cell: ({ row }) => <Time value={row.original.startedAt} />, meta: { card: "title" } },
    {
      id: "member",
      header: "Member",
      cell: ({ row }) => (
        <Link data-testid={`admin-ai-activity-member-${row.original.key}`} href={userDetail(row.original.userId)} className="rounded-sm underline-offset-4 hover:underline">
          {row.original.memberName}
        </Link>
      ),
      meta: { card: "sub" },
    },
    {
      id: "context",
      header: "Context",
      cell: ({ row }) => {
        const { context, conversationId } = row.original
        const badge = conversationId ? badges[conversationId] : undefined
        return (
          <span className="flex flex-wrap items-center gap-2">
            {context}
            {conversationId && badge && <ReviewStatus conversationId={conversationId} badge={badge} />}
          </span>
        )
      },
      meta: { card: "field" },
    },
    {
      id: "model",
      header: "Model",
      cell: ({ row }) => <span className="font-mono text-label">{row.original.model ?? "—"}</span>,
      meta: { priority: 3 },
    },
    { id: "tokens", header: "Tokens", cell: ({ row }) => f.number(row.original.tokens), meta: { align: "end" } },
    { id: "cost", header: "Cost", cell: ({ row }) => f.money(row.original.cost), meta: { align: "end", card: "field" } },
  ]
}

interface UsageTableProps {
  rows: LlmUsageGroupRow[]
  /** Each assistant conversation row's review badge, by `conversationId` (`reviewBadgesFor`). */
  badges: Record<string, ReviewBadge>
  /** Groups matching the filters. */
  total: number
  page: number
  pageSize: number
  filtered: boolean
  options: LlmUsageFilterOptions
  zone: string
}

/**
 * AI activity by conversation or call (UI-23): the first cell opens the calls,
 * the member cell opens the member, an assistant conversation's context
 * carries its review badge, and every filter and page lives in the URL.
 */
export function UsageTable({ rows, badges, total, page, pageSize, filtered, options, zone }: UsageTableProps) {
  const f = useFormat()
  return (
    <DataTable
      label="AI activity"
      noun="rows"
      columns={columns(f, badges)}
      data={rows}
      getRowId={(row) => row.key}
      getRowHref={(row) => row.href}
      pagination={{ page, pageSize, total }}
      toolbar={
        <div className="flex flex-col gap-3">
          <DateRangeFilter zone={zone} data-testid="ai-activity-dates" />
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
            data-testid="ai-activity-filters"
          />
        </div>
      }
      empty={
        filtered ? (
          <EmptyState
            kind="filtered"
            icon={SearchX}
            title="No AI activity matches these filters"
            description="Clear the filters or select a longer period."
          />
        ) : (
          <EmptyState kind="first-use" icon={Cpu} title="No AI activity yet" description="Calls show here once Rewind or the assistant runs." />
        )
      }
      data-testid="ai-activity"
    />
  )
}
