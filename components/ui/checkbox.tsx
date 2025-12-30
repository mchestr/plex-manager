"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-5 w-5 shrink-0 rounded border-2 transition-all duration-200",
      "bg-slate-800/50 border-slate-600 cursor-pointer",
      "hover:border-slate-500",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/20 focus-visible:border-cyan-400",
      "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-800/30 disabled:border-slate-700",
      "data-[state=checked]:bg-gradient-to-br data-[state=checked]:from-cyan-500 data-[state=checked]:to-purple-600 data-[state=checked]:border-cyan-400",
      "data-[state=checked]:disabled:bg-slate-700 data-[state=checked]:disabled:border-slate-600 data-[state=checked]:disabled:from-slate-700 data-[state=checked]:disabled:to-slate-700",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-white")}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

// Composite component for checkbox with label and description (backward compatible with StyledCheckbox)
interface CheckboxFieldProps {
  id?: string
  label?: string
  description?: string
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  // Backward compatibility: support onChange that receives an event-like object
  onChange?: (e: { target: { checked: boolean } }) => void
  disabled?: boolean
  className?: string
  "data-testid"?: string
}

const CheckboxField = React.forwardRef<HTMLButtonElement, CheckboxFieldProps>(
  ({ id, label, description, checked, onCheckedChange, onChange, disabled, className, "data-testid": testId }, ref) => {
    const checkboxId = id || `checkbox-${React.useId()}`

    // Handle both onCheckedChange (new) and onChange (legacy) APIs
    const handleCheckedChange = (newChecked: boolean) => {
      if (onCheckedChange) {
        onCheckedChange(newChecked)
      }
      if (onChange) {
        // Create an event-like object for backward compatibility
        onChange({ target: { checked: newChecked } })
      }
    }

    return (
      <div className={cn("flex items-start gap-3", className)}>
        <div className="relative flex items-center h-5 mt-0.5">
          <Checkbox
            ref={ref}
            id={checkboxId}
            checked={checked}
            onCheckedChange={handleCheckedChange}
            disabled={disabled}
            data-testid={testId}
          />
        </div>
        {(label || description) && (
          <div className="flex-1">
            {label && (
              <label
                htmlFor={checkboxId}
                className={cn(
                  "block text-sm font-medium cursor-pointer select-none",
                  disabled ? "text-slate-500" : "text-white"
                )}
              >
                {label}
              </label>
            )}
            {description && (
              <p className={cn(
                "mt-0.5 text-xs",
                disabled ? "text-slate-600" : "text-slate-400"
              )}>
                {description}
              </p>
            )}
          </div>
        )}
      </div>
    )
  }
)
CheckboxField.displayName = "CheckboxField"

// Backward-compatible alias
const StyledCheckbox = CheckboxField

export { Checkbox, CheckboxField, StyledCheckbox }
