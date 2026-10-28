"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { ClipboardCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import type { EvalRun } from "@/lib/admin/eval-results"
import { useFormat } from "@/lib/format-context"
import type { TableSort } from "@/lib/ui/table-params"

import { EvalCommand } from "./eval-command"
import { EvalRunSheet } from "./eval-run-sheet"

interface EvalsTableProps {
  /** This page's runs, already sorted and sliced on the server. */
  rows: EvalRun[]
  total: number
  page: number
  pageSize: number
  sort: TableSort
}

const dash = <span className="text-muted-foreground">–</span>

/**
 * The eval runs (P11.30): one row per bake-off or eval run, the model opening
 * its per-fixture outputs in a Sheet, and the selected model badged.
 */
export function EvalsTable({ rows, total, page, pageSize, sort }: EvalsTableProps) {
  const f = useFormat()
  const rate = (value: number | null) => (value === null ? dash : f.percent(value, 1))
  const seconds = (ms: number) => `${f.number(ms / 1000, { maximumFractionDigits: 1 })} s`

  const columns: ColumnDef<EvalRun>[] = [
    {
      id: "model",
      header: "Model",
      enableSorting: true,
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-2">
          <EvalRunSheet run={row.original} />
          {row.original.selected && (
            <Badge variant="success" dot data-testid={`admin-evals-selected-${row.original.id}`}>
              Selected
            </Badge>
          )}
        </div>
      ),
      meta: { card: "title" },
    },
    { id: "promptVersion", header: "Prompt", cell: ({ row }) => row.original.results.promptVersion, meta: { card: "sub", priority: 3 } },
    {
      id: "firstPass",
      header: "First-pass grounding",
      enableSorting: true,
      cell: ({ row }) => rate(row.original.results.rates.firstPass),
      meta: { align: "end", card: "field" },
    },
    { id: "afterRepair", header: "After repair", cell: ({ row }) => rate(row.original.results.rates.afterRepair), meta: { align: "end", card: "field" } },
    {
      id: "judge",
      header: "Judge",
      cell: ({ row }) => {
        const mean = row.original.results.judgeMean
        return mean === null ? dash : f.number(mean, { maximumFractionDigits: 2 })
      },
      meta: { align: "end", card: "field" },
    },
    { id: "cost", header: "Cost", enableSorting: true, cell: ({ row }) => f.money(row.original.results.cost.totalUsd, "table"), meta: { align: "end", card: "field" } },
    { id: "p50", header: "p50", cell: ({ row }) => seconds(row.original.results.latencyMs.p50), meta: { align: "end", priority: 3 } },
    { id: "p95", header: "p95", enableSorting: true, cell: ({ row }) => seconds(row.original.results.latencyMs.p95), meta: { align: "end", card: "field" } },
    { id: "started", header: "Started", enableSorting: true, cell: ({ row }) => f.date(row.original.results.startedAt, "short"), meta: { card: "field" } },
  ]

  return (
    <DataTable
      label="Eval runs"
      noun="runs"
      size="wide"
      columns={columns}
      data={rows}
      getRowId={(run) => run.id}
      pagination={{ page, pageSize, total }}
      sort={sort}
      empty={
        <EmptyState
          kind="first-use"
          icon={ClipboardCheck}
          title="No eval runs yet"
          description="Runs appear here once npm run eval:rewind writes a results file or a database row."
          primaryAction={<EvalCommand command="npm run eval:rewind -- --replay=hand" data-testid="admin-evals-empty-command" />}
          data-testid="admin-evals-empty"
        />
      }
      data-testid="admin-evals"
    />
  )
}
