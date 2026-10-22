import { ChartCard } from "@/components/ui/chart-card"
import { rankedSpec } from "@/components/ui/chart-card/chart-spec"
import { DateRangeFilter } from "@/components/ui/date-range-filter"
import { PageHeader } from "@/components/ui/page-header"
import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import { getCostAnalysis } from "@/lib/admin/analytics/cost"
import { getFormat } from "@/lib/settings/app-settings"
import { parseDateRange } from "@/lib/ui/date-range"
import { formatPeriod } from "@/lib/utils/day-window"

export const dynamic = "force-dynamic"

type Params = Record<string, string | string[] | undefined>

export default async function CostAnalysisPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  // `startDate` and `endDate` were the old filter's params; bookmarks keep working.
  const range = parseDateRange(params) ?? parseDateRange(params, { from: "startDate", to: "endDate" })
  const f = await getFormat()
  const zone = f.settings.timeZone
  const cost = await getCostAnalysis(range, zone)
  const period = formatPeriod(cost.window, f.settings)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-cost-analysis-page">
      <PageHeader
        title="Cost analysis"
        description="What LLM calls cost, by day, model, member and provider."
        meta={<span data-testid="admin-cost-analysis-period">Period: {period}</span>}
        data-testid="admin-cost-analysis-header"
      />
      <DateRangeFilter zone={zone} data-testid="cost-dates" />
      <StatGrid data-testid="cost-stats">
        <StatTile label="Total cost" value={f.money(cost.totals.cost)} data-testid="cost-total" />
        <StatTile label="Requests" value={f.number(cost.totals.requests)} data-testid="cost-requests" />
        <StatTile label="Cost per 1M tokens" value={f.money(cost.costPerMillionTokens)} data-testid="cost-per-million" />
        <StatTile
          label="Projected 30 days"
          value={f.money(cost.projected30Days)}
          meta="At this period's daily average"
          data-testid="cost-projection"
        />
      </StatGrid>
      <ChartCard
        title="Daily cost"
        description={period}
        summary={`LLM cost per day, ${period}`}
        spec={{
          kind: "bar",
          x: { type: "day", keys: cost.window.keys },
          series: [{ id: "cost", label: "Cost", values: cost.daily.map((day) => day.cost) }],
          format: "money",
        }}
        empty={{ title: "No LLM calls in this period", description: "Pick a longer range to see spending." }}
        data-testid="cost-daily-chart"
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Cost by model"
          summary={`LLM cost by model, ${period}`}
          spec={rankedSpec(
            cost.byModel.map((row) => ({ label: row.model, value: row.cost })),
            { series: "Cost", format: "money" },
          )}
          heightClassName="h-80"
          data-testid="cost-model-chart"
        />
        <ChartCard
          title="Cost by member"
          summary={`LLM cost by member, ${period}`}
          spec={rankedSpec(
            cost.byUser.map((row) => ({ label: row.name, value: row.cost })),
            { series: "Cost", format: "money" },
          )}
          heightClassName="h-80"
          data-testid="cost-user-chart"
        />
      </div>
      <ChartCard
        title="Cost by provider"
        summary={`LLM cost by provider, ${period}`}
        spec={rankedSpec(
          cost.byProvider.map((row) => ({ label: row.provider, value: row.cost })),
          { series: "Cost", format: "money" },
        )}
        heightClassName="h-40"
        data-testid="cost-provider-chart"
      />
    </div>
  )
}
