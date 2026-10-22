"use client"

import type { ReactNode } from "react"

import { useWatchlistForm, WatchlistSyncFields, type WatchlistGlobalSettings } from "@/components/admin/settings/watchlist-sync-settings"
import { SettingsSection } from "@/components/ui/settings-section"
import type { WatchlistSyncStats } from "@/lib/admin/watchlist-stats"
import type { SectionHealth } from "@/lib/settings/connection-status"

interface WatchlistSectionProps {
  saved: WatchlistGlobalSettings
  /** The figures under the fields, started by the page and read inside Suspense. */
  stats: Promise<WatchlistSyncStats | null>
  health: SectionHealth
  /** "Last saved ... by ..." from the audit log. */
  footerMeta?: ReactNode
}

/** Watchlist sync: the global switch and interval save through the section footer (P10.20). */
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
      footerMeta={footerMeta}
    >
      <WatchlistSyncFields state={watchlist} stats={stats} />
    </SettingsSection>
  )
}
