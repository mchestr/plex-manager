import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import type { WatchlistStats } from "@/lib/data/watchlist"
import type { BoundFormat } from "@/lib/utils/format"

/** The four figures above the watchlist table, over every title whatever the filters. */
export function WatchlistStatGrid({ stats, f }: { stats: WatchlistStats; f: BoundFormat }) {
  return (
    <StatGrid data-testid="admin-watchlist-stats">
      <StatTile label="Members with sync on" value={f.number(stats.membersWithSyncOn)} data-testid="admin-watchlist-stat-members" />
      <StatTile
        label="Requests created"
        value={f.number(stats.requested)}
        unit={`of ${f.number(stats.titles)} ${stats.titles === 1 ? "title" : "titles"}`}
        data-testid="admin-watchlist-stat-requested"
      />
      <StatTile
        label="Not allowed"
        value={f.number(stats.notAllowed)}
        meta="Overseerr refused them for quota or permissions"
        data-testid="admin-watchlist-stat-not-allowed"
      />
      <StatTile
        label="No TMDB match"
        value={f.number(stats.noMatch)}
        meta="Each sync tries them again"
        data-testid="admin-watchlist-stat-no-match"
      />
    </StatGrid>
  )
}
