"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { CircleCheck, Flag } from "lucide-react"

import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { Segment, SegmentedControl } from "@/components/ui/segmented-control"
import { StatusBadge } from "@/components/ui/status-badge"
import { Time } from "@/components/ui/time"
import { useReplaceParams } from "@/hooks/use-replace-params"
import { PROBLEM_REPORT_FILTERS, problemReport, type ProblemReportFilter } from "@/lib/admin/routes"
import type { ProblemReportList, ProblemReportRow } from "@/lib/data/problem-reports"

const FILTER_LABELS: Record<ProblemReportFilter, string> = { "needs-you": "Needs you", fixing: "Fixing", fixed: "Fixed", closed: "Closed" }

const EMPTY: Record<ProblemReportFilter, { title: string; description?: string }> = {
  "needs-you": { title: "Nothing needs you", description: "Reports members send you show here." },
  fixing: { title: "Nothing is being fixed" },
  fixed: { title: "No fixed reports yet" },
  closed: { title: "No closed reports yet" },
}

/** "Jane", or "Jane +2" when two other members reported or follow the title. */
const reporters = (row: ProblemReportRow) => (row.others > 0 ? `${row.reporter.name} +${row.others}` : row.reporter.name)

const COLUMNS: ColumnDef<ProblemReportRow>[] = [
  { id: "title", header: "Title", accessorKey: "title", meta: { card: "title" } },
  { id: "problem", header: "Problem", accessorKey: "problem", meta: { card: "field" } },
  { id: "reporters", header: "Reported by", cell: ({ row }) => reporters(row.original), meta: { card: "field" } },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge domain="problemReport" value={row.original.status} data-testid={`admin-problem-report-status-${row.original.id}`} />,
    meta: { card: "field" },
  },
  {
    id: "reported",
    header: "Reported",
    cell: ({ row }) => <Time value={row.original.createdAt} data-testid={`admin-problem-report-reported-timestamp-${row.original.id}`} />,
    meta: { card: "sub", priority: 3 },
  },
]

interface ProblemReportsTableProps {
  list: ProblemReportList
  filter: ProblemReportFilter
  page: number
  pageSize: number
}

/** The Problem reports list: Needs you, Fixing, Fixed and Closed from `?status=`, paged by `?page=`, each row opening its report. */
export function ProblemReportsTable({ list, filter, page, pageSize }: ProblemReportsTableProps) {
  const { replace } = useReplaceParams()
  const empty = EMPTY[filter]

  return (
    <DataTable
      label="Problem reports"
      noun="reports"
      columns={COLUMNS}
      data={list.rows}
      getRowId={(row) => row.id}
      getRowHref={(row) => problemReport(row.id)}
      pagination={{ page, pageSize, total: list.total }}
      toolbar={
        <SegmentedControl
          aria-label="Show reports"
          value={filter}
          onValueChange={(next) => replace({ status: next === "needs-you" ? null : next, page: null })}
          className="max-w-full overflow-x-auto"
          data-testid="admin-problem-reports-filter"
        >
          {PROBLEM_REPORT_FILTERS.map((value) => (
            <Segment key={value} value={value} data-testid={`admin-problem-reports-filter-${value}`}>
              {FILTER_LABELS[value]} ({list.counts[value]})
            </Segment>
          ))}
        </SegmentedControl>
      }
      empty={
        <EmptyState
          kind="first-use"
          icon={filter === "needs-you" ? CircleCheck : Flag}
          title={empty.title}
          description={empty.description}
          data-testid="admin-problem-reports-empty"
        />
      }
      data-testid="admin-problem-reports"
    />
  )
}
