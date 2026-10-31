"use client"

import type { ReactNode } from "react"

import { ServerTimeZoneField, ServerTimeZoneSummary, useTimeZoneForm, type ServerTimeZone } from "@/components/admin/settings/server-time-zone-form"
import { SettingsSection } from "@/components/ui/settings-section"

/**
 * The server time zone (6.4). It opens read-only on the saved zone; Edit, or
 * Rewind's "Change the server time zone" (which focuses
 * `server-time-zone-select`), swaps in the picker, which saves through the
 * section footer.
 */
export function TimeZoneSection({ timeZone, footerMeta }: { timeZone: ServerTimeZone; footerMeta?: ReactNode }) {
  const zone = useTimeZoneForm(timeZone)
  return (
    <SettingsSection id="time-zone" title="Time zone" form={zone.form} footerMeta={footerMeta} view={<ServerTimeZoneSummary timeZone={timeZone} />}>
      <ServerTimeZoneField state={zone} />
    </SettingsSection>
  )
}
