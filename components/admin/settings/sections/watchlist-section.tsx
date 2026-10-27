"use client"

import type { ReactNode } from "react"

import {
  useWatchlistForm,
  WatchlistSyncFields,
  WatchlistSyncFigures,
  type WatchlistGlobalSettings,
} from "@/components/admin/settings/watchlist-sync-settings"
import { SettingsSection } from "@/components/ui/settings-section"
import { SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import type { WatchlistSyncStats } from "@/lib/admin/watchlist-stats"
import type { SectionHealth } from "@/lib/settings/connection-status"

interface WatchlistSectionProps {
  saved: WatchlistGlobalSettings
  /** The figures under the settings, started by the page and read inside Suspense. */
  stats: Promise<WatchlistSyncStats | null>
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
 * Watchlist sync (P10.20): the saved flag and interval as a summary until
 * Edit, then a Checkbox and the interval saved through the section footer.
 * The figures follow in both modes while the saved setting is on.
 */
export function WatchlistSection({ saved, stats, health, footerMeta }: WatchlistSectionProps) {
  const watchlist = useWatchlistForm(saved)
  return (
    <SettingsSection
      id="watchlist"
      title="Watchlist sync"
      description="Turns members' Plex watchlists into Overseerr requests. Members turn it on for themselves."
      status={health.status}
      checkedAt={health.checkedAt}
      form={watchlist.form}
      view={<WatchlistSummary saved={saved} />}
      after={saved.enabled && <WatchlistSyncFigures stats={stats} />}
      footerMeta={footerMeta}
    >
      <WatchlistSyncFields state={watchlist} />
    </SettingsSection>
  )
}
