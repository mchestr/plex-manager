"use client"

import { useState, useTransition } from "react"

import { answerDoesItPlay } from "@/actions/problem-reports"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { PROBLEM_NOTE_MAX } from "@/lib/validations/problem-reports"

/**
 * "Does it play now?" on the member's report that a swap or a removal fixed:
 * It plays, or Still broken, which asks what's still wrong and sends it to
 * the server admin. Nothing else is swapped either way.
 */
export function ReportPlays({ reportId, title }: { reportId: string; title: string }) {
  const { showError, showSuccess } = useToast()
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState("")

  const plays = () =>
    startTransition(async () => {
      const result = await answerDoesItPlay({ reportId, plays: true, note: "" })
      if (result.success) showSuccess("Thanks for letting us know")
      else showError(result.error)
    })

  return (
    <div className="flex flex-col gap-2 sm:items-end" data-testid={`report-plays-${reportId}`}>
      <span className="text-label text-foreground">Does it play now?</span>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={plays} loading={pending} loadingLabel="Sending" data-testid={`report-plays-yes-${reportId}`}>
          It plays
        </Button>
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm" disabled={pending} data-testid={`report-plays-no-${reportId}`}>
              Still broken
            </Button>
          }
          title={`${title} is still broken`}
          description="The server admin will take a look. Nothing else is swapped, and we'll message you when it's done."
          confirmLabel="Send to the server admin"
          pendingLabel="Sending"
          cancelLabel="Back"
          action={async () => {
            const result = await answerDoesItPlay({ reportId, plays: false, note })
            if (!result.success) return { error: result.error }
            showSuccess("Sent to the server admin")
            return {}
          }}
          data-testid="report-plays-dialog"
          confirmTestId="report-plays-send"
        >
          <Field>
            <FieldLabel optional>What's still wrong?</FieldLabel>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={PROBLEM_NOTE_MAX} rows={3} data-testid="report-plays-note" />
          </Field>
        </ConfirmDialog>
      </div>
    </div>
  )
}
