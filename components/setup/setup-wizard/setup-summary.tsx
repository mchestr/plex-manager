"use client"

import { useState } from "react"

import { completeSetup } from "@/actions/setup"
import { SetupStepFrame } from "@/components/setup/setup-wizard/setup-step-frame"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { startPlexSignIn } from "@/lib/plex-auth"
import { icons } from "@/lib/ui/icons"
import { redirectTo } from "@/lib/utils/navigation"
import { SETUP_STEPS, type SetupStepId } from "@/types/setup"

const START_FAILED = "Setup is complete, but Plex did not answer. Sign in from the home page."

/**
 * The last card: what is connected and what was skipped. "Open admin" marks
 * setup complete, which ends the claim (P11.32), then signs the owner in with
 * Plex and lands on /admin. plex.tv usually approves at once, because this
 * browser approved Plex Manager in step 1.
 */
export function SetupSummary({ configured }: { configured: Record<SetupStepId, boolean> }) {
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const done = SETUP_STEPS.filter((step) => configured[step.id])
  const skipped = SETUP_STEPS.filter((step) => !configured[step.id])

  const open = async () => {
    setOpening(true)
    setError(null)
    const completed = await completeSetup()
    if (!completed.success) {
      setError(completed.error)
      setOpening(false)
      return
    }
    const started = await startPlexSignIn({ callbackPath: "/admin" })
    if (!started.success) {
      setError(START_FAILED)
      setOpening(false)
      return
    }
    redirectTo(started.data.authUrl)
  }

  return (
    <SetupStepFrame
      position="summary"
      heading="Your server is ready"
      description="Sign in with the Plex account that owns the server to open the admin pages."
      busy={opening}
      primary={
        <Button onClick={open} loading={opening} loadingLabel="Opening admin" icon={<Icon icon={icons.signIn} />} data-testid="setup-open-admin">
          Open admin
        </Button>
      }
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <section aria-labelledby="setup-summary-connected" className="flex flex-col gap-2">
          <h2 id="setup-summary-connected" className="text-h3 text-foreground">
            Connected
          </h2>
          <ul className="flex flex-col gap-1.5" data-testid="setup-summary-connected">
            {done.map((step) => (
              <li key={step.id} className="flex items-center gap-2 text-ui text-foreground">
                <Icon icon={icons.success} className="text-success" />
                {step.title}
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="setup-summary-skipped" className="flex flex-col gap-2">
          <h2 id="setup-summary-skipped" className="text-h3 text-foreground">
            Skipped
          </h2>
          {skipped.length === 0 ? (
            <p className="text-ui text-muted-foreground">None.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5" data-testid="setup-summary-skipped">
                {skipped.map((step) => (
                  <li key={step.id} className="flex items-center gap-2 text-ui text-muted-foreground">
                    <Icon icon={icons.notChecked} />
                    {step.title}
                  </li>
                ))}
              </ul>
              <p className="text-label text-muted-foreground">Set them up in Admin, Settings.</p>
            </>
          )}
        </section>
        {error && (
          <Alert tone="destructive" className="sm:col-span-2" data-testid="setup-summary-error">
            {error}
          </Alert>
        )}
      </div>
    </SetupStepFrame>
  )
}
