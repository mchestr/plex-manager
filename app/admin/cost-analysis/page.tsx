import { getLLMUsageStats } from "@/actions/admin"
import { CostDateFilter } from "@/components/admin/cost-analysis/cost-date-filter"
import { CostModelChart } from "@/components/admin/cost-analysis/cost-model-chart"
import { CostProviderChart } from "@/components/admin/cost-analysis/cost-provider-chart"
import { CostTrendChart } from "@/components/admin/cost-analysis/cost-trend-chart"
import { CostUserChart } from "@/components/admin/cost-analysis/cost-user-chart"
import { Suspense } from "react"

export const dynamic = 'force-dynamic'

interface CostAnalysisPageProps {
  searchParams: Promise<{ startDate?: string; endDate?: string }>
}

export default async function CostAnalysisPage({ searchParams }: CostAnalysisPageProps) {
  // Parse date filters
  const params = await searchParams
  const startDate = params.startDate ? new Date(params.startDate) : undefined
  const endDate = params.endDate ? new Date(params.endDate) : undefined

  // Get stats for the selected period
  const stats = await getLLMUsageStats(startDate, endDate)

  // Calculate projections
  const projectionDays = 30
  let projectedCost30Days = 0
  let projectedCost12Months = 0

  if (stats.byDate.length > 0) {
    // Calculate average daily cost from recent data
    const recentDays = Math.min(30, stats.byDate.length)
    const recentCosts = stats.byDate.slice(0, recentDays).reduce((sum, day) => sum + day.cost, 0)
    const avgDailyCost = recentCosts / recentDays

    projectedCost30Days = avgDailyCost * projectionDays
    projectedCost12Months = avgDailyCost * 365
  }

  // Calculate cost per 1M tokens (consistent with pricing definition)
  const costPer1MTokens = stats.totalTokens > 0 ? (stats.totalCost / stats.totalTokens) * 1000000 : 0

  // Calculate most expensive day
  const mostExpensiveDay = stats.byDate.length > 0
    ? stats.byDate.reduce((max, day) => day.cost > max.cost ? day : max, stats.byDate[0])
    : null

  // Format date range display
  const formatDateRange = () => {
    if (!startDate && !endDate) {
      return "All Time"
    }
    const start = startDate?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) || "Beginning"
    const end = endDate?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) || "Now"
    return `${start} - ${end}`
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Cost Analysis</h1>
            <p className="text-sm text-slate-400">
              Comprehensive cost breakdowns and projections for LLM usage
            </p>
            <div className="mt-2 text-xs text-slate-500">
              Period: {formatDateRange()}
            </div>
          </div>

          {/* Date Filter */}
          <Suspense fallback={<div className="mb-6 h-20 bg-slate-800/50 rounded-lg animate-pulse" />}>
            <CostDateFilter />
          </Suspense>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Total Cost</div>
              <div className="text-3xl font-bold text-green-400">${stats.totalCost.toFixed(2)}</div>
              <div className="text-xs text-slate-500 mt-1">
                ${stats.averageCostPerRequest.toFixed(4)} avg per request
              </div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Total Tokens</div>
              <div className="text-3xl font-bold text-cyan-400">{stats.totalTokens.toLocaleString()}</div>
              <div className="text-xs text-slate-500 mt-1">
                ${costPer1MTokens.toFixed(2)} per 1M tokens
              </div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">30-Day Projection</div>
              <div className="text-3xl font-bold text-purple-400">${projectedCost30Days.toFixed(2)}</div>
              <div className="text-xs text-slate-500 mt-1">
                Based on recent trends
              </div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">12-Month Projection</div>
              <div className="text-3xl font-bold text-yellow-400">${projectedCost12Months.toFixed(2)}</div>
              <div className="text-xs text-slate-500 mt-1">
                Annual estimate
              </div>
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Total Requests</div>
              <div className="text-2xl font-bold text-white">{stats.totalRequests.toLocaleString()}</div>
              <div className="text-xs text-slate-500 mt-1">
                {stats.averageTokensPerRequest.toLocaleString()} avg tokens/request
              </div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Unique Providers</div>
              <div className="text-2xl font-bold text-white">{stats.byProvider.length}</div>
              <div className="text-xs text-slate-500 mt-1">
                {stats.byProvider.map(p => p.provider).join(", ")}
              </div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Most Expensive Day</div>
              <div className="text-2xl font-bold text-white">
                {mostExpensiveDay ? `$${mostExpensiveDay.cost.toFixed(2)}` : "N/A"}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {mostExpensiveDay
                  ? new Date(mostExpensiveDay.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "No data"}
              </div>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Cost Trend Over Time */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Cost Trend Over Time</h2>
              <div className="h-64">
                <CostTrendChart data={stats.byDate} />
              </div>
            </div>

            {/* Cost by Provider */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Cost by Provider</h2>
              <div className="h-64">
                <CostProviderChart data={stats.byProvider} />
              </div>
            </div>
          </div>

          {/* Model and User Breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Cost by Model */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Cost by Model</h2>
              <div className="h-80">
                <CostModelChart data={stats.byModel} />
              </div>
            </div>

            {/* Cost by User */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Cost by User</h2>
              <div className="h-80">
                <CostUserChart data={stats.byUser} />
              </div>
            </div>
          </div>

          {/* Detailed Breakdown Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Provider Breakdown Table */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white">Provider Breakdown</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700/30 border-b border-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Provider</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Cost</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Requests</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Tokens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {stats.byProvider.map((provider) => (
                      <tr key={provider.provider} className="hover:bg-slate-700/20">
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-slate-700/50 text-slate-300 text-xs font-medium rounded">
                            {provider.provider}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-green-400">
                          ${provider.cost.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-300">
                          {provider.requests.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-300">
                          {provider.tokens.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Models Table */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white">Top Models</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700/30 border-b border-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Model</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Cost</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Requests</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Avg Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {stats.byModel.slice(0, 10).map((model) => (
                      <tr key={model.model} className="hover:bg-slate-700/20">
                        <td className="px-4 py-3">
                          <div className="text-sm text-slate-300 font-mono truncate max-w-[200px]">
                            {model.model}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-green-400">
                          ${model.cost.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-300">
                          {model.requests.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-400">
                          ${(model.cost / model.requests).toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
      </div>
    </div>
  )
}

