"use client"

import { InputHTMLAttributes, forwardRef } from "react"
import { cn } from "@/lib/utils"

interface StyledInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md" | "lg"
  error?: boolean
  "data-testid"?: string
}

const sizeClasses = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-4 py-2.5 text-base",
}

export const StyledInput = forwardRef<HTMLInputElement, StyledInputProps>(
  ({ size = "md", className, error = false, name, "data-testid": providedTestId, ...props }, ref) => {
    // Generate data-testid from name if not explicitly provided
    const testId = providedTestId || (name ? `setup-input-${name}` : undefined)

    return (
      <input
        ref={ref}
        name={name}
        data-testid={testId}
        aria-invalid={error ? "true" : undefined}
        className={cn(
          "w-full bg-slate-800/50 border rounded-lg text-white placeholder-slate-400 shadow-sm",
          "focus:outline-none focus:border-cyan-400 focus:ring-cyan-400 focus:ring-1",
          "transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          error
            ? "border-red-500/50 focus:border-red-400 focus:ring-red-400"
            : "border-slate-600 hover:border-slate-500",
          sizeClasses[size],
          className
        )}
        {...props}
      />
    )
  }
)

StyledInput.displayName = "StyledInput"

