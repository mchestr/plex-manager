"use client"

import { StepHeading } from "@/components/problem-reports/step-heading"
import { Button } from "@/components/ui/button"
import { missingAnswerWords } from "@/lib/problem-reports/answers"
import type { MissingAnswer } from "@/lib/problem-reports/report-missing"

/** What a sent report led to, as the report action answers it. */
export interface SentOutcome {
  outcome: "reported" | "joined" | "fixing" | "answered"
  answer: MissingAnswer | null
}

/** "Nov 14", in the member's own zone and language. */
const day = (iso: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(iso))

const WORDS: Record<Exclude<SentOutcome["outcome"], "answered">, { heading: string; line: string }> = {
  reported: { heading: "Sent", line: "The server admin will take a look. We'll message you when it's done." },
  joined: { heading: "Sent", line: "This title already had an open report, so we added yours to it. We'll message you when it's fixed." },
  fixing: { heading: "Looking for them", line: "We'll look for the missing episodes now. Nothing is removed. We'll message you when they're on the server." },
}

/** The sheet's last step: what happens next, an answer instead of a report, or where to request a season. */
export function ReportSent({ sent, onDone }: { sent: SentOutcome; onDone: () => void }) {
  const answer = sent.outcome === "answered" ? sent.answer : null
  const { heading, line } = answer
    ? { heading: answer.kind === "NOT_AIRED" ? "Not out yet" : "Not on the server", line: missingAnswerWords(answer, day) }
    : WORDS[sent.outcome === "answered" ? "reported" : sent.outcome]
  const requestHref = answer?.kind === "NOT_ON_SERVER" ? answer.requestHref : null

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
        <Button onClick={onDone} data-testid="report-done">
          Done
        </Button>
      </div>
    </div>
  )
}
