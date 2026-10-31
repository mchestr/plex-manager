import { notFound } from "next/navigation"
import type { ReactNode } from "react"

import { ActiveMembersTable, CommandTypesTable } from "@/components/admin/discord/discord-breakdown-tables"
import { DiscordMarkedMedia } from "@/components/admin/discord/discord-marked-media"
import { DiscordStatGrid } from "@/components/admin/discord/discord-stat-grid"
import { DiscordStatusRows } from "@/components/admin/discord/discord-status-rows"
import { DiscordTopList } from "@/components/admin/discord/discord-top-list"
import { type RecentCommand, RecentCommandsTable } from "@/components/admin/discord/recent-commands-table"
import {
  commandUsageSpec,
  contextClearsSpec,
  dailyCommandsSpec,
  errorsByTypeSpec,
  errorTrendSpec,
  helpTopicsSpec,
  linkRequestsSpec,
  markingCommandsSpec,
  selectionSpec,
  topMarkedSpec,
} from "@/components/admin/discord/specs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartCard } from "@/components/ui/chart-card"
import { DateRangeFilter } from "@/components/ui/date-range-filter"
import { EmptyState } from "@/components/ui/empty-state"
import { LiveRefreshProvider, LiveRefreshStatus } from "@/components/ui/live-status"
import { PageHeader } from "@/components/ui/page-header"
import { getAdminGate } from "@/lib/admin"
import { getDiscordOverview } from "@/lib/admin/discord"
import { getDiscordDashboardData } from "@/lib/data/discord-activity"
import { getFormat } from "@/lib/settings/app-settings"
import { parseDateRange, presetRange } from "@/lib/ui/date-range"
import { icons } from "@/lib/ui/icons"
import { discordStatus } from "@/lib/ui/status"
import { serverZone } from "@/lib/utils/server-zone"
import { dayKey } from "@/lib/utils/zoned-time"

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
      <CardContent>{children}</CardContent>
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

  const [overview, dashboard] = await Promise.all([
    getDiscordOverview(new Date(renderedAt)),
    getDiscordDashboardData({
      ...period,
      markType,
      source,
      search: marksSearch,
      marksLimit: MARKED_MEDIA_PAGE_SIZE,
      marksOffset,
    }),
  ])

  const { detailed, markedMedia, summary } = dashboard
  const recent: RecentCommand[] = dashboard.recent.logs.map((log) => ({
    id: log.id,
    discordUsername: log.discordUsername,
    discordUserId: log.discordUserId,
    userId: log.userId,
    commandName: log.commandName,
    argsLength: log.argsLength,
    status: log.status,
    responseTimeMs: log.responseTimeMs,
    createdAt: log.createdAt,
  }))
  const quiet = summary !== null && summary.totalCommands === 0
  const keys = dashboard.window.keys
  const periodText = `${f.dayKey(range.from)} to ${f.dayKey(range.to)}`
  const help = detailed.helpStats ?? null
  const linking = detailed.linkingMetrics ?? null
  const context = detailed.contextMetrics ?? null
  const selection = detailed.selectionStats ?? null
  const marking = detailed.mediaMarkingBreakdown ?? null
  const errors = detailed.errorAnalysis ?? null
  const markTotal = (marking?.byCommand ?? []).reduce((sum, row) => sum + row.count, 0)

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
              description="Select a longer period, or make sure that the support bot is online."
              data-testid="discord-empty-period"
            />
          </Card>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard
                title="Commands per day"
                summary={`Successful and failed commands per day, ${periodText}`}
                spec={dailyCommandsSpec(keys, dashboard.dailyActivity ?? [])}
                data-testid="discord-daily-chart"
              />
              <ChartCard
                title="Command usage"
                summary={`Commands run most often, ${periodText}`}
                spec={commandUsageSpec(dashboard.commandStats ?? [])}
                data-testid="discord-command-chart"
              />
              <Panel title="Commands by type">
                <CommandTypesTable rows={summary?.commandsByType ?? []} total={summary?.totalCommands ?? 0} />
              </Panel>
              <Panel title="Most active members">
                <ActiveMembersTable rows={dashboard.activeUsers ?? []} />
              </Panel>
              <ChartCard
                title="Help usage"
                description={
                  help
                    ? `${f.number(help.totalHelpRequests)} requests: ${f.number(help.generalHelpCount)} general, ${f.number(help.specificHelpCount)} on a topic`
                    : undefined
                }
                summary={`Help requests by topic, ${periodText}`}
                spec={helpTopicsSpec(help)}
                empty={{ title: "No help requests", description: "Select a longer period." }}
                data-testid="discord-help-chart"
              />
              <ChartCard
                title="Account linking"
                description={
                  linking
                    ? `${f.number(linking.totalLinkRequests)} link requests from ${f.number(linking.uniqueUnlinkedUsers)} unlinked members`
                    : undefined
                }
                summary={`Account link requests per day, ${periodText}`}
                spec={linkRequestsSpec(keys, linking)}
                empty={{ title: "No link requests", description: "Select a longer period." }}
                data-testid="discord-linking-chart"
              />
              <ChartCard
                title="Context management"
                description={context ? `${f.number(context.totalClears)} context clears` : undefined}
                summary={`Context clears by command, ${periodText}`}
                spec={contextClearsSpec(context)}
                empty={{ title: "No context clears", description: "Select a longer period." }}
                data-testid="discord-context-chart"
              />
              <ChartCard
                title="Selection menu"
                description={
                  selection && selection.totalSelections > 0
                    ? `${f.number(selection.totalSelections)} selections, ${f.percent(selection.successRate / 100)} successful`
                    : undefined
                }
                summary={`Selection menu choices by option, ${periodText}`}
                spec={selectionSpec(selection)}
                empty={{ title: "No selections", description: "Select a longer period." }}
                data-testid="discord-selection-chart"
              />
              <DiscordTopList
                title="Repeat link requesters"
                items={(linking?.repeatRequestUsers ?? []).slice(0, 5).map((user) => ({
                  id: user.discordUserId,
                  label: user.discordUsername ?? user.discordUserId,
                  value: `${f.number(user.requestCount)} requests`,
                }))}
                rowTestIdPrefix="repeat-user"
                data-testid="discord-repeat-requesters"
              />
              <DiscordTopList
                title="Frequent context clears"
                items={(context?.topClearUsers ?? []).slice(0, 5).map((user) => ({
                  id: user.discordUserId,
                  label: user.discordUsername ?? user.discordUserId,
                  value: `${f.number(user.clearCount)} clears`,
                }))}
                rowTestIdPrefix="clear-user"
                data-testid="discord-frequent-clearers"
              />
              <ChartCard
                title="Marks by command"
                description={marking ? `${f.number(markTotal)} marks` : undefined}
                summary={`Media marks by command, ${periodText}`}
                spec={markingCommandsSpec(marking)}
                empty={{ title: "No marks", description: "Select a longer period." }}
                data-testid="discord-marking-chart"
              />
              <ChartCard
                title="Most marked media"
                summary={`Titles marked most often, ${periodText}`}
                spec={topMarkedSpec(marking)}
                empty={{ title: "No marks", description: "Select a longer period." }}
                data-testid="discord-top-marked-chart"
              />
              <ChartCard
                title="Errors per day"
                description={errors ? `${f.number(errors.totalErrors)} errors` : undefined}
                summary={`Failed commands per day, ${periodText}`}
                spec={errorTrendSpec(keys, errors)}
                empty={{ title: "No errors", description: "Every command in this period succeeded." }}
                data-testid="discord-error-trend-chart"
              />
              <ChartCard
                title="Errors by type"
                summary={`Failed commands by command type, ${periodText}`}
                spec={errorsByTypeSpec(errors)}
                empty={{ title: "No errors", description: "Every command in this period succeeded." }}
                data-testid="discord-error-type-chart"
              />
              <DiscordTopList
                title="Most failing commands"
                items={(errors?.errorsByCommand ?? []).slice(0, 5).map((cmd) => ({
                  id: cmd.commandName,
                  label: cmd.commandName,
                  value: `${f.number(cmd.count)} errors`,
                  sub: cmd.sampleErrors[0],
                }))}
                rowTestIdPrefix="error-command"
                data-testid="discord-failing-commands"
              />
            </div>
          </>
        )}

        <section id="marked-media" aria-labelledby="discord-marked-heading" className="flex scroll-mt-6 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="discord-marked-heading" className="text-h3">
              Marked media
            </h2>
          </div>
          <Card>
            <CardContent>
              <DiscordMarkedMedia
                marks={markedMedia?.marks ?? []}
                total={markedMedia?.total ?? 0}
                summary={markedMedia?.summary ?? []}
                filters={{ markType: markType ?? "all", source: source ?? "all", search: marksSearch }}
                offset={marksOffset}
                limit={MARKED_MEDIA_PAGE_SIZE}
              />
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="discord-recent-heading" className="flex flex-col gap-3">
          <h2 id="discord-recent-heading" className="text-h3">
            Recent commands
          </h2>
          <RecentCommandsTable rows={recent} total={dashboard.recent.total} />
        </section>
      </div>
    </LiveRefreshProvider>
  )
}
