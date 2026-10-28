"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Layers, RotateCcw, SearchX, Trash2 } from "lucide-react"
import { useState } from "react"

import { removeQueueJob, retryQueueJob } from "@/actions/admin/queue"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterBar } from "@/components/ui/filter-bar"
import { useHoldLiveRefresh } from "@/components/ui/live-status"
import { StatusBadge } from "@/components/ui/status-badge"
import { Time } from "@/components/ui/time"
import { useToast } from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { QueueJobRow } from "@/lib/admin/queues"
import { useFormat } from "@/lib/format-context"
import { JOB_TYPE_LABELS, MAIN_QUEUE_JOB_TYPES } from "@/lib/queue/types"
import type { BoundFormat } from "@/lib/utils/format"

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "waiting", label: "Waiting" },
  { value: "active", label: "Running" },
  { value: "failed", label: "Failed" },
  { value: "delayed", label: "Delayed" },
  { value: "completed", label: "Completed" },
]

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  ...MAIN_QUEUE_JOB_TYPES.map((type) => ({ value: type, label: JOB_TYPE_LABELS[type] })),
]

function ErrorCell({ error }: { error: string | null }) {
  if (!error) return <span className="text-muted-foreground">—</span>
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span data-testid="admin-queues-job-error" tabIndex={0} className="block max-w-64 truncate rounded-sm text-muted-foreground" />}
      >
        {error}
      </TooltipTrigger>
      <TooltipContent>{error}</TooltipContent>
    </Tooltip>
  )
}

function columns(f: BoundFormat): ColumnDef<QueueJobRow>[] {
  return [
    { id: "type", header: "Job", accessorKey: "typeLabel", meta: { card: "title" } },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge domain="queueJob" value={row.original.status} />,
      meta: { card: "field" },
    },
    {
      id: "attempts",
      header: "Attempts",
      cell: ({ row }) => `${row.original.attempts} of ${row.original.maxAttempts}`,
      meta: { align: "end", card: "field" },
    },
    { id: "created", header: "Created", cell: ({ row }) => <Time value={row.original.createdAt} />, meta: { card: "sub" } },
    {
      id: "duration",
      header: "Duration",
      cell: ({ row }) =>
        row.original.durationMs === null
          ? "—"
          : f.duration(row.original.durationMs / 60_000, "short", { smallestUnit: "second" }),
      meta: { align: "end", card: "field" },
    },
    { id: "error", header: "Error", cell: ({ row }) => <ErrorCell error={row.original.error} />, meta: { priority: 3 } },
  ]
}

interface JobsTableProps {
  rows: QueueJobRow[]
  /** Jobs matching the filters, from `getJobCounts`. */
  total: number
  /** Jobs before the filters, for the result count. */
  allJobs: number
  page: number
  pageSize: number
  filtered: boolean
}

/** The queue's jobs (UI-23): URL-driven filters and pages, Retry on failed jobs, and Remove behind a confirm. */
export function JobsTable({ rows, total, allJobs, page, pageSize, filtered }: JobsTableProps) {
  const f = useFormat()
  const { showSuccess, showError } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [removing, setRemoving] = useState<QueueJobRow | null>(null)
  useHoldLiveRefresh(menuOpen || removing !== null)

  const retry = async (row: QueueJobRow) => {
    const result = await retryQueueJob({ jobId: row.id })
    if (result.success) showSuccess(`Retrying ${row.typeLabel}`)
    else showError(result.error)
  }

  const remove = async () => {
    if (!removing) return {}
    const result = await removeQueueJob({ jobId: removing.id })
    if (!result.success) return { error: result.error }
    showSuccess("Job removed")
    return {}
  }

  return (
    <>
      <DataTable
        label="Jobs"
        noun="jobs"
        columns={columns(f)}
        data={rows}
        getRowId={(row) => row.id}
        getRowName={(row) => `${row.typeLabel} ${row.id}`}
        rowActions={(row) => [
          ...(row.status === "failed"
            ? [{ id: "retry", label: "Retry", icon: RotateCcw, onSelect: () => void retry(row) }]
            : []),
          ...(row.status === "active"
            ? []
            : [{ id: "remove", label: "Remove...", icon: Trash2, variant: "destructive" as const, onSelect: () => setRemoving(row) }]),
        ]}
        onRowActionsOpenChange={setMenuOpen}
        pagination={{ page, pageSize, total }}
        toolbar={
          <FilterBar
            filters={[
              { param: "status", label: "Status", options: STATUS_OPTIONS },
              { param: "jobType", label: "Job", options: TYPE_OPTIONS },
            ]}
            resultCount={{ shown: total, total: allJobs, noun: "jobs" }}
            data-testid="queue-jobs-filters"
          />
        }
        empty={
          filtered ? (
            <EmptyState kind="filtered" icon={SearchX} title="No jobs match" description="Clear the filters to see every job." />
          ) : (
            <EmptyState kind="first-use" icon={Layers} title="No jobs yet" />
          )
        }
        data-testid="queue-jobs"
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing ? `Remove this ${removing.typeLabel} job?` : "Remove this job?"}
        description="The job leaves the queue. It doesn't run or retry."
        confirmLabel="Remove job"
        pendingLabel="Removing"
        tone="destructive"
        action={remove}
        data-testid="queue-remove-dialog"
        confirmTestId="queue-remove-confirm"
      />
    </>
  )
}
