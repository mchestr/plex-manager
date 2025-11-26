import { getLLMUsageRecords, getLLMUsageStats, getUserById } from "@/actions/admin"
import { aggregateLlmUsage } from "@/lib/utils"
import Image from "next/image"
import Link from "next/link"

export const dynamic = 'force-dynamic'

export default async function LLMUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; userId?: string; conversationId?: string }>
}) {
  const params = await searchParams
  const page = parseInt(params.page || "1", 10)
  const userId = params.userId
  const conversationId = params.conversationId

  const { records, pagination } = await getLLMUsageRecords(page, 50, userId, conversationId)
  const stats = await getLLMUsageStats(undefined, undefined, userId)
  const filteredUser = userId ? await getUserById(userId) : null

  const conversationGroups = (() => {
    const groups = new Map<
      string,
      {
        records: typeof records
      }
    >()

    for (const record of records) {
      const key = record.chatConversationId ?? `single:${record.id}`
      const existing = groups.get(key) || { records: [] as typeof records }
      existing.records.push(record)
      groups.set(key, existing)
    }

    return Array.from(groups.entries()).map(([key, group]) => {
      const usageSummary = aggregateLlmUsage(
        group.records.map((r) => ({
          totalTokens: r.totalTokens,
          promptTokens: r.promptTokens,
          completionTokens: r.completionTokens,
          cost: r.cost,
          provider: r.provider,
          model: r.model,
        }))
      )

      const first = group.records.reduce(
        (earliest, r) => (r.createdAt < earliest.createdAt ? r : earliest),
        group.records[0]
      )

      const sampleUsageId = first.id
      const isChat = !!first.chatConversationId
      const hasWrapped = !!first.wrapped

      let contextLabel = "Standalone"
      if (isChat) {
        const calls = group.records.length
        contextLabel = `Chat conversation (${calls} call${calls === 1 ? "" : "s"})`
      } else if (hasWrapped && first.wrapped) {
        contextLabel = `Wrapped ${first.wrapped.year} (${first.wrapped.status})`
      }

      return {
        id: key,
        user: first.user,
        createdAt: first.createdAt,
        totalTokens: usageSummary?.totalTokens ?? 0,
        promptTokens: usageSummary?.promptTokens ?? 0,
        completionTokens: usageSummary?.completionTokens ?? 0,
        cost: usageSummary?.cost ?? 0,
        provider: usageSummary?.provider ?? null,
        model: usageSummary?.model ?? null,
        isChat,
        conversationId: first.chatConversationId as string | undefined,
        contextLabel,
        sampleUsageId,
        hasWrapped,
      }
    })
  })()

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
                    <Image
                      src={filteredUser.image}
                      alt={filteredUser.name || "User"}
                      width={48}
                      height={48}
                      className="w-full h-full object-cover"
                      unoptimized
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

        {/* Usage Records Table (grouped by conversation / standalone) */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
                <thead className="bg-slate-700/30 border-b border-slate-700">
                  <tr>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Started
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden md:table-cell">
                      User
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
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Context
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {conversationGroups.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                      No LLM usage found.
                      </td>
                    </tr>
                  ) : (
                    conversationGroups
                      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                      .map((group) => (
                        <tr key={group.id} className="hover:bg-slate-700/20 transition-colors">
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                            <div className="text-xs sm:text-sm text-slate-300">
                              <div className="md:hidden">
                                {new Date(group.createdAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </div>
                              <div className="hidden md:block">
                                {new Date(group.createdAt).toLocaleString("en-US", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap hidden md:table-cell">
                            <div className="flex items-center gap-2">
                              {group.user.image ? (
                                <div className="relative w-8 h-8 rounded-full overflow-hidden bg-slate-700">
                                  <Image
                                    src={group.user.image}
                                    alt={group.user.name || "User"}
                                    width={32}
                                    height={32}
                                    className="w-full h-full object-cover"
                                    unoptimized
                                  />
                                </div>
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                                  <span className="text-slate-400 text-xs font-medium">
                                    {(group.user.name || group.user.email || "U")[0].toUpperCase()}
                                  </span>
                                </div>
                              )}
                              <div>
                                <div className="text-sm font-medium text-white">
                                  {group.user.name || "Unknown"}
                                </div>
                                {group.user.email && (
                                  <div className="text-xs text-slate-400">{group.user.email}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                            <div className="text-sm text-slate-300 font-mono truncate max-w-[140px]">
                              {group.model || <span className="text-slate-500">—</span>}
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                            <div className="text-sm">
                              <div className="text-white font-medium">
                                {group.totalTokens.toLocaleString()}
                              </div>
                              <div className="text-xs text-slate-400 hidden sm:block">
                                {group.promptTokens.toLocaleString()} +{" "}
                                {group.completionTokens.toLocaleString()}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-green-400 font-medium">
                              ${group.cost.toFixed(4)}
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                            <span className="text-xs font-medium text-slate-300">
                            {group.contextLabel}
                            </span>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                          <Link
                            href={
                              group.isChat && group.conversationId
                                ? `/admin/llm-usage/conversation/${group.conversationId}`
                                : `/admin/llm-usage/${group.sampleUsageId}`
                            }
                            className="px-2 sm:px-3 py-1 sm:py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium rounded transition-colors inline-block"
                          >
                            {group.isChat ? "View Calls" : "View Details"}
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

