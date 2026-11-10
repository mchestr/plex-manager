"use client"

import { useState, useTransition } from "react"

import { followProblemReport } from "@/actions/problem-reports"
import { StepHeading } from "@/components/problem-reports/step-heading"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { useFormat } from "@/lib/format-context"
import type { SelectedTitle } from "@/lib/member/problem-reports"
import { resolveStatus } from "@/lib/ui/status"

interface ReportAlreadyProps {
  openReport: NonNullable<SelectedTitle["openReport"]>
  onSomethingElse: () => void
  onDone: () => void
}

/** "Already reported": follow the open report, or report something else about the title. */
export function ReportAlready({ openReport, onSomethingElse, onDone }: ReportAlreadyProps) {
  const format = useFormat()
  const { showError } = useToast()
  const [pending, startTransition] = useTransition()
  const [following, setFollowing] = useState(openReport.yours)
  const status = resolveStatus("problemReport", openReport.status).label

  const follow = () =>
    startTransition(async () => {
      const result = await followProblemReport({ reportId: openReport.id })
      if (!result.success) {
        showError(result.error)
        return
      }
      setFollowing(true)
    })

  return (
    <div className="flex flex-col gap-4" data-testid="report-already">
      <StepHeading>Already reported</StepHeading>
      <p className="text-ui text-foreground" data-testid="report-already-text">
        This title already has an open report: {openReport.problem}. {status} since{" "}
        {format.date(openReport.since, "day-month-short")}.
      </p>
      {following && (
        <p className="text-ui text-muted-foreground" data-testid="report-following">
          We'll message you when it's fixed.
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        {following ? (
          <Button onClick={onDone} data-testid="report-already-done">
            Done
          </Button>
        ) : (
          <Button onClick={follow} loading={pending} loadingLabel="Saving" data-testid="report-follow">
            Same problem, tell me when it's fixed
          </Button>
        )}
        <Button variant="secondary" onClick={onSomethingElse} data-testid="report-something-else">
          It's something else
        </Button>
      </div>
    </div>
  )
}
