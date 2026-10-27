"use client"

import { useId, type ReactNode } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { FormField } from "@/components/ui/form-field"
import { labelClasses } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { daysInMonth } from "@/lib/validations/rewind-settings"

interface SwitchFieldProps {
  name: string
  label: string
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

/** A labelled switch with its description, in a `FormField`; the control sits in a slot as tall as an input so a row lines up. */
export function SwitchField({ name, label, description, checked, onChange, disabled }: SwitchFieldProps) {
  return (
    <FormField name={name} label={label} description={description}>
      <div className="flex h-10 items-center md:h-9">
        <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} data-testid={`rewind-settings-${name}`} />
      </div>
    </FormField>
  )
}

interface Option {
  value: string
  label: string
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
}

/** A labelled Select (label, control, description: the `FormField` slots); the trigger carries the label as its name. */
export function SelectField({ name, label, description, items, value, onChange, disabled, hideLabel }: SelectFieldProps) {
  return (
    <Field name={name} disabled={disabled}>
      {!hideLabel && (
        <FieldLabel nativeLabel={false} render={<div />}>
          {label}
        </FieldLabel>
      )}
      <Select items={items} value={value} onValueChange={(next) => next && onChange(next)} disabled={disabled}>
        <SelectTrigger aria-label={label} data-testid={`rewind-settings-${name}-trigger`}>
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

interface MonthDayFieldProps {
  name: string
  /** "Opens" or "Closes". */
  label: string
  /** `MM-DD`. */
  value: string
  onChange: (value: string) => void
  error?: string
}

/** A month Select and a day Select for one `MM-DD` date; the day clamps to the month's length. */
export function MonthDayField({ name, label, value, onChange, error }: MonthDayFieldProps) {
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
        <SelectField name={`${name}-month`} label={`${label}: month`} hideLabel items={MONTH_ITEMS} value={month} onChange={setMonth} />
        <SelectField name={`${name}-day`} label={`${label}: day`} hideLabel items={dayItems} value={day} onChange={(next) => onChange(`${month}-${next}`)} />
      </div>
      {error && <p className="text-label text-destructive">{error}</p>}
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
