"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react"

import { skipSetupStep } from "@/actions/setup"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"
import { isOptionalStep, nextStepId, previousStepId, type SetupPosition, type SetupStepId } from "@/types/setup"

const STEP_ICONS: Record<SetupStepId | "summary", (typeof icons)[keyof typeof icons]> = {
  plex: icons.plex,
  tautulli: icons.tautulli,
  overseerr: icons.requests,
  sonarr: icons.sonarr,
  radarr: icons.radarr,
  "llm-rewind": icons.rewind,
  "llm-chat": icons.assistant,
  discord: icons.discord,
  prometheus: icons.prometheus,
  summary: icons.success,
}

interface SetupStepFrameProps {
  position: SetupPosition
  heading: string
  description: ReactNode
  children: ReactNode
  /** The footer's primary action, usually a submit button for `onSubmit`. */
  primary?: ReactNode
  /** Makes the card a form, so the footer's submit button sends it. */
  onSubmit?: () => void
  /** Disables Back and Skip while the step saves. */
  busy?: boolean
}

/**
 * One setup step as a Card (design 6.5): a service tile, the h1 (which takes
 * focus when the step opens, UI-33) with Required or Optional, the content,
 * and the footer: ghost Back (not on the first step), Skip for now (optional
 * steps only, `skipSetupStep`) and the primary. Below `sm` the footer sticks
 * to the bottom of the screen.
 */
export function SetupStepFrame({ position, heading, description, children, primary, onSubmit, busy = false }: SetupStepFrameProps) {
  const router = useRouter()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [skipping, startSkip] = useTransition()
  const [skipError, setSkipError] = useState<string | null>(null)
  const previous = previousStepId(position)
  const headingId = `setup-${position}-heading`

  // A real effect: focus follows the step, which the page keys on
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const skip = () => {
    if (!isOptionalStep(position)) return
    startSkip(async () => {
      const result = await skipSetupStep({ stepId: position })
      if (result.success) router.push(`/setup?step=${nextStepId(position)}`)
      else setSkipError(result.error)
    })
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit?.()
  }

  const body = (
    <>
      <CardHeader className="flex gap-3.5 sm:gap-4">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-secondary text-muted-foreground">
          <Icon icon={STEP_ICONS[position]} size={20} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 id={headingId} ref={headingRef} tabIndex={-1} className="text-h2 text-foreground outline-none">
              {heading}
            </h1>
            {position !== "summary" &&
              (isOptionalStep(position) ? <Badge>Optional</Badge> : <Badge variant="outline">Required</Badge>)}
          </div>
          <CardDescription className="max-w-[56ch]">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-5">{children}</CardContent>
      <CardFooter
        className={cn(
          "flex-wrap",
          "max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:rounded-b-lg max-sm:bg-card max-sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        )}
        data-testid="setup-step-footer"
      >
        {previous && (
          <Button variant="ghost" icon={<Icon icon={icons.back} />} onClick={() => router.push(`/setup?step=${previous}`)} disabled={busy || skipping} data-testid="setup-back">
            Back
          </Button>
        )}
        <span className="ml-auto" />
        {isOptionalStep(position) && (
          <Button variant="ghost" onClick={skip} loading={skipping} loadingLabel="Skipping" disabled={busy} data-testid="setup-skip-step">
            Skip for now
          </Button>
        )}
        {primary}
        {skipError && (
          <p role="alert" className="basis-full text-right text-label text-destructive">
            {skipError}
          </p>
        )}
      </CardFooter>
    </>
  )

  const className = "w-full"
  return onSubmit ? (
    <Card className={className} data-testid={`setup-step-${position}`}>
      <form onSubmit={submit} noValidate aria-labelledby={headingId} className="flex flex-col">
        {body}
      </form>
    </Card>
  ) : (
    <Card className={className} data-testid={`setup-step-${position}`}>
      <section aria-labelledby={headingId} className="flex flex-col">
        {body}
      </section>
    </Card>
  )
}
