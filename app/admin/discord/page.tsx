import { getDiscordDashboardData, getDiscordActivityLogs } from "@/actions/discord-activity"
import { DiscordActivityTable } from "@/components/admin/discord/discord-activity-table"
import { DiscordBotStatus } from "@/components/admin/discord/discord-bot-status"
import { DiscordDateFilter } from "@/components/admin/discord/discord-date-filter"
import { DiscordCommandChart } from "@/components/admin/discord/discord-command-chart"
import { DiscordTrendChart } from "@/components/admin/discord/discord-trend-chart"
import { DiscordActiveUsers } from "@/components/admin/discord/discord-active-users"
import { Suspense } from "react"

export const dynamic = "force-dynamic"

interface DiscordDashboardPageProps {
  searchParams: Promise<{ startDate?: string; endDate?: string }>
}

export default async function DiscordDashboardPage({
  searchParams,
}: DiscordDashboardPageProps) {
  const params = await searchParams

  // Default to last 30 days
  const endDate = params.endDate || new Date().toISOString().split("T")[0]
  const defaultStartDate = new Date()
  defaultStartDate.setDate(defaultStartDate.getDate() - 30)
  const startDate = params.startDate || defaultStartDate.toISOString().split("T")[0]

  // Fetch dashboard data
  const [dashboardResult, logsResult] = await Promise.all([
    getDiscordDashboardData({ startDate, endDate }),
    getDiscordActivityLogs({ limit: 20 }),
  ])

  const dashboard = dashboardResult.success ? dashboardResult.data : null
  const logs = logsResult.success ? logsResult.logs : []
  const logsTotal = logsResult.success ? logsResult.total : 0

  // Format date range display
  const formatDateRange = () => {
    const start = new Date(startDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    const end = new Date(endDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    return `${start} - ${end}`
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Discord Bot Dashboard
          </h1>
          <p className="text-sm text-slate-400">
            Monitor bot activity, command usage, and user interactions
          </p>
          <div className="mt-2 text-xs text-slate-500">
            Period: {formatDateRange()}
          </div>
        </div>

        {/* Bot Status */}
        <Suspense
          fallback={
            <div className="mb-6 h-20 bg-slate-800/50 rounded-lg animate-pulse" />
          }
        >
          <DiscordBotStatus status={dashboard?.botStatus ?? null} />
        </Suspense>

        {/* Date Filter */}
        <Suspense
          fallback={
            <div className="mb-6 h-20 bg-slate-800/50 rounded-lg animate-pulse" />
          }
        >
          <DiscordDateFilter />
        </Suspense>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Total Commands</div>
            <div className="text-3xl font-bold text-cyan-400">
              {dashboard?.summary?.totalCommands?.toLocaleString() ?? 0}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              In selected period
            </div>
          </div>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Success Rate</div>
            <div className="text-3xl font-bold text-green-400">
              {dashboard?.summary?.successRate?.toFixed(1) ?? 0}%
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Commands completed successfully
            </div>
          </div>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Avg Response Time</div>
            <div className="text-3xl font-bold text-purple-400">
              {dashboard?.summary?.avgResponseTimeMs?.toFixed(0) ?? 0}ms
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Average command processing time
            </div>
          </div>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Unique Users</div>
            <div className="text-3xl font-bold text-yellow-400">
              {dashboard?.summary?.uniqueUsers?.toLocaleString() ?? 0}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Users who used the bot
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Activity Trend */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              Activity Over Time
            </h2>
            <div className="h-64">
              <DiscordTrendChart data={dashboard?.dailyActivity ?? []} />
            </div>
          </div>

          {/* Command Usage */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              Command Usage
            </h2>
            <div className="h-64">
              <DiscordCommandChart data={dashboard?.commandStats ?? []} />
            </div>
          </div>
        </div>

        {/* Active Users and Command Type Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Active Users */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">
                Most Active Users
              </h2>
            </div>
            <DiscordActiveUsers users={dashboard?.activeUsers ?? []} />
          </div>

          {/* Command Type Breakdown */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">
                Commands by Type
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/30 border-b border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Type
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                      Count
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {dashboard?.summary?.commandsByType?.map((item) => (
                    <tr key={item.type} className="hover:bg-slate-700/20">
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-slate-700/50 text-slate-300 text-xs font-medium rounded">
                          {item.type.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-cyan-400">
                        {item.count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-300">
                        {dashboard?.summary?.totalCommands
                          ? (
                              (item.count / dashboard.summary.totalCommands) *
                              100
                            ).toFixed(1)
                          : 0}
                        %
                      </td>
                    </tr>
                  )) ?? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        No data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Recent Activity
            </h2>
            <span className="text-sm text-slate-400">
              {logsTotal.toLocaleString()} total commands
            </span>
          </div>
          <DiscordActivityTable logs={logs} />
        </div>
      </div>
    </div>
  )
}
