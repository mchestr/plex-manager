"use client"

import { useTransition } from "react"

import { askServerAdmin, cancelProblemReport } from "@/actions/problem-reports"
import { ReportPlays } from "@/components/problem-reports/report-plays"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { StatusBadge } from "@/components/ui/status-badge"
import { useToast } from "@/components/ui/toast"
import { useFormat } from "@/lib/format-context"
import type { ReportRow } from "@/lib/member/your-reports"

/** "Ask the server admin", on the member's report that found no better copy. */
function AskAdmin({ reportId }: { reportId: string }) {
  const { showError, showSuccess } = useToast()
  const [pending, startTransition] = useTransition()
  const ask = () =>
    startTransition(async () => {
      const result = await askServerAdmin({ reportId })
      if (result.success) showSuccess("Sent to the server admin")
      else showError(result.error)
    })
  return (
    <Button variant="secondary" size="sm" onClick={ask} loading={pending} loadingLabel="Sending" data-testid={`report-ask-${reportId}`}>
      Ask the server admin
    </Button>
  )
}

/**
 * Your reports, newest first: each one's status, its latest step, the server
 * admin's note once they fixed or closed it (plain text), Cancel while
 * nothing has run, Ask the server admin when Look for a better copy found
 * none, and Does it play now? for a week after a swap brought in a new copy.
 */
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
            {row.note && (
              <div className="mt-1 flex flex-col gap-0.5 border-l-2 border-border pl-3" data-testid={`report-row-note-${row.id}`}>
                <span className="text-label text-muted-foreground">Note from the server admin</span>
                <p className="text-ui whitespace-pre-wrap text-foreground">{row.note}</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 sm:flex-col sm:items-end">
            <StatusBadge
              domain="problemReport"
              value={row.status}
              sub={row.statusSub ?? undefined}
              data-testid={`report-row-status-${row.id}`}
            />
            {row.canAsk && <AskAdmin reportId={row.id} />}
            {row.askPlays && <ReportPlays reportId={row.id} title={row.title} />}
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
