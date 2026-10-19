"use client"

import { useId } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

interface StyledCheckboxProps {
  checked?: boolean
  /** Called with an event-shaped object, so `(e) => e.target.checked` call sites keep compiling. */
  onChange?: (event: { target: { checked: boolean } }) => void
  label?: string
  description?: string
  disabled?: boolean
  id?: string
  name?: string
  className?: string
  "data-testid"?: string
}

/**
 * @deprecated Use `Checkbox` with a label. This adapter keeps the old
 * `label`, `description`, `onChange` and `data-testid` props until P10.11.
 */
export function StyledCheckbox({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  name,
  className,
  "data-testid": testId,
}: StyledCheckboxProps) {
  const generatedId = useId()
  const checkboxId = id || generatedId
  const descriptionId = `${checkboxId}-description`

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <Checkbox
        id={checkboxId}
        name={name}
        checked={checked}
        onCheckedChange={(next) => onChange?.({ target: { checked: next } })}
        disabled={disabled}
        aria-describedby={description ? descriptionId : undefined}
        data-testid={testId}
        className="mt-0.5"
      />
      {(label || description) && (
        <div className="flex flex-1 flex-col gap-0.5">
          {label && (
            <label
              htmlFor={checkboxId}
              className={cn(
                "cursor-pointer text-ui font-medium text-foreground select-none",
                disabled && "cursor-not-allowed text-muted-foreground"
              )}
            >
              {label}
            </label>
          )}
          {description && (
            <p id={descriptionId} className="text-label font-normal text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
