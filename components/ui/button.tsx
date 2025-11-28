"use client"

import { ButtonHTMLAttributes, forwardRef } from "react"
import { cn } from "@/lib/utils"

type ButtonVariant = "primary" | "success" | "danger" | "secondary" | "ghost"
type ButtonSize = "sm" | "md" | "lg"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", children, disabled = false, ...props }, ref) => {
    const baseClasses =
      "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2"

    const variantClasses = {
      primary:
        "bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white focus:ring-cyan-500",
      success: "bg-green-600 hover:bg-green-500 text-white focus:ring-green-500",
      danger: "bg-red-600 hover:bg-red-500 text-white focus:ring-red-500",
      secondary: "bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white focus:ring-slate-500",
      ghost: "bg-transparent hover:bg-slate-700/50 text-slate-300 hover:text-white focus:ring-slate-500",
    }

    const sizeClasses = {
      sm: "px-3 py-1.5 text-xs",
      md: "px-4 py-2 text-sm",
      lg: "px-6 py-3 text-base",
    }

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = "Button"
