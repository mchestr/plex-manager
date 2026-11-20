"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { ReportAlready } from "@/components/problem-reports/report-already"
import { ReportKindStep } from "@/components/problem-reports/report-kind-step"
import { ReportProblemStep } from "@/components/problem-reports/report-problem-step"
import { StepHeading } from "@/components/problem-reports/step-heading"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader } from "@/components/ui/sheet"
import type { SelectedTitle } from "@/lib/member/problem-reports"
import type { ProblemKind } from "@/lib/problem-reports/taxonomy"

type Step = { at: "already" } | { at: "kind" } | { at: "problem"; kind: ProblemKind } | { at: "sent"; joined: boolean }

interface ReportSheetProps {
  selected: SelectedTitle | { error: string }
  /** Where closing the sheet goes: `/report`, keeping the search. */
  closeHref: Route
}

/**
 * The report sheet `/report?item=` opens: what's wrong (step 1), then which
 * problem, the episode and a note (step 2). A title with an open report
 * starts on "Already reported". Focus moves to each step's heading.
 */
export function ReportSheet({ selected, closeHref }: ReportSheetProps) {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  const [step, setStep] = useState<Step>("error" in selected || !selected.openReport ? { at: "kind" } : { at: "already" })

  const close = () => {
    setOpen(false)
    router.replace(closeHref, { scroll: false })
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      <SheetContent side="bottom" grabber className="mx-auto max-w-160 overflow-y-auto" data-testid="report-sheet">
        {"error" in selected ? (
          <SheetHeader>
            <StepHeading>Report a problem</StepHeading>
            <SheetDescription data-testid="report-sheet-error">{selected.error}</SheetDescription>
          </SheetHeader>
        ) : (
          <>
            <SheetHeader>
              <SheetDescription data-testid="report-sheet-title">{selected.title}</SheetDescription>
            </SheetHeader>
            {step.at === "already" && selected.openReport && (
              <ReportAlready openReport={selected.openReport} onSomethingElse={() => setStep({ at: "kind" })} onDone={close} />
            )}
            {step.at === "kind" && <ReportKindStep type={selected.type} onPick={(kind) => setStep({ at: "problem", kind })} />}
            {step.at === "problem" && (
              <ReportProblemStep
                selected={selected}
                kind={step.kind}
                onBack={() => setStep({ at: "kind" })}
                onSent={(joined) => setStep({ at: "sent", joined })}
              />
            )}
            {step.at === "sent" && (
              <div className="flex flex-col gap-4" data-testid="report-sent">
                <StepHeading>Sent</StepHeading>
                <p className="text-ui text-muted-foreground">
                  {step.joined
                    ? "This title already had an open report, so we added yours to it. We'll message you when it's fixed."
                    : "The server admin will take a look. We'll message you when it's done."}
                </p>
                <Button className="self-start" onClick={close} data-testid="report-done">
                  Done
                </Button>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
