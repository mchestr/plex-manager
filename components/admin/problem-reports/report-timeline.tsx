import Link from "next/link"

import type { EvidenceLines, TimelineStep } from "@/lib/admin/problem-reports/rows"
import { userDetail } from "@/lib/admin/routes"
import type { BoundFormat } from "@/lib/utils/format"

/** What Tautulli said when the member reported it: their last play, and whether the title plays to the end. */
function evidenceLines(evidence: EvidenceLines, f: BoundFormat): string[] {
  const lines: string[] = []
  const last = evidence.lastPlay
  if (last) lines.push(`Their last play: ${f.dateTime(last.at)} on ${last.player ?? "an unknown player"}${last.transcoded ? ", converted by Plex" : ""}`)
  if (evidence.playedToEnd !== null) {
    lines.push(evidence.playedToEnd ? "It has played to the end since its file was added" : "It hasn't played to the end since its file was added")
  }
  return lines
}

/**
 * A report's steps, oldest first: what happened and who did it, the member's
 * own words as plain text, their answer about their player, and the evidence
 * Tautulli gave when they reported it.
 */
export function ReportTimeline({ steps, f }: { steps: TimelineStep[]; f: BoundFormat }) {
  return (
    <ol className="flex flex-col gap-3" data-testid="admin-problem-report-timeline">
      {steps.map((step) => {
        const details = [...(step.device ? [step.device] : []), ...(step.evidence ? evidenceLines(step.evidence, f) : [])]
        return (
          <li key={step.id} className="flex flex-col gap-2 rounded-lg border bg-card p-4" data-testid={`admin-problem-report-step-${step.id}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-ui font-medium text-foreground">{step.words}</p>
              <p className="text-label text-muted-foreground" data-testid={`admin-problem-report-step-${step.id}-timestamp`}>
                {f.dateTime(step.at, { zoneLabel: true })}
              </p>
            </div>
            {step.actor && (
              <Link
                href={userDetail(step.actor.id)}
                className="w-fit rounded-sm text-label text-muted-foreground hover:text-foreground hover:underline"
                data-testid={`admin-problem-report-step-${step.id}-actor`}
              >
                {step.actor.name}
              </Link>
            )}
            {step.note && (
              <p className="text-ui whitespace-pre-wrap text-foreground" data-testid={`admin-problem-report-step-${step.id}-note`}>
                {step.note}
              </p>
            )}
            {details.length > 0 && (
              <ul className="flex flex-col gap-0.5 text-label text-muted-foreground" data-testid={`admin-problem-report-step-${step.id}-evidence`}>
                {details.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ol>
  )
}
