import { Input as InputPrimitive } from "@base-ui/react/input"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * The input and textarea surface (ui-design-system 5.4): 36px, or 40px with
 * 16px text below `md` so iOS does not zoom on focus. Focus draws the ring
 * border and the base-layer outline, inset by 2px; an invalid control turns
 * the border destructive.
 */
export const fieldSurface = [
  "w-full min-w-0 rounded-md border border-input bg-background text-base text-foreground md:text-ui",
  "transition-colors duration-(--duration-fast) ease-(--ease-out-quiet)",
  "placeholder:text-muted-foreground",
  "disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
  "aria-invalid:border-destructive",
]

const focusRing = "focus-visible:border-ring focus-visible:-outline-offset-2 aria-invalid:focus-visible:outline-destructive"

interface InputProps extends Omit<InputPrimitive.Props, "className"> {
  className?: string
  /** An icon or prefix before the value, such as `discord.gg/`. */
  leading?: ReactNode
  /** A marker or button after the value, such as a Show button. */
  trailing?: ReactNode
}

/**
 * A text input on Base UI Input, so a surrounding `Field` labels it and wires
 * its description, error and `aria-invalid`.
 *
 * With `leading` or `trailing`, the border moves to a wrapper (`data-slot="input-group"`)
 * that shows the focus ring for the whole group; `className` still styles the input.
 */
export function Input({ className, leading, trailing, ...props }: InputProps) {
  if (!leading && !trailing) {
    return (
      <InputPrimitive
        data-slot="input"
        className={cn(fieldSurface, "h-10 px-3 md:h-9", focusRing, className)}
        {...props}
      />
    )
  }

  return (
    <div
      data-slot="input-group"
      className={cn(
        fieldSurface,
        "flex h-10 items-center gap-2 px-3 text-muted-foreground md:h-9",
        "has-[input:focus-visible]:border-ring has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-ring",
        "has-[input[aria-invalid=true]]:border-destructive has-[input:disabled]:bg-muted",
        "[&_svg]:size-4 [&_svg]:shrink-0"
      )}
    >
      {leading}
      <InputPrimitive
        data-slot="input"
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground",
          "disabled:cursor-not-allowed disabled:text-muted-foreground",
          className
        )}
        {...props}
      />
      {trailing}
    </div>
  )
}
