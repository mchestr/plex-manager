"use client"

import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field"
import { Minus, Plus } from "lucide-react"
import type { Ref } from "react"

import { Icon } from "@/components/ui/icon"
import { useFormat } from "@/lib/format-context"
import { cn } from "@/lib/utils"

/** Whole numbers unless the caller asks for more. */
const WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }

/** A field is named by `aria-label`, or by a `<label htmlFor={id}>` (or `Field`) with its `id`. */
type FieldName = { "aria-label": string; id?: string } | { id: string; "aria-label"?: string }

type NumberFieldProps = FieldName & {
  value: number | null
  /** Each change: typing, the steppers, the arrow keys. `null` while the input is empty. */
  onValueChange: (value: number | null) => void
  /** The settled value: on blur after typing, on a stepper release, on each arrow key. */
  onValueCommitted?: (value: number | null) => void
  min?: number
  max?: number
  /** The amount the steppers and the arrow keys move; 1 by default. */
  step?: number
  /** Display options; whole numbers by default. */
  format?: Intl.NumberFormatOptions
  disabled?: boolean
  required?: boolean
  name?: string
  "aria-describedby"?: string
  /** Turns the border destructive and sets `aria-invalid` on the input. */
  invalid?: boolean
  inputRef?: Ref<HTMLInputElement>
  className?: string
  /** On the input; the steppers take `{testid}-decrement` and `{testid}-increment`. */
  "data-testid": string
}

const stepper = cn(
  "flex h-full w-9 shrink-0 cursor-pointer items-center justify-center text-muted-foreground select-none",
  "transition-colors duration-(--duration-fast) ease-(--ease-out-quiet)",
  "hover:bg-accent hover:text-accent-foreground",
  "data-disabled:cursor-not-allowed data-disabled:bg-transparent data-disabled:text-muted-foreground data-disabled:opacity-60"
)

/**
 * A number input with decrement and increment buttons, on Base UI NumberField
 * (UX 4.12.7): the arrow keys step by `step` (Shift by 10), the value clamps
 * to `min` and `max`, and the steppers are not tab stops. It formats in the
 * app locale, so the server and the browser show the same digits.
 *
 * 40px high below `md` and 36px from `md`, like `Input`.
 */
export function NumberField({
  value,
  onValueChange,
  onValueCommitted,
  min,
  max,
  step = 1,
  format = WHOLE,
  disabled,
  required,
  name,
  invalid,
  inputRef,
  className,
  id,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
  "data-testid": testId,
}: NumberFieldProps) {
  const { settings } = useFormat()
  return (
    <NumberFieldPrimitive.Root
      data-slot="number-field"
      id={id}
      value={value}
      onValueChange={(next) => onValueChange(next)}
      onValueCommitted={onValueCommitted ? (next) => onValueCommitted(next) : undefined}
      min={min}
      max={max}
      step={step}
      smallStep={step}
      format={format}
      locale={settings.locale}
      disabled={disabled}
      required={required}
      name={name}
      inputRef={inputRef}
      className={cn("w-fit", className)}
    >
      <NumberFieldPrimitive.Group
        data-slot="number-field-group"
        className={cn(
          "flex h-10 items-stretch overflow-hidden rounded-md border border-input bg-background text-foreground md:h-9",
          "transition-colors duration-(--duration-fast) ease-(--ease-out-quiet)",
          "has-[input:focus-visible]:border-ring has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-ring",
          invalid && "border-destructive has-[input:focus-visible]:outline-destructive",
          "data-disabled:border-border data-disabled:bg-muted"
        )}
      >
        <NumberFieldPrimitive.Decrement data-testid={`${testId}-decrement`} className={cn(stepper, "border-r border-input")}>
          <Icon icon={Minus} />
        </NumberFieldPrimitive.Decrement>
        <NumberFieldPrimitive.Input
          data-slot="number-field-input"
          data-testid={testId}
          aria-label={ariaLabel}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(
            "w-[7ch] min-w-0 grow bg-transparent px-2 text-center text-base tabular-nums text-foreground outline-none md:text-ui",
            "disabled:cursor-not-allowed disabled:text-muted-foreground"
          )}
        />
        <NumberFieldPrimitive.Increment data-testid={`${testId}-increment`} className={cn(stepper, "border-l border-input")}>
          <Icon icon={Plus} />
        </NumberFieldPrimitive.Increment>
      </NumberFieldPrimitive.Group>
    </NumberFieldPrimitive.Root>
  )
}
