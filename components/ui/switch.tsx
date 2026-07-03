"use client"

import { forwardRef } from "react"

import { cn } from "@/lib/utils"

interface SwitchProps {
  /** Whether the switch is in the on position */
  checked: boolean
  /** Called with the next checked value when the user toggles the switch */
  onCheckedChange: (checked: boolean) => void
  /** Disables interaction and dims the control */
  disabled?: boolean
  /** Shows a loading spinner and disables interaction */
  loading?: boolean
  /** Accessible label for the switch (used when no visible label is associated) */
  label?: string
  /** Passthrough test id for stable selectors */
  "data-testid"?: string
  className?: string
}

/**
 * Reusable, controlled toggle switch primitive.
 *
 * Uses `role="switch"` with `aria-checked`, is keyboard operable (native button
 * handles Space/Enter), shows a visible focus ring, and supports a
 * disabled/loading state. Presentational only — consumers wire `onCheckedChange`
 * to their own actions.
 */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  {
    checked,
    onCheckedChange,
    disabled = false,
    loading = false,
    label,
    "data-testid": testId,
    className,
  },
  ref
) {
  const isDisabled = disabled || loading

  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={isDisabled}
      onClick={() => onCheckedChange(!checked)}
      data-testid={testId}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900",
        checked ? "bg-green-500" : "bg-slate-700",
        isDisabled ? "opacity-50 cursor-not-allowed" : "hover:opacity-90",
        className
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
      {loading && (
        <svg
          className="absolute -right-6 h-4 w-4 animate-spin text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
    </button>
  )
})
