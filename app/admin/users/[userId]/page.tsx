import { getUserDetails, getUserActivityTimeline } from "@/actions/users"
import { RegenerateWrappedButton } from "@/components/admin/users/regenerate-wrapped-button"
import { UnshareUserButton } from "@/components/admin/users/unshare-user-button"
import { UserStatusBadge } from "@/components/admin/users/user-status-badge"
import { ChangeUserRoleButton } from "@/components/admin/users/change-user-role-button"
import { DisableUserButton } from "@/components/admin/users/disable-user-button"
import { UserActivityTimeline } from "@/components/admin/users/user-activity-timeline"
import { Badge } from "@/components/ui/badge"
import { getFormat } from "@/lib/settings/app-settings"
import { readWrappedStatus } from "@/lib/wrapped/data/parse-stored"
import { getSeasonYear } from "@/lib/wrapped/season"
import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import { llmUsage, userRewind } from "@/lib/admin/routes"

export const dynamic = 'force-dynamic'

export default async function UserDetailsPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const [user, activityTimeline, seasonYear, f] = await Promise.all([
    getUserDetails(userId),
    getUserActivityTimeline(userId, { page: 1, pageSize: 10 }),
    getSeasonYear(),
    getFormat(),
  ])

  if (!user) {
    notFound()
  }

  const seasonWrapped = user.wrapped.find((w) => w.year === seasonYear)

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

          {/* User Info Card: opaque, so axe can measure the tinted Disable account button on it */}
          <div className="bg-card border border-border rounded-lg p-6 mb-6">
            <div className="flex items-start gap-6">
              {user.image ? (
                <div className="relative w-20 h-20 rounded-full overflow-hidden bg-slate-700 flex-shrink-0">
                  <Image
                    src={user.image}
                    alt={user.name || "User"}
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                    unoptimized
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
                  {user.disabledAt && (
                    <Badge tone="danger" data-testid="admin-user-disabled-badge">
                      Disabled
                    </Badge>
                  )}
                </div>
                {user.email && (
                  <p className="text-slate-400 mb-2">{user.email}</p>
                )}
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Plex ID: </span>
                    <span className="text-slate-300 font-mono">
                      {user.plexUserId || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Plex Access: </span>
                    {user.hasPlexAccess === true ? (
                      <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 font-medium rounded text-xs">
                        Yes
                      </span>
                    ) : user.hasPlexAccess === false ? (
                      <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 font-medium rounded text-xs">
                        No
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  {/* Show unshare button only for non-admin users with Plex access */}
                  {!user.isAdmin && user.hasPlexAccess === true && (
                    <div>
                      <UnshareUserButton userId={user.id} userName={user.name} />
                    </div>
                  )}
                </div>
                {/* Role Management */}
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-slate-400 mb-1">Role</div>
                      <div className="text-sm text-white">
                        {user.isAdmin ? (
                          <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs font-medium rounded">
                            Admin
                          </span>
                        ) : (
                          <span className="text-slate-300">Regular User</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <DisableUserButton
                        userId={user.id}
                        userName={user.name}
                        disabled={user.disabledAt !== null}
                      />
                      <ChangeUserRoleButton
                        userId={user.id}
                        userName={user.name}
                        currentIsAdmin={user.isAdmin}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Discord Connection */}
          {user.discordConnection && (
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">Discord Connection</h3>
                  <p className="text-sm text-slate-400">Linked Roles status from Discord</p>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    user.discordConnection.revokedAt
                      ? "bg-red-500/20 text-red-300 border border-red-500/30"
                      : "bg-green-500/20 text-green-300 border border-green-500/30"
                  }`}
                >
                  {user.discordConnection.revokedAt ? "Revoked" : "Active"}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-slate-400 mb-1">Display Name</div>
                  <div className="text-sm text-white">
                    {user.discordConnection.globalName || user.discordConnection.username}
                  </div>
                  <div className="text-xs text-slate-400">
                    Handle {user.discordConnection.username}
                    {user.discordConnection.discriminator ? `#${user.discordConnection.discriminator}` : ""}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-400 mb-1">Discord ID</div>
                  <div className="text-sm text-white font-mono break-all">
                    {user.discordConnection.discordUserId}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-400 mb-1">Linked</div>
                  <div className="text-sm text-white">
                    {f.dateTime(user.discordConnection.linkedAt, { zoneLabel: true })}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-400 mb-1">Last Metadata Sync</div>
                  <div className="text-sm text-white">
                    {user.discordConnection.metadataSyncedAt
                      ? f.dateTime(user.discordConnection.metadataSyncedAt, { zoneLabel: true })
                      : "Pending"}
                  </div>
                </div>
              </div>
              {user.discordConnection.lastError && (
                <div className="mt-4 text-sm text-yellow-300 border border-yellow-500/30 bg-yellow-500/5 rounded-lg px-3 py-2">
                  <span className="font-semibold text-yellow-200">Last sync warning:</span>{" "}
                  {user.discordConnection.lastError}
                </div>
              )}
            </div>
          )}

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
              <div className="text-2xl font-bold text-green-400">{f.number(user.totalVisits)}</div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">LLM Cost</div>
              <div className="text-2xl font-bold text-green-400">
                {f.money(user.llmUsage?.cost ?? 0)}
              </div>
              {user.llmUsage && (
                <div className="text-xs text-muted-foreground mt-1">
                  {f.tokens(user.llmUsage.totalTokens)}
                </div>
              )}
            </div>
          </div>

          {/* Season Year Wrapped */}
          {seasonWrapped && (
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  {seasonYear} Wrapped
                </h3>
                <div className="flex items-center gap-3">
                  <UserStatusBadge status={readWrappedStatus(seasonWrapped.status, seasonWrapped.id)} />
                  {readWrappedStatus(seasonWrapped.status, seasonWrapped.id) === "completed" && (
                    <Link
                      href={userRewind(user.id, seasonYear)}
                      data-testid="admin-user-season-wrapped-view"
                      className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-medium rounded transition-colors"
                    >
                      View
                    </Link>
                  )}
                  <RegenerateWrappedButton userId={user.id} plexUserId={user.plexUserId} year={seasonYear} />
                </div>
              </div>
              {seasonWrapped.generatedAt && (
                <p className="text-sm text-slate-400">
                  Generated:{" "}
                  <span data-testid="admin-user-season-generated-timestamp">
                    {f.dateTime(seasonWrapped.generatedAt, { zoneLabel: true })}
                  </span>
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
                          <UserStatusBadge status={readWrappedStatus(wrapped.status, wrapped.id)} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-slate-300" data-testid="admin-user-history-generated-timestamp">
                            {wrapped.generatedAt ? f.dateTime(wrapped.generatedAt, { zoneLabel: true }) : "—"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {wrapped.shareToken ? (
                            <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 text-xs font-medium rounded">
                              Yes
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-slate-300">
                            {wrapped.shareVisits > 0 ? (
                              <span className="font-medium text-green-400">
                                {f.number(wrapped.shareVisits)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {readWrappedStatus(wrapped.status, wrapped.id) === "completed" ? (
                            <Link
                              href={userRewind(user.id, wrapped.year)}
                              className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-medium rounded transition-colors"
                            >
                              View
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
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
                <div className="text-sm text-white" data-testid="admin-user-created-timestamp">{f.dateTime(user.createdAt, { zoneLabel: true })}</div>
              </div>
              <div>
                <div className="text-sm text-slate-400 mb-1">Last Updated</div>
                <div className="text-sm text-white" data-testid="admin-user-updated-timestamp">{f.dateTime(user.updatedAt, { zoneLabel: true })}</div>
              </div>
            </div>
          </div>

          {/* Activity Timeline */}
          {activityTimeline && activityTimeline.total > 0 && (
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden mt-6">
              <div className="px-6 py-4 border-b border-slate-700">
                <h3 className="text-lg font-semibold text-white">Activity Timeline</h3>
                <p className="text-sm text-slate-400">{activityTimeline.total} activities</p>
              </div>
              <UserActivityTimeline userId={user.id} initialData={activityTimeline} />
            </div>
          )}

          {/* LLM Usage Details */}
          {user.llmUsage && (
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">LLM Usage</h3>
                <Link
                  href={llmUsage({ userId: user.id })}
                  className="text-sm text-cyan-400 hover:text-cyan-300"
                >
                  View All →
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-slate-400 mb-1">Total Tokens</div>
                  <div className="text-lg font-bold text-cyan-400">
                    {f.number(user.llmUsage.totalTokens)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {f.number(user.llmUsage.promptTokens)} prompt + {f.number(user.llmUsage.completionTokens)} completion
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-400 mb-1">Total Cost</div>
                  <div className="text-lg font-bold text-green-400">
                    {f.money(user.llmUsage.cost)}
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

