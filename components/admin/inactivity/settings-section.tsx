"use client"

import { type ReactNode, useEffect } from "react"

import { RunNow } from "@/components/admin/inactivity/run-now"
import { memberCount } from "@/components/admin/inactivity/run-outcome"
import { InactivityFields, useInactivityForm } from "@/components/admin/inactivity/settings-form"
import { SettingsSection } from "@/components/ui/settings-section"
import { NotSet, SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import type { InactivityRunRow } from "@/lib/data/inactivity"
import type { InactivitySettingsValues } from "@/lib/inactivity/settings"

interface InactivitySettingsSectionProps {
  saved: InactivitySettingsValues
  /** Redis is set up, so the daily run is scheduled. */
  scheduled: boolean
  /** A scheduled run's safety limit; null while the Plex shares are unknown. */
  scheduledLimit: number | null
  /** The members the preview says a run would remove now, by id. */
  removalIds: string[]
  lastRun: InactivityRunRow | null
  /** "Last saved ... by ..." from the audit log. */
  footerMeta?: ReactNode
}

const row = (key: string) => `settings-inactivity-summary-${key}`

/** The saved switch and days, when the daily run happens, and its safety limit. */
function InactivitySummary({ saved, scheduled, scheduledLimit }: Pick<InactivitySettingsSectionProps, "saved" | "scheduled" | "scheduledLimit">) {
  return (
    <SettingsSummary data-testid="settings-inactivity-summary">
      <SettingsSummaryRow label="Automatic removal" data-testid={row("enabled")}>
        {saved.enabled ? "On" : "Off"}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Remove after" data-testid={row("threshold")}>
        {saved.thresholdDays} days without a play
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Daily run" data-testid={row("schedule")}>
        {scheduled ? "Every day at about 02:17, server time" : <NotSet>Not scheduled, because Redis is not set up. Use Run now.</NotSet>}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Safety limit" data-testid={row("limit")}>
        {scheduledLimit === null ? <NotSet>Unknown until the Plex shares can be read</NotSet> : `${memberCount(scheduledLimit)} per scheduled run`}
      </SettingsSummaryRow>
    </SettingsSummary>
  )
}

/**
 * The inactivity sweep's settings card, at the top of its page (the watchlist
 * card's pattern): the saved values as a summary until Edit, then the form,
 * saved through the section footer. The last run and Run now act on the
 * saved values, so they show in view mode only. No settings layout watches
 * the card here, so while it has unsaved changes it asks the browser to
 * confirm before the tab closes.
 */
export function InactivitySettingsSection({ saved, scheduled, scheduledLimit, removalIds, lastRun, footerMeta }: InactivitySettingsSectionProps) {
  const inactivity = useInactivityForm(saved)

  const dirty = inactivity.form.isDirty
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  return (
    <SettingsSection
      id="inactivity"
      title="Automatic removal"
      description="Removes Plex access from members who have not played anything for a set number of days. Needs Tautulli."
      form={inactivity.form}
      view={<InactivitySummary saved={saved} scheduled={scheduled} scheduledLimit={scheduledLimit} />}
      after={(editing) => !editing && <RunNow enabled={saved.enabled} removalIds={removalIds} lastRun={lastRun} />}
      footerMeta={footerMeta}
    >
      <InactivityFields state={inactivity} />
    </SettingsSection>
  )
}
