"use client"

import { type ReactNode, useState } from "react"

import { updateCleanupSettings } from "@/actions/admin/cleanup-settings"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { NumberField } from "@/components/ui/number-field"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import { settingsSavedToast } from "@/lib/cleanup/actions/settings/words"
import { cn } from "@/lib/utils"

/** The input of `updateCleanupSettings`: one section and its values (TS 3.5). */
export type SettingsInput = Parameters<typeof updateCleanupSettings>[0]

/** The error of each field of a section, by field key. */
export type FieldErrors = Partial<Record<string, string>>

/** What a section's check gives: the action input, or the errors that stop the save. */
export type SectionCheck = { input: SettingsInput } | { errors: FieldErrors }

/** "On" or "Off": the read view of a checkbox. */
export const onOff = (on: boolean): string => (on ? "On" : "Off")

/** "on" or "off": the changed-from words of a checkbox. */
export const onOffWord = (on: boolean): string => (on ? "on" : "off")

/** "1 day", "30 days". */
export const daysText = (days: number): string => `${days} ${days === 1 ? "day" : "days"}`

/** The error of a whole number outside `min` to `max` (UX 8.4, X4): "Enter a whole number of days from 1 to 3650." */
export function rangeError(value: number | null, min: number, max: number, unit: string): string | undefined {
  if (value !== null && Number.isInteger(value) && value >= min && value <= max) return undefined
  return `Enter a whole number of ${unit} from ${min} to ${max}.`
}

/**
 * One Settings section's form (UX 4.10): `useSettingsForm` with the check of
 * the section, the save through `updateCleanupSettings`, and the toast of
 * UX 8.9. A save with `exitsApplied: false` toasts the busy words. A field
 * error stops the save on its field. A refusal of the server shows its words
 * in an error toast. Cancel clears the errors with the edits.
 */
export function useCleanupSettingsForm<T>(initial: T, check: (values: T) => SectionCheck, onSaved?: () => void) {
  const toast = useToast()
  const [errors, setErrors] = useState<FieldErrors>({})
  const settings = useSettingsForm(initial, async (values) => {
    const checked = check(values)
    if ("errors" in checked) {
      setErrors(checked.errors)
      return { ok: false }
    }
    const result = await updateCleanupSettings(checked.input)
    if (!result.success) {
      toast.showError(result.error)
      return { ok: false }
    }
    setErrors({})
    toast.showSuccess(settingsSavedToast(result.data))
    onSaved?.()
    return { ok: true }
  })
  return {
    values: settings.values,
    /** Changes fields; a changed field drops the error that a save showed on it (`g4` drops `g4-days`). */
    set: (patch: Partial<T>) => {
      settings.set(patch)
      const changed = Object.keys(patch)
      setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !changed.some((k) => key === k || key.startsWith(`${k}-`)))))
    },
    errors,
    form: {
      ...settings.form,
      onDiscard: () => {
        settings.form.onDiscard()
        setErrors({})
      },
    },
  }
}

/** "Changed from 180 days.", in the info tone of the shot (UX 4.10, `form-field.tsx`). */
export function ChangedFrom({ value, id }: { value: string; id?: string }) {
  return (
    <span id={id} className="text-label text-info">
      Changed from {value}.
    </span>
  )
}

/** A field error under its control. */
function FieldErrorText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span id={id} className="text-label text-destructive" data-testid={id}>
      {children}
    </span>
  )
}

interface CheckboxFieldProps {
  /** The id and the test id of the checkbox (UX 10.2). */
  id: string
  label: ReactNode
  hint?: ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  /** The saved state, when the draft differs from it. */
  changedFrom?: boolean
  className?: string
}

/**
 * An on and off control of an Edit form: a `Checkbox`, never a `Switch`,
 * because it saves with Save (UX 4.10, R07 3.3). The label names it, and the
 * hint and the changed-from line describe it.
 */
export function CheckboxField({ id, label, hint, checked, onCheckedChange, disabled, changedFrom, className }: CheckboxFieldProps) {
  const hintId = `${id}-hint`
  const changedId = `${id}-changed`
  const described = [hint ? hintId : null, changedFrom !== undefined ? changedId : null].filter(Boolean).join(" ")
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next)}
        disabled={disabled}
        aria-describedby={described || undefined}
        className="mt-0.5"
        data-testid={id}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint && (
          <span id={hintId} className="text-label text-muted-foreground">
            {hint}
          </span>
        )}
        {changedFrom !== undefined && <ChangedFrom id={changedId} value={onOffWord(changedFrom)} />}
      </div>
    </div>
  )
}

interface NumberInputFieldProps {
  /** The id and the test id of the input (UX 10.2). */
  id: string
  label: string
  value: number | null
  onValueChange: (value: number | null) => void
  /** The words after the field: "days", "at a time". */
  unit?: string
  hint?: string
  error?: string
  /** The saved value as words ("180 days"), when the draft differs from it. */
  changedFrom?: string
  disabled?: boolean
}

/** A labelled `NumberField` with its unit, hint, changed-from line and error (UX 4.10). */
export function NumberInputField({ id, label, value, onValueChange, unit, hint, error, changedFrom, disabled }: NumberInputFieldProps) {
  const described = [changedFrom !== undefined ? `${id}-changed` : null, hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ")
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <NumberField
          id={id}
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          invalid={Boolean(error)}
          aria-describedby={described || undefined}
          data-testid={id}
        />
        {unit && <span className="text-ui text-muted-foreground">{unit}</span>}
      </div>
      {(changedFrom !== undefined || hint) && (
        <span className="flex flex-wrap gap-x-1 text-label text-muted-foreground">
          {changedFrom !== undefined && <ChangedFrom id={`${id}-changed`} value={changedFrom} />}
          {hint && <span id={`${id}-hint`}>{hint}</span>}
        </span>
      )}
      {error && <FieldErrorText id={`${id}-error`}>{error}</FieldErrorText>}
    </div>
  )
}

/** A badge with a muted line under it: the state of a section in its header ("On", "Read at 3:07 AM today"). */
export function SectionState({ badge, line, testId }: { badge: ReactNode; line?: ReactNode; testId: string }) {
  return (
    <span className="flex flex-col items-start gap-0.5 sm:items-end" data-testid={testId}>
      {badge}
      {line && <span className="text-caption whitespace-nowrap text-muted-foreground">{line}</span>}
    </span>
  )
}
