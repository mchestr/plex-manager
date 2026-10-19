"use client"

import { updateServerTimeZone } from "@/actions/admin"
import { Button } from "@/components/ui/button"
import { StyledDropdown } from "@/components/ui/styled-dropdown"
import { useToast } from "@/components/ui/toast"
import { normalizeTimeZone, timeZoneOptions } from "@/lib/utils/zoned-time"
import { useRouter } from "next/navigation"
import { useMemo, useState, useSyncExternalStore, useTransition } from "react"

interface ServerTimeZoneFormProps {
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
 * The server time zone setting. While none is stored, the browser's zone is
 * pre-selected; it is read only after hydration, so the server and the first
 * client render agree.
 */
export function ServerTimeZoneForm({ configured, effective }: ServerTimeZoneFormProps) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [chosen, setChosen] = useState<string | null>(null)
  const detected = useSyncExternalStore(noSubscription, browserZone, () => null)
  const optgroups = useMemo(() => zoneGroups(), [])

  const value = chosen ?? configured ?? detected ?? effective

  const save = () => {
    startTransition(async () => {
      const result = await updateServerTimeZone(value)
      if (result.success) {
        setChosen(null)
        toast.showSuccess(`Server time zone set to ${result.timezone}`)
        router.refresh()
      } else {
        toast.showError(result.error || "Failed to update the server time zone")
      }
    })
  }

  return (
    <div className="flex flex-col gap-2" data-testid="server-time-zone-form">
      <label htmlFor="server-time-zone" className="text-xs font-medium">
        Server time zone
      </label>
      <p className="text-xs" data-testid="server-time-zone-effective">
        {configured
          ? `In effect: ${effective}.`
          : `In effect: ${effective}, from the TZ environment variable or UTC. Saving a zone here overrides it.`}{" "}
        Season dates, announcement expiry and Rewind times use it.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <StyledDropdown
          id="server-time-zone"
          value={value}
          onChange={setChosen}
          optgroups={optgroups}
          disabled={isPending}
          className="flex-1"
          data-testid="server-time-zone-select"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={save}
          disabled={isPending || value === configured}
          data-testid="server-time-zone-save-button"
        >
          {isPending ? "Saving..." : "Save time zone"}
        </Button>
      </div>
    </div>
  )
}
