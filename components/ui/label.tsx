import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/** The label recipe (ui-design-system 5.4): 14px/500 in `foreground`. */
export const labelClasses = "flex items-center gap-1 text-ui font-medium text-foreground select-none"

/** The "(optional)" marker, 400 in `muted-foreground`. */
export function OptionalMark() {
  return <span className="font-normal text-muted-foreground">(optional)</span>
}

interface LabelProps extends ComponentProps<"label"> {
  /** Adds "(optional)" after the text. */
  optional?: boolean
}

/**
 * A native label for a control outside `Field`, tied to it with `htmlFor`.
 * Inside a `Field`, use `FieldLabel`, which wires the association itself.
 */
export function Label({ optional, className, children, ...props }: LabelProps) {
  return (
    <label data-slot="label" className={cn(labelClasses, className)} {...props}>
      {children}
      {optional && " "}
      {optional && <OptionalMark />}
    </label>
  )
}
