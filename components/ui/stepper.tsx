import type { ReactNode } from "react"

import { Icon } from "@/components/ui/icon"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

type StepState = "done" | "current" | "upcoming" | "skipped"

export interface StepperStep {
  id: string
  label: string
  state: StepState
  /** Adds an "Optional" caption in the vertical list. */
  optional?: boolean
  /** The vertical list's group heading; consecutive steps with the same group share one heading. */
  group?: string
}

interface StepperProps {
  steps: StepperStep[]
  /** `horizontal`: 4px segments with labels (five steps or fewer show every label). `vertical`: a grouped list. */
  orientation: "horizontal" | "vertical"
  /** Names the list for screen readers, before "step 2 of 5". Default "Progress". */
  label?: string
  /** Trailing text on the count row, such as "About a minute". */
  meta?: ReactNode
  /** Appends the current step's label to the count: "Step 3 of 9, Overseerr". */
  showCurrentLabel?: boolean
  /** Makes done and skipped steps buttons that go back to them. */
  onSelect?: (id: string) => void
  className?: string
  "data-testid"?: string
}

/** Above this many steps the horizontal labels are visually hidden and only the count names the step. */
const MAX_VISIBLE_LABELS = 5

const SEGMENT: Record<StepState, string> = {
  done: "bg-muted-foreground",
  current: "bg-primary-indicator",
  upcoming: "bg-secondary",
  skipped: "bg-border-strong",
}

const STATE_TEXT: Partial<Record<StepState, string>> = { done: "done", skipped: "skipped" }

/** "Step 2 of 5", with the current label when asked for. */
function countText(steps: StepperStep[], showCurrentLabel: boolean): string {
  const index = steps.findIndex((step) => step.state === "current")
  const position = index === -1 ? steps.length : index + 1
  const base = `Step ${position} of ${steps.length}`
  return showCurrentLabel && index !== -1 ? `${base}, ${steps[index].label}` : base
}

function StepLabel({ step, onSelect, className }: { step: StepperStep; onSelect?: (id: string) => void; className?: string }) {
  const stateText = STATE_TEXT[step.state]
  const content = (
    <>
      {step.label}
      {stateText && <span className="sr-only">, {stateText}</span>}
    </>
  )
  if (onSelect && (step.state === "done" || step.state === "skipped")) {
    return (
      <button
        type="button"
        onClick={() => onSelect(step.id)}
        className={cn("rounded-sm text-left hover:text-foreground hover:underline", className)}
      >
        {content}
      </button>
    )
  }
  return <span className={className}>{content}</span>
}

function StepMark({ state }: { state: StepState }) {
  return (
    <span
      aria-hidden="true"
      data-state={state}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border",
        state === "done" && "border-muted-foreground bg-muted-foreground text-background",
        state === "current" && "border-primary-indicator bg-primary-indicator text-primary-indicator-foreground",
        state === "upcoming" && "border-border-strong bg-secondary",
        state === "skipped" && "border-dashed border-border-strong"
      )}
    >
      {state === "done" && <Icon icon={icons.done} size={12} />}
      {state === "current" && <span className="size-1.5 rounded-full bg-current" />}
    </span>
  )
}

function groupsOf(steps: StepperStep[]): Array<{ name: string | undefined; steps: StepperStep[] }> {
  const groups: Array<{ name: string | undefined; steps: StepperStep[] }> = []
  for (const step of steps) {
    const last = groups.at(-1)
    if (last && last.name === step.group) last.steps.push(step)
    else groups.push({ name: step.group, steps: [step] })
  }
  return groups
}

/**
 * Progress through a wizard (ui-design-system 5.5, 6.5). Every step is an
 * `<li>`; the current one carries `aria-current="step"`, and the count row
 * reads "Step 2 of 5". Segments and marks are non-text state marks, so the
 * current one reads `primary-indicator` (3.4): done is `muted-foreground`,
 * upcoming `secondary`.
 *
 * - **horizontal** (onboarding, setup below `lg`): one 4px segment per step
 *   with its label under it.
 * - **vertical** (setup at `lg` and up): the steps under their group
 *   headings, each with a state mark and an "Optional" caption.
 *
 * The host moves focus to the new step's h1 when the step changes.
 */
export function Stepper({
  steps,
  orientation,
  label = "Progress",
  meta,
  showCurrentLabel = false,
  onSelect,
  className,
  ...props
}: StepperProps) {
  const count = countText(steps, showCurrentLabel)
  const listLabel = `${label}, ${count.charAt(0).toLowerCase()}${count.slice(1)}`
  const countRow = (
    <div className="flex items-baseline justify-between gap-4 text-label text-muted-foreground">
      <span data-slot="stepper-count">{count}</span>
      {meta && <span>{meta}</span>}
    </div>
  )

  if (orientation === "horizontal") {
    const labelsVisible = steps.length <= MAX_VISIBLE_LABELS
    return (
      <div data-slot="stepper" data-orientation="horizontal" className={cn("flex flex-col gap-3.5", className)} {...props}>
        <ol
          aria-label={listLabel}
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
        >
          {steps.map((step) => (
            <li key={step.id} aria-current={step.state === "current" ? "step" : undefined} className="min-w-0">
              <span aria-hidden="true" data-slot="stepper-segment" className={cn("block h-1 rounded-full", SEGMENT[step.state])} />
              <StepLabel
                step={step}
                onSelect={onSelect}
                className={cn(
                  "mt-1.5 block truncate text-caption",
                  step.state === "current" ? "text-foreground" : "font-normal text-muted-foreground",
                  !labelsVisible && "sr-only"
                )}
              />
            </li>
          ))}
        </ol>
        {countRow}
      </div>
    )
  }

  return (
    <div data-slot="stepper" data-orientation="vertical" className={cn("flex flex-col gap-4", className)} {...props}>
      {countRow}
      <ol aria-label={listLabel} className="flex flex-col gap-5">
        {groupsOf(steps).map((group, index) => (
          <li key={`${group.name ?? "steps"}-${index}`} className="flex flex-col gap-2">
            {group.name && <p className="text-label text-muted-foreground">{group.name}</p>}
            <ol className="flex flex-col gap-1">
              {group.steps.map((step) => (
                <li
                  key={step.id}
                  aria-current={step.state === "current" ? "step" : undefined}
                  className={cn(
                    "flex items-start gap-3 rounded-md px-2 py-1.5",
                    step.state === "current" && "bg-accent"
                  )}
                >
                  <StepMark state={step.state} />
                  <span className="flex min-w-0 flex-col">
                    <StepLabel
                      step={step}
                      onSelect={onSelect}
                      className={cn(
                        "text-ui",
                        step.state === "current" ? "font-medium text-foreground" : "text-muted-foreground"
                      )}
                    />
                    {step.optional && <span className="text-caption font-normal text-muted-foreground">Optional</span>}
                  </span>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  )
}
