"use client"

import { NumberField } from "@/components/ui/number-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isRecord } from "@/lib/cleanup/fields/values"
import { DURATION_UNITS, type DurationUnit } from "@/lib/validations/cleanup-vocabulary"

import { applyPreset, type ChangeMode, editorId, type ValueEditorProps } from "./editor-parts"
import { PresetChips } from "./preset-chips"

/** A duration as the editor holds it: the amount can be empty while the admin types. */
interface LooseDuration {
  amount: number | null
  unit: DurationUnit
}

const UNIT_ITEMS = DURATION_UNITS.map((unit) => ({ value: unit, label: unit }))

/** The amount and unit of a stored or half-typed duration. A missing unit reads as days. */
function readDuration(value: unknown): LooseDuration {
  if (!isRecord(value)) return { amount: null, unit: "days" }
  return {
    amount: typeof value.amount === "number" ? value.amount : null,
    unit: DURATION_UNITS.find((unit) => unit === value.unit) ?? "days",
  }
}

interface DurationFieldProps {
  duration: unknown
  onChange: (duration: LooseDuration, mode: ChangeMode) => void
  /** The number's test id; the unit select takes `unitTestId`. */
  numberTestId: string
  unitTestId: string
  invalid: boolean
  describedBy?: string
}

/**
 * A `NumberField` and a unit `Select` (days, weeks, months, years). Typing
 * waits for the debounce; a stepper, blur or a unit change sends at once.
 * The unit's range is checked by the caller (X4).
 */
export function DurationField({ duration, onChange, numberTestId, unitTestId, invalid, describedBy }: DurationFieldProps) {
  const { amount, unit } = readDuration(duration)
  return (
    <>
      <NumberField
        aria-label={`Number of ${unit}`}
        aria-describedby={describedBy}
        invalid={invalid}
        value={amount}
        min={1}
        onValueChange={(next) => onChange({ amount: next, unit }, "typed")}
        onValueCommitted={(next) => onChange({ amount: next, unit }, "commit")}
        data-testid={numberTestId}
      />
      <Select
        items={UNIT_ITEMS}
        value={unit}
        onValueChange={(next) => {
          const chosen = DURATION_UNITS.find((u) => u === next)
          if (chosen) onChange({ amount, unit: chosen }, "now")
        }}
      >
        <SelectTrigger aria-label="Unit" data-testid={unitTestId} className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {UNIT_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value} data-testid={`${unitTestId}-option-${item.value}`}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}

/**
 * The value of a date field (UX 6: Last played, Requested, Added, Last
 * episode added): "[365] [days] ago", then the presets with their counts.
 * A wrong amount for the unit gets the X4 message.
 */
export function RelativeDateInput({ condition, level, onChange, error, errorId, labelId, counts }: ValueEditorProps) {
  const value = isRecord(condition.value) ? condition.value : {}
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <DurationField
          duration={value.duration}
          onChange={(duration, mode) => onChange({ ...condition, value: { ...value, duration } }, mode)}
          numberTestId={editorId("number")}
          unitTestId={editorId("unit")}
          invalid={error !== null}
          describedBy={error === null ? undefined : errorId}
        />
        <span className="text-ui text-muted-foreground">ago</span>
      </div>
      <PresetChips
        condition={condition}
        level={level}
        counts={counts}
        onPick={(preset) => onChange(applyPreset(condition, preset, level), "now")}
        labelId={labelId}
      />
    </>
  )
}
