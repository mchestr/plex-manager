import React from "react"
import { getLLMUsageRecords, getLLMUsageStats, getUserById } from "@/actions/admin"
import Link from "next/link"

export const dynamic = 'force-dynamic'

export default async function LLMUsagePage({
  searchParams,
}: {
  searchParams: { page?: string; userId?: string }
}) {
  const page = parseInt(searchParams.page || "1", 10)
  const userId = searchParams.userId

  const { records, pagination } = await getLLMUsageRecords(page, 50, userId)
  const stats = await getLLMUsageStats(undefined, undefined, userId)
  const filteredUser = userId ? await getUserById(userId) : null

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getProviderBadge = (provider: string) => {
    const colors = {
      openai: "bg-green-500/20 text-green-400",
      mock: "bg-slate-500/20 text-slate-400",
    }
    return (
      <span className={`px-2 py-1 ${colors[provider as keyof typeof colors] || "bg-slate-700/50 text-slate-300"} text-xs font-medium rounded`}>
        {provider}
      </span>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">LLM Requests</h1>
            <p className="text-sm text-slate-400">
              {filteredUser
                ? `Filtered by: ${filteredUser.name || filteredUser.email || "Unknown User"}`
                : "Investigate LLM requests, responses, and token usage"}
            </p>
            {filteredUser && (
              <Link
                href="/admin/llm-usage"
                className="text-xs text-cyan-400 hover:text-cyan-300 underline mt-1 inline-block"
              >
                Clear filter
              </Link>
            )}
          </div>

        {/* Filter Banner */}
        {filteredUser && (
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3 sm:gap-4">
                {filteredUser.image ? (
                  <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden bg-slate-700 flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={filteredUser.image}
                      alt={filteredUser.name || "User"}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-slate-400 text-base sm:text-lg font-medium">
                      {(filteredUser.name || filteredUser.email || "U")[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm text-slate-400">Viewing requests for</div>
                  <div className="text-base sm:text-lg font-semibold text-white truncate">
                    {filteredUser.name || filteredUser.email || "Unknown User"}
                  </div>
                </div>
              </div>
              <Link
                href="/admin/llm-usage"
                className="px-3 sm:px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs sm:text-sm font-medium rounded transition-colors self-start sm:self-auto"
              >
                Clear Filter
              </Link>
            </div>
          </div>
        )}

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">
              {filteredUser ? "User Requests" : "Total Requests"}
            </div>
            <div className="text-2xl font-bold text-white">{stats.totalRequests.toLocaleString()}</div>
            <div className="text-xs text-slate-500 mt-1">
              {stats.averageTokensPerRequest.toLocaleString()} avg tokens
            </div>
          </div>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">
              {filteredUser ? "User Tokens" : "Total Tokens"}
            </div>
            <div className="text-2xl font-bold text-cyan-400">{stats.totalTokens.toLocaleString()}</div>
            <div className="text-xs text-slate-500 mt-1">
              {stats.byProvider.length} provider{stats.byProvider.length !== 1 ? "s" : ""}
            </div>
          </div>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">
              {filteredUser ? "User Cost" : "Total Cost"}
            </div>
            <div className="text-2xl font-bold text-green-400">${stats.totalCost.toFixed(4)}</div>
            <div className="text-xs text-slate-500 mt-1">
              ${stats.averageCostPerRequest.toFixed(6)} avg per request
            </div>
          </div>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Unique Models</div>
            <div className="text-2xl font-bold text-purple-400">{stats.byModel.length}</div>
            <div className="text-xs text-slate-500 mt-1">
              {filteredUser
                ? "This user only"
                : `${stats.byUser.length} user${stats.byUser.length !== 1 ? "s" : ""}`}
            </div>
          </div>
        </div>

        {/* Usage Records Table */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700/30 border-b border-slate-700">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden md:table-cell">
                    User
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Provider
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                    Model
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Tokens
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Cost
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                    Wrapped
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                      No LLM requests found.
                    </td>
                  </tr>
                ) : (
                  records.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                        <div className="text-xs sm:text-sm text-slate-300">
                          <div className="md:hidden">
                            {new Date(record.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                          <div className="hidden md:block">{formatDate(record.createdAt)}</div>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          {record.user.image ? (
                            <div className="relative w-8 h-8 rounded-full overflow-hidden bg-slate-700">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={record.user.image}
                                alt={record.user.name || "User"}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                              <span className="text-slate-400 text-xs font-medium">
                                {(record.user.name || record.user.email || "U")[0].toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-medium text-white">
                              {record.user.name || "Unknown"}
                            </div>
                            {record.user.email && (
                              <div className="text-xs text-slate-400">{record.user.email}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">{getProviderBadge(record.provider)}</td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                        <div className="text-sm text-slate-300 font-mono truncate max-w-[120px]">
                          {record.model || <span className="text-slate-500">—</span>}
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                        <div className="text-sm">
                          <div className="text-white font-medium">{record.totalTokens.toLocaleString()}</div>
                          <div className="text-xs text-slate-400 hidden sm:block">
                            {record.promptTokens.toLocaleString()} + {record.completionTokens.toLocaleString()}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-green-400 font-medium">
                          ${record.cost.toFixed(4)}
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                        {record.wrapped ? (
                          <Link
                            href={`/admin/users/${record.userId}/wrapped`}
                            className="text-sm text-cyan-400 hover:text-cyan-300 underline"
                          >
                            {record.wrapped.year} ({record.wrapped.status})
                          </Link>
                        ) : (
                          <span className="text-sm text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                        <Link
                          href={`/admin/llm-usage/${record.id}`}
                          className="px-2 sm:px-3 py-1 sm:py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium rounded transition-colors inline-block"
                        >
                          <span className="hidden sm:inline">View Details</span>
                          <span className="sm:hidden">View</span>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="px-4 sm:px-6 py-4 border-t border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-xs sm:text-sm text-slate-400">
                Showing {(pagination.page - 1) * pagination.pageSize + 1} to{" "}
                {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{" "}
                {pagination.total} results
              </div>
              <div className="flex gap-2">
                {pagination.page > 1 && (
                  <Link
                    href={`/admin/llm-usage?page=${pagination.page - 1}${userId ? `&userId=${userId}` : ""}`}
                    className="px-3 sm:px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs sm:text-sm font-medium rounded transition-colors"
                  >
                    Previous
                  </Link>
                )}
                {pagination.page < pagination.totalPages && (
                  <Link
                    href={`/admin/llm-usage?page=${pagination.page + 1}${userId ? `&userId=${userId}` : ""}`}
                    className="px-3 sm:px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs sm:text-sm font-medium rounded transition-colors"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

