import {
  getShareAnalyticsStats,
  getShareTimeSeriesData,
  getTopSharedWraps,
} from "@/actions/share-analytics"
import { ShareTimeChart } from "@/components/admin/shares/share-time-chart"
import Link from "next/link"

export const dynamic = 'force-dynamic'

export default async function SharesDashboardPage() {
  const [stats, timeSeriesData, topWraps] = await Promise.all([
    getShareAnalyticsStats(),
    getShareTimeSeriesData(30),
    getTopSharedWraps(20),
  ])

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              Share Analytics
            </h1>
            <p className="text-sm text-slate-400">
              Track shares and visits over time
            </p>
          </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Total Shares</div>
            <div className="text-2xl font-bold text-cyan-400">
              {stats.totalShares.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Wraps with share tokens
            </div>
          </div>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Total Visits</div>
            <div className="text-2xl font-bold text-green-400">
              {stats.totalVisits.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              All-time share visits
            </div>
          </div>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Unique Wraps</div>
            <div className="text-2xl font-bold text-white">
              {stats.uniqueWrapsShared.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Different wraps shared
            </div>
          </div>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Avg Visits/Share</div>
            <div className="text-2xl font-bold text-purple-400">
              {stats.averageVisitsPerShare.toFixed(1)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Average per shared wrap
            </div>
          </div>
        </div>

        {/* Time Series Chart */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4 sm:p-6 mb-6">
          <div className="mb-4">
            <h2 className="text-lg sm:text-xl font-bold text-white mb-1">
              Shares & Visits Over Time
            </h2>
            <p className="text-sm text-slate-400">
              Last 30 days of share and visit activity
            </p>
          </div>
          <div className="overflow-x-auto">
            <ShareTimeChart data={timeSeriesData} height={250} />
          </div>
        </div>

        {/* Top Shared Wraps */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-700">
            <h2 className="text-lg sm:text-xl font-bold text-white mb-1">
              Top Shared Wraps
            </h2>
            <p className="text-sm text-slate-400">
              Most visited shared wraps by visit count
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700/30 border-b border-slate-700">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Year
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Visits
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden sm:table-cell">
                    First Shared
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden md:table-cell">
                    Last Visit
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {topWraps.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-8 text-center text-slate-400"
                    >
                      No shared wraps found
                    </td>
                  </tr>
                ) : (
                  topWraps.map((wrap) => (
                    <tr
                      key={wrap.wrappedId}
                      className="hover:bg-slate-700/20 transition-colors"
                    >
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white">
                          {wrap.userName || wrap.userEmail || "Unknown"}
                        </div>
                        {wrap.userEmail && wrap.userName && (
                          <div className="text-xs text-slate-400 hidden sm:block">
                            {wrap.userEmail}
                          </div>
                        )}
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-300">
                          {wrap.year}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-green-400">
                          {wrap.visitCount.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                        <div className="text-sm text-slate-300">
                          {wrap.firstSharedAt
                            ? new Date(
                                wrap.firstSharedAt
                              ).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "—"}
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap hidden md:table-cell">
                        <div className="text-sm text-slate-300">
                          {wrap.lastVisitedAt
                            ? new Date(
                                wrap.lastVisitedAt
                              ).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "—"}
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col sm:flex-row gap-1 sm:gap-2">
                          <Link
                            href={`/wrapped/share/${wrap.shareToken}`}
                            target="_blank"
                            className="px-2 sm:px-3 py-1 sm:py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium rounded transition-colors text-center"
                          >
                            View
                          </Link>
                          <Link
                            href={`/admin/users/${wrap.userId}/wrapped`}
                            className="px-2 sm:px-3 py-1 sm:py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded transition-colors text-center"
                          >
                            Admin
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

