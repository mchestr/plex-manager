"use client"

import { useState } from "react"

import { updateInactivitySettings } from "@/actions/admin/inactivity"
import { Checkbox } from "@/components/ui/checkbox"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import type { InactivitySettingsValues } from "@/lib/inactivity/settings"

const DAYS_ERROR = "Enter a whole number of days from 30 to 3650"

function daysError(value: string): string | undefined {
  const days = Number(value)
  return Number.isInteger(days) && days >= 30 && days <= 3650 ? undefined : DAYS_ERROR
}

/**
 * The switch and the days without a play: the form behind the section's
 * Edit, saved by its footer. Days out of range stop the save on their field,
 * as does the server's own check; Cancel clears the error with the edits.
 */
export function useInactivityForm(saved: InactivitySettingsValues) {
  const toast = useToast()
  const [error, setError] = useState<string>()
  const settings = useSettingsForm({ enabled: saved.enabled, days: String(saved.thresholdDays) }, async (values) => {
    const invalid = daysError(values.days)
    if (invalid) {
      setError(invalid)
      return { ok: false }
    }
    const result = await updateInactivitySettings({ enabled: values.enabled, thresholdDays: Number(values.days) })
    if (!result.success) {
      const field = result.fieldErrors?.thresholdDays?.[0]
      if (field) setError(field)
      else toast.showError(result.error)
      return { ok: false }
    }
    setError(undefined)
    // The action revalidates the page, so the summary and the preview follow
    toast.showSuccess("Inactivity settings saved")
    return { ok: true }
  })
  return {
    values: settings.values,
    /** Changes fields; new days replace a refused value's error with the live check. */
    set: (patch: Partial<typeof settings.values>) => {
      settings.set(patch)
      if ("days" in patch) setError(undefined)
    },
    error,
    form: {
      ...settings.form,
      onDiscard: () => {
        settings.form.onDiscard()
        setError(undefined)
      },
    },
  }
}

/**
 * The fields behind Edit: the switch as a Checkbox, since it saves with Save
 * (NN/g, "Toggle-switch guidelines"), and the days, which also set the
 * preview while removal is off.
 */
export function InactivityFields({ state }: { state: ReturnType<typeof useInactivityForm> }) {
  const { values, set, form, error } = state
  return (
    <div className="flex flex-col gap-6" data-testid="admin-inactivity-settings">
      <div className="flex items-start gap-3">
        <Checkbox
          id="admin-inactivity-enabled"
          checked={values.enabled}
          onCheckedChange={(enabled) => set({ enabled })}
          disabled={form.isPending}
          aria-describedby="admin-inactivity-enabled-hint"
          className="mt-0.5"
          data-testid="admin-inactivity-enabled-toggle"
        />
        <div className="flex flex-col">
          <Label htmlFor="admin-inactivity-enabled">Remove Plex access from inactive members</Label>
          <span id="admin-inactivity-enabled-hint" className="text-label text-muted-foreground">
            The daily run removes their access, as Remove Plex access does. When more members qualify than the safety
            limit, it removes no one.
          </span>
        </div>
      </div>
      <FormField
        name="inactivity-days"
        label="Days without a play"
        description="From 30 to 3650. A member who joined more recently counts from the day they joined."
        error={error ?? daysError(values.days)}
      >
        <Input
          type="number"
          min="30"
          max="3650"
          value={values.days}
          onValueChange={(days) => set({ days })}
          disabled={form.isPending}
          className="w-32"
          data-testid="admin-inactivity-days-input"
        />
      </FormField>
    </div>
  )
}
