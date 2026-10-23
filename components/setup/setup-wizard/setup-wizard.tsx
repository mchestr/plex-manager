"use client"

import { useRouter } from "next/navigation"
import type { ReactNode } from "react"

import { DevModeBanner } from "@/components/setup/setup-wizard/dev-mode-banner"
import { DiscordStep } from "@/components/setup/setup-wizard/discord-step"
import { LLMStep } from "@/components/setup/setup-wizard/llm-step"
import { PlexConnectStep } from "@/components/setup/setup-wizard/plex-connect-step"
import { ServiceConnectionForm } from "@/components/setup/setup-wizard/service-connection-form"
import { SetupSummary } from "@/components/setup/setup-wizard/setup-summary"
import { Stepper, type StepperStep } from "@/components/ui/stepper"
import type { SetupWizardData } from "@/lib/setup/wizard-data"
import { SETUP_STEPS, stepIndex, type DevDefaults, type SetupPosition } from "@/types/setup"

interface SetupWizardProps {
  /** The step on screen: the wizard's position, or an earlier step reached with Back (`?step=`). */
  position: SetupPosition
  /** How far the wizard has got (`Setup.currentStepId`). */
  reached: SetupPosition
  data: SetupWizardData
  /** The DEV_* pre-fill, read once by the setup page (P10.7). */
  devDefaults: DevDefaults
  /** Under the vertical Stepper: the Plex confirmation card, streamed by the page. */
  rail?: ReactNode
}

/**
 * First-run setup (design 6.5, P10.25): a grouped vertical Stepper at `lg`
 * and up, the horizontal segments with "Step 3 of 9, Overseerr" below it, and
 * one card per step. Every move is a navigation to `?step=`, which the page
 * keeps at or before the saved position, so Back and the Stepper's done steps
 * are links back.
 */
export function SetupWizard({ position, reached, data, devDefaults, rail }: SetupWizardProps) {
  const router = useRouter()
  const steps: StepperStep[] = SETUP_STEPS.map((step) => ({
    id: step.id,
    label: step.title,
    group: step.group,
    optional: step.optional,
    state:
      step.id === position
        ? "current"
        : stepIndex(step.id) < stepIndex(reached)
          ? data.configured[step.id]
            ? "done"
            : "skipped"
          : "upcoming",
  }))
  const goTo = (id: string) => router.push(`/setup?step=${id}`)

  const { stored } = data
  const step = (() => {
    switch (position) {
      case "plex":
        return <PlexConnectStep pending={data.plexPending} stored={stored.server ?? null} devDefaults={devDefaults} />
      case "tautulli":
      case "overseerr":
      case "sonarr":
      case "radarr":
      case "prometheus":
        return <ServiceConnectionForm kind={position} stored={stored.server ?? null} devDefaults={devDefaults} />
      case "llm-rewind":
        return <LLMStep purpose="wrapped" stored={stored.llm ?? null} devDefaults={devDefaults} />
      case "llm-chat":
        return <LLMStep purpose="chat" stored={stored.llm ?? null} devDefaults={devDefaults} />
      case "discord":
        return <DiscordStep stored={stored.discord ?? null} devDefaults={devDefaults} />
      case "summary":
        return <SetupSummary configured={data.configured} />
    }
  })()

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]" data-testid="setup-wizard">
      <aside aria-label="Setup steps" className="hidden flex-col gap-6 lg:flex">
        <div className="flex flex-col gap-1">
          <h2 className="text-h3 text-foreground">Set up your server</h2>
          <p className="text-label text-muted-foreground">Two steps are required. Everything else can wait.</p>
        </div>
        <Stepper steps={steps} orientation="vertical" label="Setup" onSelect={goTo} data-testid="setup-stepper" />
        {rail}
      </aside>
      <div className="flex min-w-0 flex-col gap-4">
        <Stepper steps={steps} orientation="horizontal" label="Setup" showCurrentLabel className="lg:hidden" data-testid="setup-stepper-compact" />
        <DevModeBanner devDefaults={devDefaults} />
        {step}
      </div>
    </div>
  )
}
