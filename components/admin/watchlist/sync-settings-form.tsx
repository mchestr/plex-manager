"use client"

import { useState } from "react"

import { updateGlobalWatchlistSyncSettings } from "@/actions/admin/watchlist"
import { Checkbox } from "@/components/ui/checkbox"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import type { WatchlistGlobalSettings } from "@/lib/data/watchlist"

const INTERVAL_ERROR = "Enter a whole number of minutes from 15 to 1440"

function intervalError(value: string): string | undefined {
  const minutes = Number(value)
  return Number.isInteger(minutes) && minutes >= 15 && minutes <= 1440 ? undefined : INTERVAL_ERROR
}

/**
 * The global sync flag and interval: the form behind the section's Edit,
 * saved by its footer. An interval out of range stops the save on its field;
 * while the draft is off the interval field is hidden, so a bad value there
 * gives way to the saved one rather than blocking the save. Cancel clears
 * the error with the edits.
 */
export function useWatchlistForm(saved: WatchlistGlobalSettings) {
  const toast = useToast()
  const [error, setError] = useState<string>()
  const settings = useSettingsForm({ enabled: saved.enabled, interval: String(saved.intervalMinutes) }, async (values) => {
    const interval = values.enabled || !intervalError(values.interval) ? values.interval : String(saved.intervalMinutes)
    const invalid = intervalError(interval)
    if (invalid) {
      setError(invalid)
      return { ok: false }
    }
    const result = await updateGlobalWatchlistSyncSettings({
      watchlistSyncEnabled: values.enabled,
      watchlistSyncIntervalMinutes: Number(interval),
    })
    // UPSTREAM_UNAVAILABLE comes after the write, so it closes the form like a success
    if (!result.success && result.code !== "UPSTREAM_UNAVAILABLE") {
      const field = result.fieldErrors?.watchlistSyncIntervalMinutes?.[0]
      if (field) setError(field)
      else toast.showError(result.error)
      return { ok: false }
    }
    setError(undefined)
    // The action revalidates the page, so the summary and the section's status follow
    if (result.success) toast.showSuccess("Watchlist sync saved")
    // Saved, but the job queue did not answer: the copy asks for another save later
    else toast.showError(result.error)
    return { ok: true, keep: { ...values, interval } }
  })
  return {
    values: settings.values,
    /** Changes fields; a new interval replaces a refused one's error with the live check. */
    set: (patch: Partial<typeof settings.values>) => {
      settings.set(patch)
      if ("interval" in patch) setError(undefined)
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
 * The fields behind Edit: the global flag as a Checkbox, since it saves with
 * Save (NN/g, "Toggle-switch guidelines"), and the interval while the draft
 * is on.
 */
export function WatchlistSyncFields({ state }: { state: ReturnType<typeof useWatchlistForm> }) {
  const { values, set, form, error } = state
  return (
    <div className="flex flex-col gap-6" data-testid="watchlist-sync-settings">
      <div className="flex items-start gap-3">
        <Checkbox
          id="watchlist-sync-enabled"
          checked={values.enabled}
          onCheckedChange={(enabled) => set({ enabled })}
          disabled={form.isPending}
          aria-describedby="watchlist-sync-enabled-hint"
          className="mt-0.5"
          data-testid="watchlist-sync-global-toggle"
        />
        <div className="flex flex-col">
          <Label htmlFor="watchlist-sync-enabled">Watchlist sync</Label>
          <span id="watchlist-sync-enabled-hint" className="text-label text-muted-foreground">
            While this is off, members cannot turn on sync.
          </span>
        </div>
      </div>
      {values.enabled && (
        <FormField name="watchlist-sync-interval" label="Sync interval" description="Minutes between checks, from 15 to 1440." error={error ?? intervalError(values.interval)}>
          <Input
            type="number"
            min="15"
            max="1440"
            value={values.interval}
            onValueChange={(interval) => set({ interval })}
            disabled={form.isPending}
            className="w-32"
            data-testid="watchlist-sync-interval-input"
          />
        </FormField>
      )}
    </div>
  )
}
