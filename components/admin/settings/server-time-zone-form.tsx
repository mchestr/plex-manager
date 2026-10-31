"use client"

import { useMemo, useRef, useState, useSyncExternalStore } from "react"

import { updateServerTimeZone } from "@/actions/admin/admin-config"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { NotSet, SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
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

/** A zone as the picker lists it: "America/New York". */
const zoneLabel = (zone: string) => zone.replaceAll("_", " ")

/** The zones grouped by region ("America", "Europe", ...), with UTC on its own. */
function zoneGroups() {
  const groups = new Map<string, { value: string; label: string }[]>()
  for (const zone of timeZoneOptions()) {
    const region = zone.includes("/") ? zone.slice(0, zone.indexOf("/")) : "UTC"
    groups.set(region, [...(groups.get(region) ?? []), { value: zone, label: zoneLabel(zone) }])
  }
  return [...groups].map(([label, options]) => ({ label, options }))
}

/**
 * The zone in use when it is not the one saved: with none saved, the app
 * falls back to `TZ`, else UTC (`serverZone()`). Null when they match.
 */
function zoneInUse({ configured, effective }: ServerTimeZone) {
  return configured === effective ? null : `Using ${zoneLabel(effective)}.`
}

/**
 * The server time zone as the Time zone section's form, saved with the
 * section's Save. A zone that was never set opens empty, since a clean Save
 * changes nothing: the browser's zone is offered as a one-click choice
 * (`suggested`), read only after hydration, and never shown as the setting.
 * A rejected zone is said on the field; Cancel clears it with the draft.
 */
export function useTimeZoneForm({ configured, effective }: ServerTimeZone) {
  const toast = useToast()
  const [error, setError] = useState<string>()
  const detected = useSyncExternalStore(noSubscription, browserZone, () => null)
  const settings = useSettingsForm({ zone: configured ?? "" }, async ({ zone }) => {
    const result = await updateServerTimeZone(zone)
    if (!result.success) {
      setError(result.fieldErrors ? result.error : undefined)
      if (!result.fieldErrors) toast.showError(result.error)
      return { ok: false }
    }
    setError(undefined)
    toast.showSuccess(`Server time zone set to ${zoneLabel(result.data.timezone)}`)
    return { ok: true }
  })

  return {
    values: settings.values,
    /** Picks a zone and clears the field's error. */
    set: (patch: { zone: string }) => {
      settings.set(patch)
      setError(undefined)
    },
    error,
    configured,
    effective,
    suggested: !configured && detected && detected !== settings.values.zone ? detected : null,
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
 * The saved zone in view mode, and the zone in use when it differs (none
 * saved). Never the browser's zone, which is not in use.
 */
export function ServerTimeZoneSummary({ timeZone }: { timeZone: ServerTimeZone }) {
  const inUse = zoneInUse(timeZone)
  return (
    <SettingsSummary data-testid="settings-time-zone-summary">
      <SettingsSummaryRow label="Server time zone" wide data-testid="settings-time-zone-summary-time-zone">
        <span className="block">{timeZone.configured ? zoneLabel(timeZone.configured) : <NotSet />}</span>
        {inUse && (
          <span className="mt-1 block text-label text-muted-foreground" data-testid="server-time-zone-effective">
            {inUse}
          </span>
        )}
      </SettingsSummaryRow>
    </SettingsSummary>
  )
}

/** The zone picker, with the zone in use when none is saved. */
export function ServerTimeZoneField({ state }: { state: ReturnType<typeof useTimeZoneForm> }) {
  const groups = useMemo(() => zoneGroups(), [])
  const items = useMemo(() => groups.flatMap((group) => group.options), [groups])
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { suggested } = state
  const inUse = zoneInUse(state)

  return (
    <div className="flex flex-col gap-2" data-testid="server-time-zone-form">
      <FormField
        name="server-time-zone"
        label="Server time zone"
        description={inUse && <span data-testid="server-time-zone-effective">{inUse}</span>}
        error={state.error}
      >
        <Select
          items={items}
          value={state.values.zone || null}
          onValueChange={(zone) => zone !== null && state.set({ zone })}
          disabled={state.form.isPending}
        >
          <SelectTrigger ref={triggerRef} aria-label="Server time zone" data-testid="server-time-zone-select">
            <SelectValue placeholder="Select a time zone" />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.options.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    label={option.label}
                    data-testid={`server-time-zone-select-option-${option.value}`}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      {suggested && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto self-start p-0"
          onClick={() => {
            state.set({ zone: suggested })
            // The button goes once its zone is picked; focus moves to the picker, which now shows it
            triggerRef.current?.focus()
          }}
          disabled={state.form.isPending}
          data-testid="server-time-zone-use-browser"
        >
          Use this browser&apos;s zone, {zoneLabel(suggested)}
        </Button>
      )}
    </div>
  )
}
