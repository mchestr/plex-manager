"use client"

import { WatchlistSyncSettings } from "@/components/admin/settings/watchlist-sync-settings"
import { SettingsSection } from "@/components/ui/settings-section"
import type { SectionHealth } from "@/lib/settings/connection-status"

/** Watchlist sync: the global switch and interval save on their own. */
export function WatchlistSection({ health }: { health: SectionHealth }) {
  return (
    <SettingsSection
      id="watchlist"
      title="Watchlist sync"
      description="Turns members' Plex watchlists into Overseerr requests. Members turn it on for themselves."
      status={health.status}
      checkedAt={health.checkedAt}
    >
      <WatchlistSyncSettings />
    </SettingsSection>
  )
}
