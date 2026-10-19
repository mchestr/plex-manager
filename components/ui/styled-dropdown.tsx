"use client"

import type { ReactNode } from "react"

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

export interface DropdownOption {
  value: string
  label: string | ReactNode
  disabled?: boolean
}

interface DropdownOptGroup {
  label: string
  options: DropdownOption[]
}

interface StyledDropdownProps {
  value: string
  onChange: (value: string) => void
  options?: DropdownOption[]
  optgroups?: DropdownOptGroup[]
  placeholder?: string
  className?: string
  disabled?: boolean
  size?: "sm" | "md" | "lg"
  id?: string
  name?: string
  /** Names the trigger when no `<label htmlFor={id}>` does. */
  "aria-label"?: string
  "data-testid"?: string
}

const triggerSize = { sm: "sm", md: "default", lg: "lg" } as const

/**
 * @deprecated Use `Select` and its parts. This adapter renders Select with the
 * old props until its importers move (P6.5, P10), and keeps the E2E contracts:
 * the trigger takes the test id (`setup-input-<name>` by default), a hidden
 * input with `name` and `value` takes `<testId>-hidden`, and each option takes
 * `<testId>-option-<value>`.
 */
export function StyledDropdown({
  value,
  onChange,
  options = [],
  optgroups = [],
  placeholder,
  className,
  disabled = false,
  size = "md",
  id,
  name,
  "aria-label": ariaLabel,
  "data-testid": providedTestId,
}: StyledDropdownProps) {
  const testId = providedTestId || (name ? `setup-input-${name}` : undefined)
  const allOptions = [...options, ...optgroups.flatMap((group) => group.options)]
  // A value outside the options shows the placeholder, as it always has.
  const selected = allOptions.some((option) => option.value === value) ? value : null

  const item = (option: DropdownOption) => (
    <SelectItem
      key={option.value}
      value={option.value}
      disabled={option.disabled}
      label={typeof option.label === "string" ? option.label : undefined}
      data-testid={testId ? `${testId}-option-${option.value}` : undefined}
    >
      {option.label}
    </SelectItem>
  )

  return (
    <div className={cn("relative", className)}>
      {/* Our own hidden input, so the submitted field and its test id stay stable. */}
      {name && <input type="hidden" name={name} value={value} data-testid={testId ? `${testId}-hidden` : undefined} />}
      <Select
        items={allOptions.map((option) => ({ value: option.value, label: option.label }))}
        value={selected}
        onValueChange={(next) => {
          if (next !== null) onChange(next)
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} aria-label={ariaLabel} size={triggerSize[size]} data-testid={testId}>
          <SelectValue placeholder={placeholder || "Select an option"} />
        </SelectTrigger>
        <SelectContent>
          {options.map(item)}
          {optgroups.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.options.map(item)}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
