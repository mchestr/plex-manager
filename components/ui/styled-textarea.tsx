"use client"

import { TextareaHTMLAttributes, forwardRef } from "react"
import { cn } from "@/lib/utils"

interface StyledTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> {
  size?: "sm" | "md" | "lg"
  error?: boolean
  resize?: "none" | "vertical" | "horizontal" | "both"
}

const sizeClasses = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-4 py-2.5 text-base",
}

const resizeClasses = {
  none: "resize-none",
  vertical: "resize-y",
  horizontal: "resize-x",
  both: "resize",
}

export const StyledTextarea = forwardRef<HTMLTextAreaElement, StyledTextareaProps>(
  ({ size = "md", className, error = false, resize = "vertical", ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        aria-invalid={error ? "true" : undefined}
        className={cn(
          "w-full bg-slate-800/50 border rounded-lg text-white placeholder-slate-400 shadow-sm",
          "focus:outline-none focus:border-cyan-400 focus:ring-cyan-400 focus:ring-1",
          "transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          error
            ? "border-red-500/50 focus:border-red-400 focus:ring-red-400"
            : "border-slate-600 hover:border-slate-500",
          sizeClasses[size],
          resizeClasses[resize],
          className
        )}
        {...props}
      />
    )
  }
)

StyledTextarea.displayName = "StyledTextarea"
