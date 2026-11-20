"use client"

import { useTransition } from "react"

import { resumeProblemFixes } from "@/actions/admin/problem-reports"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"

/**
 * Shown while the breaker is tripped: fixes that replace files passed their
 * hourly or daily limit and wait until an admin resumes them.
 *
 * @param since - When it tripped, already written in the server's zone
 */
export function BreakerBanner({ since }: { since: string }) {
  const { showError, showSuccess } = useToast()
  const [pending, startTransition] = useTransition()

  const resume = () =>
    startTransition(async () => {
      const result = await resumeProblemFixes({})
      if (result.success) showSuccess("Fixes resumed")
      else showError(result.error)
    })

  return (
    <Alert
      tone="warning"
      title="Fixes that replace files are paused"
      action={
        <Button size="sm" onClick={resume} loading={pending} loadingLabel="Resuming" data-testid="admin-problem-breaker-resume">
          Resume fixes
        </Button>
      }
      data-testid="admin-problem-breaker"
    >
      Too many files were replaced in a short time, so those fixes stopped on <span data-testid="admin-problem-breaker-timestamp">{since}</span>. Other fixes
      still run.
    </Alert>
  )
}
