import { DeletedTable } from "@/components/admin/cleanup/history/deleted-table"
import { RunsTable } from "@/components/admin/cleanup/history/runs-table"
import type { CleanupHistoryData } from "@/lib/cleanup/types/screens"

/**
 * The History tab of Media cleanup (UX 4.9, `shots/09`): the newest 30
 * runs, each with its audit rows, then the deleted titles of the last year
 * with the stored Why of each deletion.
 */
export function HistoryTab({ data }: { data: CleanupHistoryData }) {
  return (
    <div className="flex flex-col gap-10" data-testid="admin-cleanup-history-tab">
      <section aria-labelledby="admin-cleanup-runs-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="admin-cleanup-runs-heading" className="text-h2 text-foreground">
            Runs
          </h2>
          <p className="text-ui text-muted-foreground">The newest 30 runs. Each run links to its rows in the audit log.</p>
        </div>
        <RunsTable runs={data.runs} nextRunAt={data.nextRunAt} />
      </section>
      <section aria-labelledby="admin-cleanup-deleted-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="admin-cleanup-deleted-heading" className="text-h2 text-foreground">
            Deleted titles
          </h2>
          <p className="text-ui text-muted-foreground">Kept for 1 year. Why shows the facts that the run saw at each deletion.</p>
        </div>
        <DeletedTable data={data} />
      </section>
    </div>
  )
}
