"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { skipSetupStep } from "@/actions/setup"
import { Button } from "@/components/ui/button"
import { nextStepId, type OptionalSetupStepId } from "@/types/setup"

/**
 * Skip for now on an optional setup step (P10.24): moves the wizard on
 * without saving the service. P10.25 moves it into the wizard's footer.
 */
export function SkipStepButton({ stepId }: { stepId: OptionalSetupStepId }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const skip = () =>
    startTransition(async () => {
      const result = await skipSetupStep({ stepId })
      if (result.success) {
        router.push(`/setup?step=${nextStepId(stepId)}`)
      } else {
        setError(result.error)
      }
    })

  return (
    <div className="mt-4 flex flex-col items-end gap-2">
      <Button variant="ghost" onClick={skip} loading={pending} loadingLabel="Skipping" data-testid="setup-skip-step">
        Skip for now
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
