import { Fieldset as FieldsetPrimitive } from "@base-ui/react/fieldset"
import { useId, type ReactNode } from "react"

import { cn } from "@/lib/utils"

interface FieldsetProps {
  /** The visible heading of the part, in `text-h3`. It names the group. */
  legend: ReactNode
  /** A muted line beside the legend (under it on a phone), such as "Order does not matter." It describes the group. */
  note?: ReactNode
  children: ReactNode
  /** Disables every control inside, as a native `fieldset` does. */
  disabled?: boolean
  className?: string
  "data-testid"?: string
}

/**
 * One part of a form under a visible legend, on Base UI Fieldset (UX 4.12.7):
 * a native `fieldset` named by its legend, with an optional note that
 * describes it. The rule builder has four: Clean up, Find ..., Never touch
 * and Then (UX 11.1 item 1).
 */
export function Fieldset({ legend, note, children, disabled, className, "data-testid": testId }: FieldsetProps) {
  const noteId = useId()
  return (
    <FieldsetPrimitive.Root
      data-slot="fieldset"
      data-testid={testId}
      disabled={disabled}
      aria-describedby={note ? noteId : undefined}
      className={cn("m-0 flex min-w-0 flex-col gap-3 border-0 p-0", className)}
    >
      <div className="flex flex-col gap-0.5 md:flex-row md:flex-wrap md:items-baseline md:gap-x-2">
        <FieldsetPrimitive.Legend data-slot="fieldset-legend" className="text-h3 text-foreground">
          {legend}
        </FieldsetPrimitive.Legend>
        {note && (
          <p id={noteId} data-slot="fieldset-note" className="text-label font-normal text-muted-foreground">
            {note}
          </p>
        )}
      </div>
      {children}
    </FieldsetPrimitive.Root>
  )
}
