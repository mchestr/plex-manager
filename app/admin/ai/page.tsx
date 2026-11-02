import { z } from "zod"

import { AiActivityTabs } from "@/components/admin/ai-activity/ai-activity-tabs"
import { FindingsTab } from "@/components/admin/ai-activity/findings/findings-tab"
import { UsageTable } from "@/components/admin/ai-activity/usage-table"
import { PageHeader } from "@/components/ui/page-header"
import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import { assertAdmin } from "@/lib/admin"
import { getUsageFilterOptions, listUsageGroups, LLM_PURPOSES } from "@/lib/admin/analytics/llm-usage"
import { FINDINGS_GROUPED } from "@/lib/admin/routes"
import { findingStats, groupFindings, listFindings, type FindingFilters } from "@/lib/data/conversation-findings"
import { reviewBadgesFor } from "@/lib/data/conversation-review"
import { FindingSeverity, FindingStatus, FindingType } from "@/lib/generated/prisma/client"
import { getFormat } from "@/lib/settings/app-settings"
import { parseDateRange, type DayRange } from "@/lib/ui/date-range"
import { parseTableParams } from "@/lib/ui/table-params"
import { formatPeriod } from "@/lib/utils/day-window"
import type { BoundFormat } from "@/lib/utils/format"

type Params = Record<string, string | string[] | undefined>

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

const filterSchema = z.object({
  userId: z.string().min(1).max(100).optional().catch(undefined),
  purpose: z.enum(LLM_PURPOSES).optional().catch(undefined),
  model: z.string().min(1).max(200).optional().catch(undefined),
  year: z.coerce.number().int().min(2000).max(2100).optional().catch(undefined),
})

const findingSchema = z.object({
  type: z.enum(FindingType).optional().catch(undefined),
  severity: z.enum(FindingSeverity).optional().catch(undefined),
  // Open unless the URL says otherwise; "all" is every status
  status: z.union([z.enum(FindingStatus), z.literal("all")]).catch("open").default("open"),
  // "" is a group link's "no tool"
  tool: z.string().max(100).optional().catch(undefined),
})

const tableOptions = { sortable: [], defaultSort: { id: "started", desc: true } } as const

/** The Calls tab: the usage stat tiles and table, with each assistant conversation's review badge. */
async function callsPanel(params: Params, range: DayRange | null, f: BoundFormat) {
  const table = parseTableParams(params, tableOptions)
  const filters = filterSchema.parse({ userId: single(params.userId), purpose: single(params.purpose), model: single(params.model), year: single(params.year) })
  const filtered = Boolean(filters.userId || filters.purpose || filters.model || filters.year || range)
  const zone = f.settings.timeZone
  const [usage, options] = await Promise.all([
    listUsageGroups({ ...filters, range }, zone, { page: table.page, pageSize: table.pageSize }),
    getUsageFilterOptions(),
  ])
  const ids = usage.rows.flatMap((row) => (row.conversationId ? [row.conversationId] : []))
  const badges = Object.fromEntries(await reviewBadgesFor(ids))

  return (
    <>
      <StatGrid data-testid="ai-activity-stats">
        <StatTile label="Calls" value={f.number(usage.totals.calls)} />
        <StatTile label="Rows" value={f.number(usage.total)} unit="conversations and calls" />
        <StatTile label="Tokens" value={f.number(usage.totals.tokens)} />
        <StatTile label="Cost" value={f.money(usage.totals.cost)} />
      </StatGrid>
      <UsageTable
        rows={usage.rows}
        badges={badges}
        total={usage.total}
        page={table.page}
        pageSize={table.pageSize}
        filtered={filtered}
        options={options}
        zone={zone}
      />
    </>
  )
}

/** The Findings tab: the stat tiles, and the list or the groups, on the filters in the URL. */
async function findingsPanel(params: Params, range: DayRange | null, zone: string) {
  const table = parseTableParams(params, tableOptions)
  const parsed = findingSchema.parse({ type: single(params.type), severity: single(params.severity), status: single(params.status), tool: single(params.tool) })
  const hideUnverified = single(params.unverified) !== "show"
  const filters: FindingFilters = {
    status: parsed.status === "all" ? undefined : parsed.status,
    type: parsed.type,
    severity: parsed.severity,
    tool: parsed.tool === "" ? null : parsed.tool,
    hideUnverified,
    range,
  }
  const grouped = single(params.group) === FINDINGS_GROUPED
  const filtered = Boolean(parsed.type || parsed.severity || parsed.tool !== undefined || parsed.status !== "open" || range)

  const [stats, view] = await Promise.all([
    findingStats(filters, zone),
    grouped
      ? groupFindings(filters, zone).then((groups) => ({ mode: "groups" as const, groups }))
      : listFindings(filters, zone, { page: table.page, pageSize: table.pageSize }).then((list) => ({
          mode: "list" as const,
          ...list,
          hideUnverified,
          page: table.page,
          pageSize: table.pageSize,
        })),
  ])

  return <FindingsTab stats={stats} view={view} severity={filters.severity} range={range} filtered={filtered} zone={zone} />
}

/**
 * AI activity (P10.2, spec §2): Calls, the LLM usage by conversation or call,
 * and Findings, the conversation judge's backlog. `?view=findings` picks the
 * tab and `?from=`/`?to=` is the range both share.
 */
export default async function AIActivityPage({ searchParams }: { searchParams: Promise<Params> }) {
  await assertAdmin()
  const params = await searchParams
  const view = single(params.view) === "findings" ? "findings" : "calls"
  const range = parseDateRange(params)
  const year = view === "calls" ? filterSchema.shape.year.parse(single(params.year)) : undefined

  const f = await getFormat()
  const scope = [range ? formatPeriod(range, f.settings) : "Any time", year !== undefined ? `Rewind ${year}` : null].filter(Boolean)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-ai-activity-page">
      <PageHeader
        title="AI activity"
        meta={<span data-testid="admin-ai-activity-scope">{scope.join(", ")}</span>}
        data-testid="admin-ai-activity-header"
      />
      <AiActivityTabs active={view}>
        {view === "findings" ? await findingsPanel(params, range, f.settings.timeZone) : await callsPanel(params, range, f)}
      </AiActivityTabs>
    </div>
  )
}
