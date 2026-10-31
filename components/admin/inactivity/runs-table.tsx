"use client"

import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"

import { runOutcome } from "@/components/admin/inactivity/run-outcome"
import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { Time } from "@/components/ui/time"
import { auditLog } from "@/lib/admin/routes"
import type { InactivityRunRow } from "@/lib/data/inactivity"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import type { BoundFormat } from "@/lib/utils/format"

/** The outcome, the read's failure code, and the members whose removal failed. */
function Outcome({ run }: { run: InactivityRunRow }) {
  return (
    <span className="flex flex-col">
      <span>{runOutcome(run)}</span>
      {run.error && <span className="font-mono text-caption text-muted-foreground">{run.error}</span>}
      {run.failedMembers.length > 0 && (
        <span className="text-caption text-muted-foreground">Not removed: {run.failedMembers.join(", ")}</span>
      )}
    </span>
  )
}

function columns(f: BoundFormat): ColumnDef<InactivityRunRow>[] {
  return [
    {
      id: "started",
      header: "Started",
      cell: ({ row }) => (
        <Link
          href={auditLog({ run: row.original.id })}
          className="rounded-sm font-medium text-foreground hover:underline"
          data-testid={`admin-inactivity-run-${row.original.id}`}
        >
          <Time value={row.original.startedAt} data-testid={`admin-inactivity-run-${row.original.id}-timestamp`} />
        </Link>
      ),
      meta: { card: "title" },
    },
    {
      id: "trigger",
      header: "Started by",
      cell: ({ row }) => (row.original.trigger === "admin" ? "An admin" : "The schedule"),
      meta: { card: "sub" },
    },
    { id: "tautulliUsers", header: "Tautulli users", cell: ({ row }) => f.number(row.original.tautulliUsers), meta: { align: "end", priority: 3 } },
    { id: "matched", header: "Members found", cell: ({ row }) => f.number(row.original.matched), meta: { align: "end", card: "field" } },
    { id: "removed", header: "Removed", cell: ({ row }) => f.number(row.original.removed), meta: { align: "end", card: "field" } },
    { id: "failed", header: "Failed", cell: ({ row }) => f.number(row.original.failed), meta: { align: "end", card: "field" } },
    { id: "outcome", header: "Outcome", cell: ({ row }) => <Outcome run={row.original} />, meta: { card: "field" } },
  ]
}

/**
 * The newest runs: when and how each started, the members read from
 * Tautulli, what the sweep did, and why it removed no one when it did not.
 * Each opens the run's audit events (`/admin/audit?run=`).
 */
export function RunsTable({ runs }: { runs: InactivityRunRow[] }) {
  const f = useFormat()
  return (
    <DataTable
      label="Recent runs"
      noun="runs"
      columns={columns(f)}
      data={runs}
      getRowId={(run) => run.id}
      pagination={{ page: 1, pageSize: Math.max(runs.length, 1), total: runs.length }}
      empty={
        <EmptyState
          kind="first-use"
          icon={icons.inactivity}
          title="No runs yet"
          description="The daily run reads last seen from Tautulli. Run now starts one."
          data-testid="admin-inactivity-runs-empty"
        />
      }
      data-testid="admin-inactivity-runs"
    />
  )
}
