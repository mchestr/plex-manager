import type { ComponentProps } from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface StyledInputProps extends Omit<ComponentProps<typeof Input>, "size"> {
  size?: "sm" | "md" | "lg"
  error?: boolean
  "data-testid"?: string
}

/** `md` keeps Input's own height: 40px below `md`, 36px from it. */
const sizeClasses = {
  sm: "h-8 md:h-8",
  md: "",
  lg: "h-11 md:h-11 md:text-body",
}

/**
 * @deprecated Use `Input` (with `Field` or `FormField`). This adapter keeps
 * the old `size` and `error` props and the `setup-input-<name>` test id that
 * `e2e/setup-wizard.spec.ts` reads, until P10.11 removes it.
 */
export function StyledInput({ size = "md", className, error = false, name, "data-testid": providedTestId, ...props }: StyledInputProps) {
  return (
    <Input
      name={name}
      data-testid={providedTestId || (name ? `setup-input-${name}` : undefined)}
      aria-invalid={error || undefined}
      className={cn(sizeClasses[size], className)}
      {...props}
    />
  )
}
