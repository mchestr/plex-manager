"use client"

import { type ReactNode, useEffect } from "react"

import { useWatchlistForm, WatchlistSyncFields } from "@/components/admin/watchlist/sync-settings-form"
import { SettingsSection } from "@/components/ui/settings-section"
import { SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import type { WatchlistGlobalSettings } from "@/lib/data/watchlist"
import type { SectionHealth } from "@/lib/settings/connection-status"

interface SyncSettingsSectionProps {
  saved: WatchlistGlobalSettings
  health: SectionHealth
  /** "Last saved ... by ..." from the audit log. */
  footerMeta?: ReactNode
}

/** The saved flag, and the interval while sync is on. */
function WatchlistSummary({ saved }: { saved: WatchlistGlobalSettings }) {
  return (
    <SettingsSummary data-testid="settings-watchlist-summary">
      <SettingsSummaryRow label="Watchlist sync" data-testid="settings-watchlist-summary-enabled">
        {saved.enabled ? "On" : "Off"}
      </SettingsSummaryRow>
      {saved.enabled && (
        <SettingsSummaryRow label="Sync interval" data-testid="settings-watchlist-summary-interval">
          Every {saved.intervalMinutes} minutes
        </SettingsSummaryRow>
      )}
    </SettingsSummary>
  )
}

/**
 * Watchlist sync's settings card, at the top of its page (moved from
 * Settings, P10.20's pattern): the saved flag and interval as a summary until
 * Edit, then a Checkbox and the interval saved through the section footer.
 * No settings layout watches it here, so while it has unsaved changes it
 * asks the browser to confirm before the tab closes, as the settings page does.
 */
export function SyncSettingsSection({ saved, health, footerMeta }: SyncSettingsSectionProps) {
  const watchlist = useWatchlistForm(saved)

  const dirty = watchlist.form.isDirty
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  return (
    <SettingsSection
      id="watchlist"
      title="Sync settings"
      description="Needs Overseerr. Each member must also turn on sync on their home page."
      status={health.status}
      checkedAt={health.checkedAt}
      form={watchlist.form}
      view={<WatchlistSummary saved={saved} />}
      footerMeta={footerMeta}
    >
      <WatchlistSyncFields state={watchlist} />
    </SettingsSection>
  )
}
