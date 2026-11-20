"use client"

import { useState } from "react"

import { resolveProblemReport } from "@/actions/admin/problem-reports"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FormField } from "@/components/ui/form-field"
import { Textarea } from "@/components/ui/textarea"
import { useActionDialog } from "@/hooks/use-action-dialog"
import { ADMIN_NOTE_MAX, PROBLEM_NOTE_MAX } from "@/lib/validations/problem-reports"

type Outcome = "fixed" | "closed"

const COPY: Record<Outcome, { trigger: string; title: string; description: string; confirm: string; pending: string; success: string }> = {
  fixed: {
    trigger: "Mark fixed",
    title: "Mark this report fixed?",
    description: "The member who reported it sees it as fixed, with your note. Members who follow it see it as fixed too.",
    confirm: "Mark fixed",
    pending: "Saving",
    success: "Report marked fixed",
  },
  closed: {
    trigger: "Close with a note",
    title: "Close this report?",
    description: "The member who reported it sees it as closed, with your note. Members can report the title again.",
    confirm: "Close report",
    pending: "Closing",
    success: "Report closed",
  },
}

const resolve = (reportId: string, outcome: Outcome, memberNote: string, adminNote: string) =>
  resolveProblemReport({ reportId, outcome, memberNote, adminNote })

/** One of the two endings, with the note the member sees and the internal one. */
function ResolveDialog({ reportId, outcome, primary }: { reportId: string; outcome: Outcome; primary?: boolean }) {
  const [memberNote, setMemberNote] = useState("")
  const [adminNote, setAdminNote] = useState("")
  const copy = COPY[outcome]
  const { run } = useActionDialog(resolve, { success: copy.success })
  const id = `admin-problem-report-${outcome}`

  return (
    <ConfirmDialog
      trigger={
        <Button variant={primary ? "primary" : "outline"} data-testid={id}>
          {copy.trigger}
        </Button>
      }
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirm}
      pendingLabel={copy.pending}
      action={() => run(reportId, outcome, memberNote, adminNote)}
      onOpenChange={(open) => {
        if (open) return
        setMemberNote("")
        setAdminNote("")
      }}
      data-testid={`${id}-dialog`}
      confirmTestId={`${id}-confirm`}
    >
      <FormField name={`${id}-member-note`} label="Note for the member" optional description="They see it on Report a problem, as you write it.">
        <Textarea
          value={memberNote}
          onChange={(event) => setMemberNote(event.target.value)}
          maxLength={PROBLEM_NOTE_MAX}
          rows={3}
          data-testid={`${id}-member-note`}
        />
      </FormField>
      <FormField name={`${id}-admin-note`} label="Internal note" optional description="Only admins see it.">
        <Textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} maxLength={ADMIN_NOTE_MAX} rows={3} data-testid={`${id}-admin-note`} />
      </FormField>
    </ConfirmDialog>
  )
}

/** The open report's endings, for its page header: Close with a note, then the primary Mark fixed. */
export function ResolveActions({ reportId }: { reportId: string }) {
  return (
    <>
      <ResolveDialog reportId={reportId} outcome="closed" />
      <ResolveDialog reportId={reportId} outcome="fixed" primary />
    </>
  )
}
