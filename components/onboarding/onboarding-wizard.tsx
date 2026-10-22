"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"

import { completeOnboarding } from "@/actions/onboarding"
import { StepContent } from "@/components/onboarding/step-content"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { Stepper, type StepperStep } from "@/components/ui/stepper"
import { useToast } from "@/components/ui/toast"
import type { OnboardingData } from "@/lib/member/onboarding"
import { icons } from "@/lib/ui/icons"
import { getOnboardingSteps, type OnboardingStepId } from "@/types/onboarding"

interface OnboardingWizardProps {
  data: OnboardingData
  /** Where to start; the Discord link flow returns to `support`. */
  initialStepId?: OnboardingStepId
}

/**
 * Member onboarding (ui-design-system 6.5): a 560px column with the
 * horizontal Stepper and one Card per step. Steps change at once, with no
 * interstitials (UI-33), and focus moves to the new step's h1 (UI-10). Below
 * `md` the actions sit in a sticky bottom bar.
 */
export function OnboardingWizard({ data, initialStepId = "welcome" }: OnboardingWizardProps) {
  const router = useRouter()
  const toast = useToast()
  const steps = getOnboardingSteps({ hasRequests: Boolean(data.requestsUrl) })
  const [index, setIndex] = useState(() => Math.max(0, steps.findIndex((step) => step.id === initialStepId)))
  const [error, setError] = useState<string | null>(null)
  const [finishing, startFinishing] = useTransition()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)

  const step = steps[index]
  const isFirst = index === 0
  const isLast = index === steps.length - 1

  // Focus follows the step, but not on the first render: the page's skip link and the browser keep that.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus()
  }, [index])

  const goTo = (next: number) => {
    moved.current = true
    setError(null)
    setIndex(next)
  }

  const finish = () => {
    startFinishing(async () => {
      const result = await completeOnboarding({ service: data.service })
      if (!result.success) {
        setError(result.error)
        toast.showError(result.error)
        return
      }
      router.replace("/")
    })
  }

  const stepperSteps: StepperStep[] = steps.map((item, position) => ({
    id: item.id,
    label: item.label,
    state: position < index ? "done" : position === index ? "current" : "upcoming",
  }))

  return (
    <div className="flex w-full flex-col gap-4" data-testid={`onboarding-service-${data.service}`}>
      <div className="flex flex-col gap-1">
        <p className="text-h3 text-foreground" data-testid="onboarding-wizard-heading">
          Get set up
        </p>
        <p className="text-ui text-muted-foreground" data-testid="onboarding-wizard-subheading">
          A few things to know before you start watching on {data.serverName}.
        </p>
      </div>

      <Stepper
        steps={stepperSteps}
        orientation="horizontal"
        label="Getting started"
        meta="About a minute"
        data-testid="onboarding-stepper"
      />

      <Card className="flex flex-col gap-5 p-5" data-testid={`onboarding-step-${step.id}`}>
        <StepContent stepId={step.id} data={data} headingRef={headingRef} />

        {error && (
          <Alert tone="destructive" title="Could not finish onboarding" data-testid="onboarding-error">
            {error}
          </Alert>
        )}
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-2 border-t bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6 md:static md:mx-0 md:justify-end md:border-0 md:bg-transparent md:p-0">
        {!isFirst && (
          <Button
            variant="ghost"
            size="lg"
            icon={<Icon icon={icons.back} />}
            onClick={() => goTo(index - 1)}
            disabled={finishing}
            data-testid="onboarding-back"
          >
            Back
          </Button>
        )}
        {isLast ? (
          <Button
            size="lg"
            className="flex-1 md:flex-none"
            loading={finishing}
            loadingLabel="Finishing"
            onClick={finish}
            data-testid="onboarding-final-complete"
          >
            Finish
          </Button>
        ) : (
          <Button
            size="lg"
            className="flex-1 md:flex-none"
            onClick={() => goTo(index + 1)}
            data-testid={`onboarding-${step.id}-continue`}
          >
            Continue
          </Button>
        )}
      </div>
    </div>
  )
}
