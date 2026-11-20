"use client"

import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { useMemo, useState } from "react"

import { runOutcomeText, startedByWords, startedWords } from "@/components/admin/cleanup/history/run-outcome"
import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { auditLog } from "@/lib/admin/routes"
import type { HistoryRun } from "@/lib/cleanup/types/list-parts"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import type { BoundFormat } from "@/lib/utils/format"

const BASE = "admin-cleanup-runs"

/** The outcome, and the stored error code in mono under it (UX 4.9 item 1.2). */
function Outcome({ run }: { run: HistoryRun }) {
  return (
    <span className="flex flex-col">
      <span>{runOutcomeText(run)}</span>
      {run.errorCode && <span className="font-mono text-caption text-muted-foreground">{run.errorCode}</span>}
    </span>
  )
}

function columns(f: BoundFormat, now: number): ColumnDef<HistoryRun>[] {
  const count = (pick: (run: HistoryRun) => number, header: string, id: string): ColumnDef<HistoryRun> => ({
    id,
    header,
    cell: ({ row }) => f.number(pick(row.original)),
    meta: { align: "end", card: "field" },
  })
  return [
    {
      id: "started",
      header: "Started",
      cell: ({ row }) => (
        <time dateTime={row.original.startedAt} className="font-medium whitespace-nowrap text-foreground" data-testid={`${BASE}-row-${row.original.id}-timestamp`}>
          {startedWords(row.original.startedAt, now, f)}
        </time>
      ),
      meta: { card: "title" },
    },
    {
      id: "trigger",
      header: "Started by",
      cell: ({ row }) => <span className="whitespace-nowrap">{startedByWords(row.original)}</span>,
      meta: { card: "sub" },
    },
    count((run) => run.rules.length, "Rules", "rules"),
    count((run) => run.checked, "Checked", "checked"),
    count((run) => run.joined, "Joined", "joined"),
    count((run) => run.rescued, "Rescued", "rescued"),
    count((run) => run.deleted, "Deleted", "deleted"),
    { id: "freed", header: "Freed, up to", cell: ({ row }) => sizeText(row.original.freedBytes), meta: { align: "end", card: "field" } },
    { id: "outcome", header: "Outcome", cell: ({ row }) => <Outcome run={row.original} />, meta: { card: "field" } },
    {
      id: "audit",
      header: () => <span className="sr-only">Audit</span>,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={auditLog({ run: row.original.id })} />}
          aria-label={`Audit rows of the run at ${startedWords(row.original.startedAt, now, f)}`}
          data-testid={`${BASE}-link-${row.original.id}`}
        >
          Audit
        </Button>
      ),
      meta: { card: "field" },
    },
  ]
}

/**
 * The Runs table of the History tab (UX 4.9 item 1), after
 * `components/admin/inactivity/runs-table.tsx`: the newest 30 runs, who
 * started each, its counts, its outcome with the stored error code in mono,
 * and "Audit", the run's rows in the audit log (`/admin/audit?run=<id>`).
 * A run that did not finish reads "Stopped: the server shut down".
 */
export function RunsTable({ runs, nextRunAt }: { runs: HistoryRun[]; nextRunAt: string | null }) {
  const f = useFormat()
  const [now] = useState(() => Date.now())
  const columnDefs = useMemo(() => columns(f, now), [f, now])
  return (
    <DataTable
      label="Runs"
      noun="runs"
      size="wide"
      columns={columnDefs}
      data={runs}
      getRowId={(run) => run.id}
      pagination={{ page: 1, pageSize: Math.max(runs.length, 1), total: runs.length }}
      empty={
        <EmptyState
          kind="first-use"
          icon={icons.cleanup}
          title={nextRunAt ? `No runs yet. The first nightly run is at ${f.time(nextRunAt)}.` : "No runs yet."}
          data-testid={`${BASE}-empty`}
        />
      }
      data-testid={BASE}
    />
  )
}
