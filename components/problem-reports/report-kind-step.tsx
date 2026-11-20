"use client"

import { StepHeading } from "@/components/problem-reports/step-heading"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { kindsFor, type ProblemKind, type ReportableType } from "@/lib/problem-reports/taxonomy"
import { icons } from "@/lib/ui/icons"

/** Step 1: one full-width row per kind of problem; a tap moves on. */
export function ReportKindStep({ type, onPick }: { type: ReportableType; onPick: (kind: ProblemKind) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <StepHeading>What's wrong?</StepHeading>
      <ul className="flex flex-col gap-2">
        {kindsFor(type).map((kind) => (
          <li key={kind.id}>
            <Button
              variant="outline"
              size="lg"
              className="w-full justify-between"
              onClick={() => onPick(kind.id)}
              data-testid={`report-kind-${kind.id}`}
            >
              {kind.label}
              <Icon icon={icons.chevronRight} />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
