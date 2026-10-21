import { notFound } from "next/navigation"
import type { ReactNode } from "react"

import {
  getDiscordActivityLogs,
  getDiscordDashboardData,
  getDiscordDetailedStats,
  getDiscordMarkedMedia,
} from "@/actions/discord-activity"
import { ActiveMembersTable, CommandTypesTable } from "@/components/admin/discord/discord-breakdown-tables"
import { DiscordCommandChart } from "@/components/admin/discord/discord-command-chart"
import { DiscordContextMetrics } from "@/components/admin/discord/discord-context-metrics"
import { DiscordErrorAnalysis } from "@/components/admin/discord/discord-error-analysis"
import { DiscordHelpStats } from "@/components/admin/discord/discord-help-stats"
import { DiscordLinkingMetrics } from "@/components/admin/discord/discord-linking-metrics"
import { DiscordMarkedMedia } from "@/components/admin/discord/discord-marked-media"
import { DiscordMediaMarkingBreakdown } from "@/components/admin/discord/discord-media-marking-breakdown"
import { DiscordSelectionStats } from "@/components/admin/discord/discord-selection-stats"
import { DiscordStatGrid } from "@/components/admin/discord/discord-stat-grid"
import { DiscordStatusRows } from "@/components/admin/discord/discord-status-rows"
import { DiscordTrendChart } from "@/components/admin/discord/discord-trend-chart"
import { type RecentCommand, RecentCommandsTable } from "@/components/admin/discord/recent-commands-table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DateRangeFilter } from "@/components/ui/date-range-filter"
import { EmptyState } from "@/components/ui/empty-state"
import { LiveRefreshProvider, LiveRefreshStatus } from "@/components/ui/live-status"
import { PageHeader } from "@/components/ui/page-header"
import { getAdminGate } from "@/lib/admin"
import { getDiscordOverview } from "@/lib/admin/discord"
import { getFormat } from "@/lib/settings/app-settings"
import { parseDateRange, presetRange } from "@/lib/ui/date-range"
import { icons } from "@/lib/ui/icons"
import { discordStatus } from "@/lib/ui/status"
import { serverZone } from "@/lib/utils/server-zone"
import { dayKey } from "@/lib/utils/zoned-time"

export const dynamic = "force-dynamic"

/** The status rows and the last hour move; past windows don't, so 30 s is enough (P10.5). */
const LIVE_INTERVAL_MS = 30_000
const MARKED_MEDIA_PAGE_SIZE = 25

type Params = Record<string, string | string[] | undefined>

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle as="h2">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  )
}

