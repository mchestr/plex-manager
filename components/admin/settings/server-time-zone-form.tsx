"use client"

import { useMemo, useState, useSyncExternalStore } from "react"

import { updateServerTimeZone } from "@/actions/admin"
import { FormField } from "@/components/ui/form-field"
import { StyledDropdown } from "@/components/ui/styled-dropdown"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import { normalizeTimeZone, timeZoneOptions } from "@/lib/utils/zoned-time"

export interface ServerTimeZone {
  /** `Config.timezone`, or null when it was never set. */
  configured: string | null
  /** The zone in effect (`serverZone()`): the setting, else `TZ`, else UTC. */
  effective: string
}

const noSubscription = () => () => {}
const browserZone = () => normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)

/** The zones grouped by region ("America", "Europe", ...), with UTC on its own. */
function zoneGroups() {
  const groups = new Map<string, { value: string; label: string }[]>()
  for (const zone of timeZoneOptions()) {
    const region = zone.includes("/") ? zone.slice(0, zone.indexOf("/")) : "UTC"
    groups.set(region, [...(groups.get(region) ?? []), { value: zone, label: zone.replaceAll("_", " ") }])
  }
  return [...groups].map(([label, options]) => ({ label, options }))
}

/**
 * The server time zone as part of the System section's form (UI-31). While
 * none is stored, the browser's zone is shown selected; it is read only after
 * hydration, so the server and the first client render agree.
 */
export function useTimeZoneForm({ configured, effective }: ServerTimeZone) {
  const toast = useToast()
  const [error, setError] = useState<string>()
  const detected = useSyncExternalStore(noSubscription, browserZone, () => null)
  const settings = useSettingsForm({ zone: configured ?? "" }, async ({ zone }) => {
    const result = await updateServerTimeZone(zone || detected || effective)
    if (!result.success) {
      setError(result.fieldErrors ? result.error : undefined)
      if (!result.fieldErrors) toast.showError(result.error)
      return
    }
    setError(undefined)
    toast.showSuccess(`Server time zone set to ${result.data.timezone}`)
  })
  return { ...settings, error, shown: settings.values.zone || detected || effective, configured, effective }
}

/** The zone picker, with what is in effect now and where it comes from. */
export function ServerTimeZoneField({ state }: { state: ReturnType<typeof useTimeZoneForm> }) {
  const optgroups = useMemo(() => zoneGroups(), [])
  const description = state.configured
    ? `In effect: ${state.effective}. Season dates, announcement expiry and Rewind times use it.`
    : `In effect: ${state.effective}, from the TZ environment variable or UTC. Saving a zone here overrides it. Season dates, announcement expiry and Rewind times use it.`

  return (
    <div data-testid="server-time-zone-form">
      <FormField name="server-time-zone" label="Server time zone" description={<span data-testid="server-time-zone-effective">{description}</span>} error={state.error}>
        <StyledDropdown
          value={state.shown}
          onChange={(zone) => state.set({ zone })}
          optgroups={optgroups}
          disabled={state.form.isPending}
          data-testid="server-time-zone-select"
        />
      </FormField>
    </div>
  )
}
