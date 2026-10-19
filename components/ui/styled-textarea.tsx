import type { ComponentProps } from "react"

import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface StyledTextareaProps extends Omit<ComponentProps<"textarea">, "size"> {
  size?: "sm" | "md" | "lg"
  error?: boolean
  resize?: "none" | "vertical" | "horizontal" | "both"
  "data-testid"?: string
}

const sizeClasses = {
  sm: "py-1.5",
  md: "",
  lg: "py-2.5 md:text-body",
}

const resizeClasses = {
  none: "resize-none",
  vertical: "resize-y",
  horizontal: "resize-x",
  both: "resize",
}

/**
 * @deprecated Use `Textarea` (with `Field` or `FormField`). This adapter keeps
 * the old `size`, `error` and `resize` props and the `setup-input-<name>` test
 * id, until P10.11 removes it.
 */
export function StyledTextarea({
  size = "md",
  className,
  error = false,
  resize = "vertical",
  name,
  "data-testid": providedTestId,
  ...props
}: StyledTextareaProps) {
  return (
    <Textarea
      name={name}
      data-testid={providedTestId || (name ? `setup-input-${name}` : undefined)}
      aria-invalid={error || undefined}
      className={cn(sizeClasses[size], resizeClasses[resize], className)}
      {...props}
    />
  )
}
