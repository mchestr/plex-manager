"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface RadioGroupProps<T extends string> {
  value: T | null
  onValueChange: (value: T) => void
  /** The id of the visible label that names the group. */
  "aria-labelledby": string
  disabled?: boolean
  className?: string
  children: ReactNode
  "data-testid"?: string
}

/** A single choice among cards, on Base UI RadioGroup: arrow keys move, Space picks. */
export function RadioGroup<T extends string>({ value, onValueChange, className, children, ...props }: RadioGroupProps<T>) {
  return (
    <RadioGroupPrimitive<T>
      data-slot="radio-group"
      value={value ?? undefined}
      onValueChange={(next) => onValueChange(next)}
      className={cn("flex flex-col gap-2", className)}
      {...props}
    >
      {children}
    </RadioGroupPrimitive>
  )
}

interface RadioCardProps {
  value: string
  disabled?: boolean
  /** The card's text; it names the radio. */
  children: ReactNode
  /** Trailing content such as a status badge. */
  trailing?: ReactNode
  className?: string
  "data-testid"?: string
}

/**
 * One choice as a card (ui-design-system 5.4): a 16px radio mark, the
 * content, an optional trailing badge. Checked turns the border
 * `primary-indicator`; a disabled card stays readable on `muted`.
 */
export function RadioCard({ value, disabled, children, trailing, className, ...props }: RadioCardProps) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-card"
      value={value}
      disabled={disabled}
      className={cn(
        "flex w-full cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-left",
        "transition-colors duration-(--duration-fast) ease-(--ease-out-quiet) hover:border-border-strong",
        "data-checked:border-primary-indicator",
        "data-disabled:cursor-not-allowed data-disabled:bg-muted data-disabled:hover:border-border",
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-background in-data-checked:border-primary-indicator"
      >
        <RadioPrimitive.Indicator className="size-2 rounded-full bg-primary-indicator" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</span>
      {trailing}
    </RadioPrimitive.Root>
  )
}
