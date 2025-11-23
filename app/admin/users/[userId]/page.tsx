import { getUserDetails } from "@/actions/users"
import { RegenerateWrappedButton } from "@/components/admin/users/regenerate-wrapped-button"
import { UnshareUserButton } from "@/components/admin/users/unshare-user-button"
import { UserStatusBadge } from "@/components/admin/users/user-status-badge"
import Link from "next/link"
import { notFound } from "next/navigation"

export const dynamic = 'force-dynamic'

export default async function UserDetailsPage({ params }: { params: { userId: string } }) {
  const user = await getUserDetails(params.userId)

  if (!user) {
    notFound()
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const currentYear = new Date().getFullYear()
  const currentYearWrapped = user.wrapped.find((w) => w.year === currentYear)

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <Link
              href="/admin/users"
              className="text-sm text-cyan-400 hover:text-cyan-300 mb-4 inline-block"
            >
              ← Back to Users
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">User Details</h1>
            <p className="text-sm text-slate-400">
              View detailed information about this user
            </p>
          </div>

          {/* User Info Card */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-6">
              {user.image ? (
                <div className="relative w-20 h-20 rounded-full overflow-hidden bg-slate-700 flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={user.image}
                    alt={user.name || "User"}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                  <span className="text-slate-400 text-2xl font-medium">
                    {(user.name || user.email || "U")[0].toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-xl font-bold text-white">
                    {user.name || "Unknown User"}
                  </h2>
                  {user.isAdmin && (
                    <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs font-medium rounded">
                      Admin
                    </span>
                  )}
                </div>
                {user.email && (
                  <p className="text-slate-400 mb-2">{user.email}</p>
                )}
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">Plex ID: </span>
                    <span className="text-slate-300 font-mono">
                      {user.plexUserId || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Plex Access: </span>
                    {user.hasPlexAccess === true ? (
                      <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 font-medium rounded text-xs">
                        Yes
                      </span>
                    ) : user.hasPlexAccess === false ? (
                      <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 font-medium rounded text-xs">
                        No
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </div>
                  {/* Show unshare button only for non-admin users with Plex access */}
                  {!user.isAdmin && user.hasPlexAccess === true && (
                    <div>
                      <UnshareUserButton userId={user.id} userName={user.name} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Total Wrapped</div>
              <div className="text-2xl font-bold text-white">{user.wrapped.length}</div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Shared Wraps</div>
              <div className="text-2xl font-bold text-cyan-400">{user.totalShares}</div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Total Visits</div>
              <div className="text-2xl font-bold text-green-400">{user.totalVisits.toLocaleString()}</div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">LLM Cost</div>
              <div className="text-2xl font-bold text-green-400">
                ${user.llmUsage?.cost.toFixed(3) || "0.000"}
              </div>
              {user.llmUsage && (
                <div className="text-xs text-slate-500 mt-1">
                  {user.llmUsage.totalTokens.toLocaleString()} tokens
                </div>
              )}
            </div>
          </div>

          {/* Current Year Wrapped */}
          {currentYearWrapped && (
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  {currentYear} Wrapped
                </h3>
                <div className="flex items-center gap-3">
                  <UserStatusBadge status={currentYearWrapped.status} />
                  {currentYearWrapped.status === "completed" && (
                    <Link
                      href={`/admin/users/${user.id}/wrapped`}
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded transition-colors"
                    >
                      View
                    </Link>
                  )}
                  <RegenerateWrappedButton userId={user.id} />
                </div>
              </div>
              {currentYearWrapped.generatedAt && (
                <p className="text-sm text-slate-400">
                  Generated: {formatDate(currentYearWrapped.generatedAt)}
                </p>
              )}
            </div>
          )}

          {/* All Wrapped History */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">Wrapped History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/30 border-b border-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Year
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Generated
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Shared
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Visits
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {user.wrapped.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                        No wrapped found for this user.
                      </td>
                    </tr>
                  ) : (
                    user.wrapped.map((wrapped) => (
                      <tr key={wrapped.id} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-white">{wrapped.year}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <UserStatusBadge status={wrapped.status} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-slate-300">
                            {wrapped.generatedAt ? formatDate(wrapped.generatedAt) : "—"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {wrapped.shareToken ? (
                            <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 text-xs font-medium rounded">
                              Yes
                            </span>
                          ) : (
                            <span className="text-sm text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-slate-300">
                            {wrapped.shareVisits > 0 ? (
                              <span className="font-medium text-green-400">
                                {wrapped.shareVisits.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {wrapped.status === "completed" ? (
                            <Link
                              href={`/admin/users/${user.id}/wrapped?year=${wrapped.year}`}
                              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium rounded transition-colors"
                            >
                              View
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-500">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Account Info */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Account Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-slate-400 mb-1">Created</div>
                <div className="text-sm text-white">{formatDate(user.createdAt)}</div>
              </div>
              <div>
                <div className="text-sm text-slate-400 mb-1">Last Updated</div>
                <div className="text-sm text-white">{formatDate(user.updatedAt)}</div>
              </div>
            </div>
          </div>

          {/* LLM Usage Details */}
          {user.llmUsage && (
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">LLM Usage</h3>
                <Link
                  href={`/admin/llm-usage?userId=${user.id}`}
                  className="text-sm text-cyan-400 hover:text-cyan-300"
                >
                  View All →
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-slate-400 mb-1">Total Tokens</div>
                  <div className="text-lg font-bold text-cyan-400">
                    {user.llmUsage.totalTokens.toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {user.llmUsage.promptTokens.toLocaleString()} prompt + {user.llmUsage.completionTokens.toLocaleString()} completion
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-400 mb-1">Total Cost</div>
                  <div className="text-lg font-bold text-green-400">
                    ${user.llmUsage.cost.toFixed(3)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-400 mb-1">Provider</div>
                  <div className="text-sm text-white">
                    {user.llmUsage.provider || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-400 mb-1">Model</div>
                  <div className="text-sm text-white font-mono">
                    {user.llmUsage.model || "—"}
                  </div>
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  )
}

