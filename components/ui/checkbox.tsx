import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

interface CheckboxProps extends Omit<CheckboxPrimitive.Root.Props, "className"> {
  className?: string
}

/**
 * A checkbox on Base UI Checkbox (ui-design-system 5.4): 16px, radius 4,
 * `border-input`; checked fills with `primary-indicator` (3:1 in both themes)
 * and a 12px check at stroke 3. A 24px hit area surrounds the box (WCAG
 * 2.5.8). Name it with a `<label htmlFor={id}>`, a wrapping label, or `Field`.
 */
export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "relative inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-background",
        "text-primary-indicator-foreground transition-colors duration-(--duration-fast) ease-(--ease-out-quiet)",
        "after:absolute after:-inset-1",
        "data-checked:border-primary-indicator data-checked:bg-primary-indicator",
        "data-indeterminate:border-primary-indicator data-indeterminate:bg-primary-indicator",
        "data-invalid:border-destructive",
        "data-disabled:cursor-not-allowed data-disabled:border-border data-disabled:bg-muted data-disabled:text-muted-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="flex">
        <Check aria-hidden="true" size={12} strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
