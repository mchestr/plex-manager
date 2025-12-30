"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

type TextareaSize = "sm" | "md" | "lg"
type TextareaResize = "none" | "vertical" | "horizontal" | "both"

const sizeClasses: Record<TextareaSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-4 py-2.5 text-base",
}

const resizeClasses: Record<TextareaResize, string> = {
  none: "resize-none",
  vertical: "resize-y",
  horizontal: "resize-x",
  both: "resize",
}

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> {
  error?: boolean
  size?: TextareaSize
  textareaSize?: TextareaSize
  resize?: TextareaResize
  "data-testid"?: string
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error = false, size, textareaSize, resize = "vertical", name, "data-testid": providedTestId, ...props }, ref) => {
    // Support both size and textareaSize for backward compatibility
    const resolvedSize = textareaSize ?? size ?? "md"
    // Generate data-testid from name if not explicitly provided
    const testId = providedTestId || (name ? `setup-input-${name}` : undefined)

    return (
      <textarea
        name={name}
        data-testid={testId}
        aria-invalid={error ? "true" : undefined}
        className={cn(
          "flex min-h-[80px] w-full rounded-lg border bg-slate-800/50 text-white placeholder-slate-400 shadow-sm",
          "transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error
            ? "border-red-500/50 focus-visible:border-red-400 focus-visible:ring-red-400"
            : "border-slate-600 hover:border-slate-500 focus-visible:border-cyan-400 focus-visible:ring-cyan-400",
          sizeClasses[resolvedSize],
          resizeClasses[resize],
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

// Backward-compatible alias for StyledTextarea
const StyledTextarea = Textarea

export { Textarea, StyledTextarea }
