"use client"

import type { ReactNode } from "react"

import { useWatchlistForm, WatchlistSyncFields, type WatchlistGlobalSettings } from "@/components/admin/settings/watchlist-sync-settings"
import { SettingsSection } from "@/components/ui/settings-section"
import type { SectionHealth } from "@/lib/settings/connection-status"

interface WatchlistSectionProps {
  saved: WatchlistGlobalSettings
  health: SectionHealth
  /** "Last saved ... by ..." from the audit log. */
  footerMeta?: ReactNode
}

/** Watchlist sync: the global switch and interval save through the section footer (P10.20). */
export function WatchlistSection({ saved, health, footerMeta }: WatchlistSectionProps) {
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
      <WatchlistSyncFields state={watchlist} />
    </SettingsSection>
  )
}
