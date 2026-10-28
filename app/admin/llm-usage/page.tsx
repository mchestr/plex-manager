import { z } from "zod"

import { UsageTable } from "@/components/admin/llm-usage/usage-table"
import { PageHeader } from "@/components/ui/page-header"
import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import { getUsageFilterOptions, listUsageGroups, LLM_PURPOSES } from "@/lib/admin/analytics/llm-usage"
import { getFormat } from "@/lib/settings/app-settings"
import { parseDateRange } from "@/lib/ui/date-range"
import { parseTableParams } from "@/lib/ui/table-params"
import { formatPeriod } from "@/lib/utils/day-window"
import { assertAdmin } from "@/lib/admin"

type Params = Record<string, string | string[] | undefined>

const filterSchema = z.object({
  userId: z.string().min(1).max(100).optional().catch(undefined),
  purpose: z.enum(LLM_PURPOSES).optional().catch(undefined),
  model: z.string().min(1).max(200).optional().catch(undefined),
  year: z.coerce.number().int().min(2000).max(2100).optional().catch(undefined),
})

export default async function LLMUsagePage({ searchParams }: { searchParams: Promise<Params> }) {
  await assertAdmin()
  const params = await searchParams
  const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
  const table = parseTableParams(params, { sortable: [], defaultSort: { id: "started", desc: true } })
  const filters = filterSchema.parse({
    userId: single(params.userId),
    purpose: single(params.purpose),
    model: single(params.model),
    year: single(params.year),
  })
  const range = parseDateRange(params)
  const filtered = Boolean(filters.userId || filters.purpose || filters.model || filters.year || range)

  const f = await getFormat()
  const zone = f.settings.timeZone
  const [usage, options] = await Promise.all([
    listUsageGroups({ ...filters, range }, zone, { page: table.page, pageSize: table.pageSize }),
    getUsageFilterOptions(),
  ])

  const scope = [
    range ? formatPeriod(range, f.settings) : "Any time",
    filters.year !== undefined ? `Rewind ${filters.year}` : null,
  ].filter(Boolean)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-llm-usage-page">
      <PageHeader
        title="LLM usage"
        meta={<span data-testid="admin-llm-usage-scope">{scope.join(" · ")}</span>}
        data-testid="admin-llm-usage-header"
      />
      <StatGrid data-testid="llm-usage-stats">
        <StatTile label="Calls" value={f.number(usage.totals.calls)} />
        <StatTile label="Rows" value={f.number(usage.total)} unit="conversations and calls" />
        <StatTile label="Tokens" value={f.number(usage.totals.tokens)} />
        <StatTile label="Cost" value={f.money(usage.totals.cost)} />
      </StatGrid>
      <UsageTable
        rows={usage.rows}
        total={usage.total}
        page={table.page}
        pageSize={table.pageSize}
        filtered={filtered}
        options={options}
        zone={zone}
      />
    </div>
  )
}
