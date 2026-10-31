"use client"

import Link from "next/link"
import { useId, type ReactNode } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Label, labelClasses } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSettingsEdit } from "@/components/ui/settings-edit-context"
import { cn } from "@/lib/utils"
import { daysInMonth } from "@/lib/validations/rewind-settings"

interface Option {
  value: string
  label: string
}

/** The Audience choices, shared by the Select and the summary. */
export const AUDIENCES: readonly Option[] = [
  { value: "admins", label: "Admins only" },
  { value: "all", label: "Everyone" },
]

/** The LLM mode choices, shared by the Select and the summary. */
export const LLM_MODES: readonly Option[] = [
  { value: "standard", label: "Standard" },
  { value: "economy", label: "Economy (lower-cost model)" },
  { value: "off", label: "Off (template text)" },
]

interface CheckboxFieldProps {
  name: string
  label: string
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
}

/**
 * A labelled checkbox with its description under the label, for a flag that
 * saves with the section's Save. A switch would read as acting at once, so a
 * form with an explicit Save uses a checkbox (NN/g, "Toggle-switch guidelines").
 */
export function CheckboxField({ name, label, description, checked, onChange }: CheckboxFieldProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={onChange}
          aria-describedby={description ? `${id}-description` : undefined}
          data-testid={`rewind-settings-${name}`}
        />
        <Label htmlFor={id}>{label}</Label>
      </div>
      {description && (
        <p id={`${id}-description`} className="pl-6 text-label text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  )
}

interface SelectFieldProps {
  name: string
  label: string
  description?: ReactNode
  items: readonly Option[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  /** Keeps the label as the trigger's accessible name only, for a field a legend already labels. */
  hideLabel?: boolean
  /** The id of an error shown outside the field: marks the trigger invalid and describes it by the error. */
  errorId?: string
}

/** A labelled Select (label, control, description: the `FormField` slots); the trigger carries the label as its name. */
export function SelectField({ name, label, description, items, value, onChange, disabled, hideLabel, errorId }: SelectFieldProps) {
  return (
    <Field name={name} disabled={disabled} invalid={Boolean(errorId)}>
      {!hideLabel && (
        <FieldLabel nativeLabel={false} render={<div />}>
          {label}
        </FieldLabel>
      )}
      <Select items={items} value={value} onValueChange={(next) => next && onChange(next)} disabled={disabled}>
        <SelectTrigger aria-label={label} aria-describedby={errorId} data-testid={`rewind-settings-${name}-trigger`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} label={item.label} data-testid={`rewind-settings-${name}-option-${item.value}`}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const MONTH_ITEMS = MONTHS.map((label, index) => ({ value: String(index + 1).padStart(2, "0"), label }))

/** An `MM-DD` day as the month and day Selects read it: "December 1". */
export function monthDayLabel(value: string): string {
  const [month, day] = value.split("-")
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`
}

/** The Time zone section's control, which the zone note's link focuses. */
const SERVER_TIME_ZONE_FIELD = '[data-testid="server-time-zone-select"]'

/**
 * The zone the season dates are evaluated in, with "Change the server time
 * zone". The `#time-zone` href reveals the System group (`SettingsLayout`),
 * and the click also opens the Time zone section on its field, since
 * "Change" says the admin means to edit it (GOV.UK, "Check answers").
 */
export function TimeZoneNote({ zone }: { zone: string }) {
  const requestEdit = useSettingsEdit()
  return (
    <p className="text-label text-muted-foreground" data-testid="rewind-settings-zone">
      Dates are in {zone}. A season that crosses the new year belongs to the year it opens in.{" "}
      <Link
        data-testid="rewind-settings-time-zone-link"
        href="#time-zone"
        onClick={() => requestEdit?.("time-zone", { focus: SERVER_TIME_ZONE_FIELD })}
        className="text-foreground underline underline-offset-3"
      >
        Change the server time zone
      </Link>
    </p>
  )
}

interface MonthDayFieldProps {
  name: string
  /** "Opens" or "Closes". */
  label: string
  /** `MM-DD`. */
  value: string
  onChange: (value: string) => void
  error?: string
}

/**
 * A month Select and a day Select for one `MM-DD` date; the day clamps to the
 * month's length. An error marks both Selects invalid and describes them by
 * it, so a refused save can focus the date.
 */
export function MonthDayField({ name, label, value, onChange, error }: MonthDayFieldProps) {
  const errorId = useId()
  const describedBy = error ? errorId : undefined
  const [month, day] = value.split("-")
  const dayItems = Array.from({ length: daysInMonth(Number(month)) }, (_, i) => {
    const text = String(i + 1)
    return { value: text.padStart(2, "0"), label: text }
  })
  const setMonth = (next: string) => {
    const last = daysInMonth(Number(next))
    onChange(`${next}-${String(Math.min(Number(day), last)).padStart(2, "0")}`)
  }

  return (
    <fieldset className="flex flex-col gap-1.5" data-testid={`rewind-settings-${name}`}>
      <legend className={cn(labelClasses, "mb-1.5")}>{label}</legend>
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <SelectField name={`${name}-month`} label={`${label}: month`} hideLabel items={MONTH_ITEMS} value={month} onChange={setMonth} errorId={describedBy} />
        <SelectField
          name={`${name}-day`}
          label={`${label}: day`}
          hideLabel
          items={dayItems}
          value={day}
          onChange={(next) => onChange(`${month}-${next}`)}
          errorId={describedBy}
        />
      </div>
      {error && (
        <p id={errorId} className="text-label text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  )
}

interface CheckboxListProps {
  name: string
  legend: string
  description?: ReactNode
  options: readonly (Option & { disabled?: boolean; note?: string })[]
  selected: readonly string[]
  onChange: (selected: string[]) => void
  empty?: ReactNode
}

/** A fieldset of labelled checkboxes; `onChange` gets the new selection in option order. */
export function CheckboxList({ name, legend, description, options, selected, onChange, empty }: CheckboxListProps) {
  const prefix = useId()
  const toggle = (value: string, checked: boolean) => {
    const next = new Set(selected)
    if (checked) next.add(value)
    else next.delete(value)
    onChange(options.map((option) => option.value).filter((option) => next.has(option)))
  }

  return (
    <fieldset className="flex flex-col gap-2" data-testid={`rewind-settings-${name}`}>
      <legend className="mb-1 text-ui font-medium text-foreground">{legend}</legend>
      {options.length === 0 && empty && <p className="text-label text-muted-foreground">{empty}</p>}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <li key={option.value} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${prefix}-${option.value}`}
                checked={selected.includes(option.value)}
                onCheckedChange={(checked) => toggle(option.value, checked)}
                disabled={option.disabled}
                aria-describedby={option.note ? `${prefix}-${option.value}-note` : undefined}
                data-testid={`rewind-settings-${name}-${option.value}`}
              />
              <label htmlFor={`${prefix}-${option.value}`} className="text-ui text-foreground">
                {option.label}
              </label>
            </div>
            {option.note && (
              <span id={`${prefix}-${option.value}-note`} className="pl-6 text-label text-muted-foreground">
                {option.note}
              </span>
            )}
          </li>
        ))}
      </ul>
      {description && <p className="text-label text-muted-foreground">{description}</p>}
    </fieldset>
  )
}
