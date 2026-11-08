"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"

import { NumberField } from "@/components/ui/number-field"
import { useFormat } from "@/lib/format-context"
import { cn } from "@/lib/utils"

export interface ChoiceChipsOption<T extends string> {
  value: T
  label: string
  /** The matches with this value, shown muted and spoken: "180 days, 152 matches". `null` hides it. */
  count?: number | null
  disabled?: boolean
  /** Replaces the option id `{testid}-option-{value}`, for screens whose ids name presets (UX 10.2). */
  "data-testid"?: string
}

/**
 * The last chip, "Other": a radio of the same group. While it is checked, a
 * `NumberField` labelled "Other value, in {unit}" shows after the group.
 */
export interface ChoiceChipsOther {
  label: string
  checked: boolean
  onSelect: () => void
  /** The unit of the typed value, in words: "days". */
  unit: string
  value: number | null
  onValueChange: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  /** Describes the input, such as an error under it. */
  "aria-describedby"?: string
  invalid?: boolean
  /** The input's id; `{testid}-other-input` by default. */
  "data-testid"?: string
}

interface ChoiceChipsProps<T extends string> {
  value: T | null
  onValueChange: (value: T) => void
  options: ChoiceChipsOption<T>[]
  other?: ChoiceChipsOther
  /** How a count is spoken; "{N} matches" by default. Near-miss chips say "{N} near misses". */
  countLabel?: (count: number) => string
  /** The id of the visible label that names the group. */
  "aria-labelledby": string
  disabled?: boolean
  className?: string
  /** The group; options take `{testid}-option-{value}`, Other takes `{testid}-other`. */
  "data-testid": string
}

/** The radio value of the Other chip; option values are the caller's own words, never this. */
const OTHER = "choice-chips-other"

const matches = (count: number) => (count === 1 ? "1 match" : `${count} matches`)

const chip = cn(
  "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full border border-border-strong px-4 text-label text-foreground select-none md:h-8 md:px-3",
  "transition-colors duration-(--duration-fast) ease-(--ease-out-quiet)",
  "not-data-checked:hover:bg-accent not-data-checked:hover:text-accent-foreground",
  "data-checked:border-foreground data-checked:bg-foreground data-checked:text-background",
  "data-disabled:cursor-not-allowed data-disabled:border-border data-disabled:text-muted-foreground data-disabled:hover:bg-transparent"
)

/**
 * One choice from a few values, as pills, on Base UI RadioGroup (UX 4.12.3):
 * radio semantics, never `aria-pressed`; the arrows move the choice and Tab
 * leaves the group. Pills are 32px from `md` and 44px below. A count shows in
 * muted tabular figures and joins the name: "180 days, 152 matches". The
 * checked pill is the `foreground` inverse.
 */
export function ChoiceChips<T extends string>({
  value,
  onValueChange,
  options,
  other,
  countLabel = matches,
  disabled,
  className,
  "aria-labelledby": labelledBy,
  "data-testid": testId,
}: ChoiceChipsProps<T>) {
  const f = useFormat()
  const checked = other?.checked ? OTHER : value

  return (
    <div data-slot="choice-chips" className={cn("flex flex-col gap-3", className)}>
      <RadioGroupPrimitive<string>
        data-testid={testId}
        aria-labelledby={labelledBy}
        value={checked ?? undefined}
        onValueChange={(next) => {
          if (next === OTHER) other?.onSelect()
          else onValueChange(next as T)
        }}
        disabled={disabled}
        className="flex flex-wrap gap-2"
      >
        {options.map((option) => {
          const counted = option.count !== undefined && option.count !== null
          return (
            <RadioPrimitive.Root
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              data-slot="choice-chip"
              data-testid={option["data-testid"] ?? `${testId}-option-${option.value}`}
              aria-label={counted ? `${option.label}, ${countLabel(option.count as number)}` : undefined}
              className={chip}
            >
              <span>{option.label}</span>
              {counted && (
                <span
                  aria-hidden="true"
                  className="text-muted-foreground tabular-nums in-data-checked:text-background/75 in-data-disabled:text-muted-foreground"
                >
                  {f.number(option.count as number)}
                </span>
              )}
            </RadioPrimitive.Root>
          )
        })}
        {other && (
          <RadioPrimitive.Root value={OTHER} data-slot="choice-chip" data-testid={`${testId}-other`} className={chip}>
            {other.label}
          </RadioPrimitive.Root>
        )}
      </RadioGroupPrimitive>
      {other?.checked && (
        <div className="flex items-center gap-2">
          <NumberField
            aria-label={`Other value, in ${other.unit}`}
            aria-describedby={other["aria-describedby"]}
            invalid={other.invalid}
            value={other.value}
            onValueChange={other.onValueChange}
            min={other.min}
            max={other.max}
            step={other.step}
            disabled={disabled}
            data-testid={other["data-testid"] ?? `${testId}-other-input`}
          />
          <span aria-hidden="true" className="text-ui text-muted-foreground">
            {other.unit}
          </span>
        </div>
      )}
    </div>
  )
}
