import { LastSaved } from "@/components/admin/settings/last-saved"
import { SyncSettingsSection } from "@/components/admin/watchlist/sync-settings-section"
import { WatchlistStatGrid } from "@/components/admin/watchlist/watchlist-stat-grid"
import { WatchlistTable } from "@/components/admin/watchlist/watchlist-table"
import { PageHeader } from "@/components/ui/page-header"
import { assertAdmin } from "@/lib/admin"
import { parseWatchlistFilter, WATCHLIST_DEFAULT_SORT, WATCHLIST_SORTS } from "@/lib/admin/watchlist-filter"
import { getWatchlistPage } from "@/lib/data/watchlist"
import { getFormat } from "@/lib/settings/app-settings"
import { getWatchlistLastSaved } from "@/lib/settings/audit-meta"
import { getWatchlistHealth } from "@/lib/settings/connection-health"
import { parseTableParams } from "@/lib/ui/table-params"

type Params = Record<string, string | string[] | undefined>

/**
 * Watchlist sync, under Community: its settings card (moved from Settings),
 * the figures, then every title members' watchlists synced, on the list page
 * pattern (ui-design-system 6.3): filters, sort and page come from the URL
 * and the rows load here.
 */
export default async function WatchlistPage({ searchParams }: { searchParams: Promise<Params> }) {
  await assertAdmin()
  const params = await searchParams
  const filter = parseWatchlistFilter(params)
  const table = parseTableParams(params, { sortable: WATCHLIST_SORTS, defaultSort: WATCHLIST_DEFAULT_SORT })
  const [{ settings, stats, rows, total }, health, lastSaved, f] = await Promise.all([
    getWatchlistPage({ ...filter, page: table.page, pageSize: table.pageSize, sort: table.sort }),
    getWatchlistHealth(),
    getWatchlistLastSaved(),
    getFormat(),
  ])
  const page = Math.min(table.page, Math.max(1, Math.ceil(total / table.pageSize)))

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-watchlist-page">
      <PageHeader
        title="Watchlist sync"
        data-testid="admin-watchlist-header"
      />
      <SyncSettingsSection
        saved={settings}
        health={health}
        // Nothing before a first save, so the card shows no empty footer
        footerMeta={lastSaved && <LastSaved id="watchlist" meta={lastSaved} />}
      />
      <WatchlistStatGrid stats={stats} f={f} />
      <WatchlistTable
        rows={rows}
        total={total}
        all={stats.titles}
        page={page}
        pageSize={table.pageSize}
        sort={table.sort}
        syncEnabled={settings.enabled}
      />
    </div>
  )
}
