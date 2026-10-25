import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { EvalCommand } from "@/components/admin/rewind/evals/eval-command"
import { EvalsTable } from "@/components/admin/rewind/evals/evals-table"
import { Alert } from "@/components/ui/alert"
import { PageHeader } from "@/components/ui/page-header"
import { getAdminGate } from "@/lib/admin"
import { EVAL_DEFAULT_SORT, EVAL_SORTS, loadEvalRuns, sortEvalRuns } from "@/lib/admin/eval-results"
import { parseTableParams } from "@/lib/ui/table-params"

export const metadata: Metadata = { title: "Evals", robots: { index: false } }

/**
 * `/admin/rewind/evals` (P11.30): the bake-off and eval runs, from the
 * `RewindEvalRun` table and the committed `evals/rewind/results/*.json`, with
 * the model `selected.json` names badged. Paid evals stay on the CLI, so the
 * page offers the command rather than a Run button.
 */
export default async function RewindEvalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await getAdminGate()
  if (!gate.ok) notFound()

  const [params, { runs, skipped, selected }] = await Promise.all([searchParams, loadEvalRuns()])
  const table = parseTableParams(params, { sortable: EVAL_SORTS, defaultSort: EVAL_DEFAULT_SORT })
  const sorted = sortEvalRuns(runs, table.sort)
  const page = Math.min(table.page, Math.max(1, Math.ceil(sorted.length / table.pageSize)))
  const rows = sorted.slice((page - 1) * table.pageSize, page * table.pageSize)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-evals-page">
      <PageHeader
        title="Evals"
        description={
          selected.model
            ? `The bake-off and eval runs. The selected model is ${selected.model}.`
            : "The bake-off and eval runs. No model has been selected yet."
        }
        data-testid="admin-evals-header"
      />
      <div className="flex flex-col gap-2">
        <p className="text-ui text-muted-foreground">Paid evals run from the command line, with the provider keys set:</p>
        <EvalCommand command="npm run eval:rewind -- --model=<provider>:<id>" data-testid="admin-evals-command" />
      </div>
      {skipped.length > 0 && (
        <Alert tone="warning" title="Some results could not be read" data-testid="admin-evals-skipped">
          {`Skipped because they do not match the results schema: ${skipped.join(", ")}.`}
        </Alert>
      )}
      <EvalsTable rows={rows} total={sorted.length} page={page} pageSize={table.pageSize} sort={table.sort} />
    </div>
  )
}
