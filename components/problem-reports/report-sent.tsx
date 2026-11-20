"use client"

import { useTransition } from "react"

import { reportProblem } from "@/actions/problem-reports"
import { StepHeading } from "@/components/problem-reports/step-heading"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { answerWords, type ReportAnswer } from "@/lib/problem-reports/answers"
import type { MemberFixAction } from "@/lib/problem-reports/fixes"
import type { ProblemCode } from "@/lib/problem-reports/taxonomy"
import type { DeviceAnswer } from "@/lib/validations/problem-reports"

/** What a sent report led to, as the report action answers it. */
export interface SentOutcome {
  outcome: "reported" | "joined" | "fixing" | "answered"
  answer: ReportAnswer | null
  /** The fix that started, when the outcome is `fixing`. */
  action: MemberFixAction | null
}

/** What the member sent, so an answer they don't accept can still go to the server admin. */
export interface SentRequest {
  ratingKey: string
  problem: ProblemCode
  note: string
  device?: DeviceAnswer
  /** The member chose Swap the copy. */
  swap?: boolean
}

/** "Nov 14", in the member's own zone and language. */
const day = (iso: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(iso))

const WORDS: Record<"reported" | "joined", { heading: string; line: string }> = {
  reported: { heading: "Sent", line: "The server admin will take a look. We'll message you when it's done." },
  joined: { heading: "Sent", line: "This title already had an open report, so we added yours to it. We'll message you when it's fixed." },
}

const FIXING: Record<MemberFixAction, { heading: string; line: string }> = {
  BETTER_COPY: {
    heading: "Looking for a better copy",
    line: "We'll look for a better copy now. The one you have keeps playing, and if there isn't a better one, nothing changes. We'll message you either way.",
  },
  LOOK_FOR_MISSING: { heading: "Looking for them", line: "We'll look for the missing episodes now. Nothing is removed. We'll message you when they're on the server." },
  REFRESH: { heading: "Refreshing the details", line: "We'll check the details and ask Plex to read them again. We'll message you when it's done." },
  SWAP: {
    heading: "Swapping the copy",
    line: "We'll find a different copy and swap it in. The one you have keeps playing until the new one is ready. We'll message you when it's done.",
  },
  FIX_MATCH: { heading: "Fixing the details", line: "We'll fix the title and poster in Plex. The file stays the same. We'll message you when it's done." },
}

const ANSWER_HEADINGS: Record<ReportAnswer["kind"], string> = { NOT_AIRED: "Not out yet", NOT_ON_SERVER: "Not on the server", BEST_COPY: "Already the best copy" }

function words(sent: SentOutcome): { heading: string; line: string } {
  if (sent.answer) return { heading: ANSWER_HEADINGS[sent.answer.kind], line: answerWords(sent.answer, day) }
  if (sent.outcome === "fixing" && sent.action) return FIXING[sent.action]
  return WORDS[sent.outcome === "joined" ? "joined" : "reported"]
}

interface ReportSentProps {
  sent: SentOutcome
  request: SentRequest
  /** A new outcome, after the member sends an answered report to the server admin anyway. */
  onSent: (sent: SentOutcome) => void
  onDone: () => void
}

/**
 * The sheet's last step: what happens next, or an answer instead of a
 * report, with where to request a season, or Send to the server admin for a
 * file the server keeps as its best copy.
 */
export function ReportSent({ sent, request, onSent, onDone }: ReportSentProps) {
  const { showError } = useToast()
  const [pending, startTransition] = useTransition()
  const { heading, line } = words(sent)
  const requestHref = sent.answer?.kind === "NOT_ON_SERVER" ? sent.answer.requestHref : null

  const sendAnyway = () =>
    startTransition(async () => {
      const result = await reportProblem({ ...request, toAdmin: true })
      if (!result.success) {
        showError(result.error)
        return
      }
      onSent(result.data)
    })

  return (
    <div className="flex flex-col gap-4" data-testid="report-sent">
      <StepHeading>{heading}</StepHeading>
      <p className="text-ui text-muted-foreground" data-testid="report-sent-line">
        {line}
      </p>
      <div className="flex flex-wrap gap-2">
        {requestHref && (
          <Button variant="secondary" nativeButton={false} render={<a href={requestHref} target="_blank" rel="noopener noreferrer" />} data-testid="report-request">
            Request it
          </Button>
        )}
        {sent.answer?.kind === "BEST_COPY" && (
          <Button variant="secondary" onClick={sendAnyway} loading={pending} loadingLabel="Sending" data-testid="report-send-anyway">
            Send to the server admin
          </Button>
        )}
        <Button onClick={onDone} data-testid="report-done">
          Done
        </Button>
      </div>
    </div>
  )
}
