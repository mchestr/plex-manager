import { ShareLinksTable } from "@/components/admin/shares/share-links-table"
import { ChartCard } from "@/components/ui/chart-card"
import { DateRangeFilter } from "@/components/ui/date-range-filter"
import { PageHeader } from "@/components/ui/page-header"
import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import { getShareAnalytics, listShareLinks, SHARE_LINK_SORTS } from "@/lib/admin/analytics/shares"
import { getFormat } from "@/lib/settings/app-settings"
import { parseDateRange } from "@/lib/ui/date-range"
import { parseTableParams } from "@/lib/ui/table-params"
import { formatPeriod } from "@/lib/utils/day-window"
import { assertAdmin } from "@/lib/admin"

type Params = Record<string, string | string[] | undefined>

export default async function SharesDashboardPage({ searchParams }: { searchParams: Promise<Params> }) {
  await assertAdmin()
  const params = await searchParams
  const range = parseDateRange(params)
  const table = parseTableParams(params, { sortable: SHARE_LINK_SORTS, defaultSort: { id: "created", desc: true } })
  const f = await getFormat()
  const zone = f.settings.timeZone
  const [stats, links] = await Promise.all([
    getShareAnalytics(range, zone),
    listShareLinks({ page: table.page, pageSize: table.pageSize, sort: table.sort }),
  ])
  const period = formatPeriod(stats.window, f.settings)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-shares-page">
      <PageHeader
        title="Share analytics"
        meta={<span data-testid="admin-shares-period">Period: {period}</span>}
        data-testid="admin-shares-header"
      />
      <DateRangeFilter zone={zone} data-testid="shares-dates" />
      <StatGrid data-testid="shares-stats">
        <StatTile label="Public links on" value={f.number(stats.linksOn)} data-testid="shares-links-on" />
        <StatTile
          label="Visits in the period"
          value={f.number(stats.visitsInPeriod)}
          meta={
            stats.legacyVisitsInPeriod > 0
              ? `Plus ${f.number(stats.legacyVisitsInPeriod)} to older v2 links`
              : undefined
          }
          data-testid="shares-visits"
        />
        <StatTile label="Links created" value={f.number(stats.linksCreatedInPeriod)} data-testid="shares-created" />
        <StatTile
          label="Visits per link"
          value={f.number(stats.averageVisitsPerLink, { maximumFractionDigits: 1 })}
          meta="Visits in the period for each link that is on"
          data-testid="shares-average"
        />
      </StatGrid>
      <ChartCard
        title="Links and visits per day"
        description={period}
        summary={`Share links created and visits per day, ${period}`}
        spec={{
          kind: "bar",
          x: { type: "day", keys: stats.window.keys },
          series: [
            { id: "links", label: "Links created", values: stats.daily.map((day) => day.links) },
            { id: "visits", label: "Visits", values: stats.daily.map((day) => day.visits) },
          ],
          format: "number",
        }}
        data-testid="shares-daily-chart"
      />
      <section aria-labelledby="shares-links-heading" className="flex flex-col gap-3">
        <h2 id="shares-links-heading" className="text-h3">
          Links
        </h2>
        <ShareLinksTable rows={links.rows} total={links.total} page={table.page} pageSize={table.pageSize} sort={table.sort} />
      </section>
    </div>
  )
}
