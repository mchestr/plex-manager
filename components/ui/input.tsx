"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

type InputSize = "sm" | "md" | "lg"

const sizeClasses: Record<InputSize, string> = {
  sm: "h-8 px-3 py-1.5 text-sm",
  md: "h-10 px-4 py-2 text-sm",
  lg: "h-12 px-4 py-2.5 text-base",
}

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  error?: boolean
  size?: InputSize
  inputSize?: InputSize
  "data-testid"?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error = false, size, inputSize, name, "data-testid": providedTestId, ...props }, ref) => {
    // Support both size and inputSize for backward compatibility
    const resolvedSize = inputSize ?? size ?? "md"
    // Generate data-testid from name if not explicitly provided
    const testId = providedTestId || (name ? `setup-input-${name}` : undefined)

    return (
      <input
        type={type}
        name={name}
        data-testid={testId}
        aria-invalid={error ? "true" : undefined}
        className={cn(
          "flex w-full rounded-lg border bg-slate-800/50 text-white placeholder-slate-400 shadow-sm",
          "transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error
            ? "border-red-500/50 focus-visible:border-red-400 focus-visible:ring-red-400"
            : "border-slate-600 hover:border-slate-500 focus-visible:border-cyan-400 focus-visible:ring-cyan-400",
          sizeClasses[resolvedSize],
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

// Backward-compatible alias for StyledInput
const StyledInput = Input

export { Input, StyledInput }
