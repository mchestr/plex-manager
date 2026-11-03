"use client"

import type { ReactNode } from "react"

import { SyncNow } from "@/components/admin/watchlist/sync-now"
import { useWatchlistForm, WatchlistSyncFields } from "@/components/admin/watchlist/sync-settings-form"
import { SettingsSection } from "@/components/ui/settings-section"
import { SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import type { WatchlistGlobalSettings } from "@/lib/data/watchlist"
import type { SectionHealth } from "@/lib/settings/connection-status"

interface SyncSettingsSectionProps {
  saved: WatchlistGlobalSettings
  health: SectionHealth
  /** `REDIS_URL` is set, so Sync now can queue the job. */
  redisConfigured: boolean
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
 * Sync now acts on the saved settings, so it shows in view mode only.
 */
export function SyncSettingsSection({ saved, health, redisConfigured, footerMeta }: SyncSettingsSectionProps) {
  const watchlist = useWatchlistForm(saved)

  return (
    <SettingsSection
      id="watchlist"
      title="Sync settings"
      description="Needs Overseerr. Each member must also turn on sync on their home page."
      status={health.status}
      checkedAt={health.checkedAt}
      form={watchlist.form}
      view={<WatchlistSummary saved={saved} />}
      after={(editing) => !editing && <SyncNow enabled={saved.enabled} redisConfigured={redisConfigured} />}
      footerMeta={footerMeta}
    >
      <WatchlistSyncFields state={watchlist} />
    </SettingsSection>
  )
}
