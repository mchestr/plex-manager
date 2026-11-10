"use client"

import { cancelProblemReport } from "@/actions/problem-reports"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { StatusBadge } from "@/components/ui/status-badge"
import { useToast } from "@/components/ui/toast"
import { useFormat } from "@/lib/format-context"
import type { ReportRow } from "@/lib/member/problem-reports"

/** Your reports, newest first: each one's status, its latest step, and Cancel while nothing has run. */
export function ReportList({ rows }: { rows: ReportRow[] }) {
  const format = useFormat()
  const { showSuccess } = useToast()

  if (rows.length === 0) {
    return (
      <p className="text-ui text-muted-foreground" data-testid="report-list-empty">
        You haven't reported a problem yet.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-border" data-testid="report-list">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between" data-testid={`report-row-${row.id}`}>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-ui text-foreground">{row.title}</span>
            <span className="text-label text-muted-foreground">{row.problem}</span>
            <span className="text-label text-muted-foreground" data-testid={`report-row-latest-${row.id}`}>
              {row.latest.words} {format.date(row.latest.at, "day-month-short")}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:flex-col sm:items-end">
            <StatusBadge
              domain="problemReport"
              value={row.status}
              sub={row.status === "CLOSED" ? "Cancelled" : undefined}
              data-testid={`report-row-status-${row.id}`}
            />
            {row.canCancel && (
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm" data-testid={`report-cancel-${row.id}`}>
                    Cancel report
                  </Button>
                }
                title={`Cancel your report about ${row.title}?`}
                description="The server admin won't look at it. You can report the title again later."
                confirmLabel="Cancel report"
                pendingLabel="Cancelling"
                cancelLabel="Keep it"
                tone="destructive"
                action={async () => {
                  const result = await cancelProblemReport({ reportId: row.id })
                  if (!result.success) return { error: result.error }
                  showSuccess("Report cancelled")
                  return {}
                }}
                data-testid="report-cancel-dialog"
                confirmTestId="report-cancel-confirm"
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