/** `/admin/discord` (P10.5): the bot's two status rows, the period's figures and the latest commands, kept live. */
export default async function DiscordDashboardPage({ searchParams }: { searchParams: Promise<Params> }) {
  const gate = await getAdminGate()
  if (!gate.ok) notFound()

  const params = await searchParams
  const renderedAt = new Date().getTime()
  const [f, zone] = await Promise.all([getFormat(), serverZone()])

  // Last 30 days including today in the server zone; old startDate/endDate bookmarks still work.
  const defaultRange = presetRange("30d", dayKey(renderedAt, zone))
  const range = parseDateRange(params) ?? parseDateRange(params, { from: "startDate", to: "endDate" }) ?? defaultRange
  const period = { startDate: range.from, endDate: range.to }

  const markType = single(params.markType)
  const source = single(params.source)
  const marksSearch = single(params.marksSearch) ?? ""
  const marksOffset = Math.max(0, parseInt(single(params.marksOffset) ?? "0", 10) || 0)

  const [overview, dashboardResult, logsResult, detailedResult, markedMediaResult] = await Promise.all([
    getDiscordOverview(new Date(renderedAt)),
    getDiscordDashboardData(period),
    getDiscordActivityLogs({ limit: 20 }),
    getDiscordDetailedStats(period),
    getDiscordMarkedMedia({
      ...period,
      markType: markType as never,
      source,
      search: marksSearch,
      limit: MARKED_MEDIA_PAGE_SIZE,
      offset: marksOffset,
    }),
  ])

  const dashboard = dashboardResult.success ? dashboardResult.data : null
  const detailed = detailedResult.success ? detailedResult.data : null
  const markedMedia = markedMediaResult.success ? markedMediaResult : null
  const summary = dashboard?.summary ?? null
  const recent: RecentCommand[] = (logsResult.success ? logsResult.logs : []).map((log) => ({
    id: log.id,
    discordUsername: log.discordUsername,
    discordUserId: log.discordUserId,
    userId: log.userId,
    commandName: log.commandName,
    status: log.status,
    responseTimeMs: log.responseTimeMs,
    createdAt: log.createdAt,
  }))
  const quiet = summary !== null && summary.totalCommands === 0

  return (
    <LiveRefreshProvider renderedAt={renderedAt} intervalMs={LIVE_INTERVAL_MS}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 md:px-6" data-testid="admin-discord-page">
        <PageHeader
          title="Discord bot"
          description={
            <span data-testid="discord-period">
              Period: {f.dayKey(range.from)} – {f.dayKey(range.to)}
            </span>
          }
          meta={<LiveRefreshStatus data-testid="discord-live" />}
          data-testid="admin-discord-header"
        />
        <DiscordStatusRows {...discordStatus(overview.state, new Date(renderedAt), f.settings)} />
        <DateRangeFilter zone={zone} defaultRange={defaultRange} data-testid="discord-date-range" />
        <DiscordStatGrid
          summary={summary}
          lastHourCommands={overview.lastHourCommands}
          linkedMembers={overview.linkedMembers}
          f={f}
        />

        {quiet ? (
          <Card>
            <EmptyState
              kind="filtered"
              icon={icons.discordBot}
              title="No commands in this period"
              description="Pick a longer period, or check that the support bot is online."
              data-testid="discord-empty-period"
            />
          </Card>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Commands per day">
                <div className="h-64">
                  <DiscordTrendChart data={dashboard?.dailyActivity ?? []} />
                </div>
              </Panel>
              <Panel title="Command usage">
                <div className="h-64">
                  <DiscordCommandChart data={dashboard?.commandStats ?? []} />
                </div>
              </Panel>
              <Panel title="Commands by type">
                <CommandTypesTable rows={summary?.commandsByType ?? []} total={summary?.totalCommands ?? 0} />
              </Panel>
              <Panel title="Most active members">
                <ActiveMembersTable rows={dashboard?.activeUsers ?? []} />
              </Panel>
              <Panel title="Help usage">
                <DiscordHelpStats data={detailed?.helpStats ?? null} />
              </Panel>
              <Panel title="Account linking">
                <DiscordLinkingMetrics data={detailed?.linkingMetrics ?? null} />
              </Panel>
              <Panel title="Context management">
                <DiscordContextMetrics data={detailed?.contextMetrics ?? null} />
              </Panel>
              <Panel title="Selection menu">
                <DiscordSelectionStats data={detailed?.selectionStats ?? null} />
              </Panel>
            </div>
            <Panel title="Media marking breakdown">
              <DiscordMediaMarkingBreakdown data={detailed?.mediaMarkingBreakdown ?? null} />
            </Panel>
            <Panel title="Errors">
              <DiscordErrorAnalysis data={detailed?.errorAnalysis ?? null} />
            </Panel>
          </>
        )}

        <section id="marked-media" aria-labelledby="discord-marked-heading" className="flex scroll-mt-6 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="discord-marked-heading" className="text-h3">
              Marked media
            </h2>
            <p className="text-ui text-muted-foreground">What members marked in this period, from Discord or the web.</p>
          </div>
          <Card padding="md">
            <DiscordMarkedMedia
              marks={markedMedia?.marks ?? []}
              total={markedMedia?.total ?? 0}
              summary={markedMedia?.summary ?? []}
              filters={{ markType: markType ?? "all", source: source ?? "all", search: marksSearch }}
              offset={marksOffset}
              limit={MARKED_MEDIA_PAGE_SIZE}
            />
          </Card>
        </section>

        <section aria-labelledby="discord-recent-heading" className="flex flex-col gap-3">
          <h2 id="discord-recent-heading" className="text-h3">
            Recent commands
          </h2>
          <RecentCommandsTable rows={recent} total={logsResult.success ? logsResult.total : 0} />
        </section>
      </div>
    </LiveRefreshProvider>
  )
}
