import { getObservabilityData } from "@/actions/admin"
import { ActiveSessionsPanel } from "@/components/admin/observability/active-sessions-panel"
import { ActivityTrendChart } from "@/components/admin/observability/activity-trend-chart"
import { DownloadQueuesPanel } from "@/components/admin/observability/download-queues-panel"
import { RequestsPanel } from "@/components/admin/observability/requests-panel"
import { ServiceStatusGrid } from "@/components/admin/observability/service-status-grid"
import { StoragePanel } from "@/components/admin/observability/storage-panel"
import { TopUsersWidget } from "@/components/admin/observability/top-users-widget"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function ObservabilityPage() {
  const data = await getObservabilityData()

  const configuredServicesCount = Object.values(data.services).filter((s) => s.configured).length
  const totalServicesCount = Object.values(data.services).length

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">System Overview</h1>
          <p className="text-sm text-slate-400">
            At-a-glance visibility into system health, user activity, and resource usage
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Configured Services */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Configured Services</div>
            <div className="text-3xl font-bold text-cyan-400">
              {configuredServicesCount}/{totalServicesCount}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {configuredServicesCount === totalServicesCount
                ? "All services configured"
                : `${totalServicesCount - configuredServicesCount} not configured`}
            </div>
          </div>

          {/* Total Users */}
          <Link
            href="/admin/users"
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4 hover:border-cyan-500/50 transition-colors group"
          >
            <div className="text-sm text-slate-400 mb-1">Total Users</div>
            <div className="text-3xl font-bold text-white group-hover:text-cyan-400 transition-colors">
              {data.users.total}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {data.users.admins} admins, {data.users.regular} regular
            </div>
          </Link>

          {/* Wrapped Status */}
          <Link
            href="/admin/users"
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4 hover:border-cyan-500/50 transition-colors group"
            data-testid="stat-card-wrapped-status"
          >
            <div className="text-sm text-slate-400 mb-1">Wrapped Status</div>
            <div className="text-3xl font-bold text-green-400">
              {data.wrapped.completed}
              <span className="text-lg text-slate-500 font-normal"> completed</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {data.wrapped.generating > 0 && (
                <span className="text-yellow-400">{data.wrapped.generating} generating</span>
              )}
              {data.wrapped.generating > 0 && data.wrapped.pending > 0 && ", "}
              {data.wrapped.pending > 0 && `${data.wrapped.pending} pending`}
              {data.wrapped.generating === 0 && data.wrapped.pending === 0 && "All complete"}
            </div>
          </Link>

          {/* LLM Usage (24h) */}
          <Link
            href="/admin/llm-usage"
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4 hover:border-cyan-500/50 transition-colors group"
          >
            <div className="text-sm text-slate-400 mb-1">LLM Usage (24h)</div>
            <div className="text-3xl font-bold text-purple-400 group-hover:text-purple-300 transition-colors">
              {data.llm.requests24h}
              <span className="text-lg text-slate-500 font-normal"> requests</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              ${data.llm.cost24h.toFixed(4)} cost today
            </div>
          </Link>
        </div>

        {/* Service Status Grid */}
        <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 mb-6">
          <ServiceStatusGrid services={data.services} />
        </div>

        {/* Activity & Top Users Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Activity Trend Chart */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Activity Trend (7 Days)</h2>
              <Link
                href="/admin/llm-usage"
                className="text-sm text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                View details
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
            <div className="h-64">
              <ActivityTrendChart data={data.activityTrend} />
            </div>
          </div>

          {/* Top Users */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Top Users (30 Days)</h2>
              <p className="text-xs text-slate-500 mt-1">By LLM usage cost</p>
            </div>
            <TopUsersWidget users={data.topUsers} />
          </div>
        </div>

        {/* Real-Time Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Active Sessions */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Active Streams</h2>
                <p className="text-xs text-slate-500 mt-0.5">Live Plex sessions</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Auto-refresh
              </div>
            </div>
            <ActiveSessionsPanel />
          </div>

          {/* Download Queues */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Download Queue</h2>
                <p className="text-xs text-slate-500 mt-0.5">Sonarr & Radarr</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Auto-refresh
              </div>
            </div>
            <DownloadQueuesPanel />
          </div>
        </div>

        {/* Storage & Requests Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Storage & Libraries */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Storage & Libraries</h2>
                <p className="text-xs text-slate-500 mt-0.5">Disk usage and content</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                1m refresh
              </div>
            </div>
            <StoragePanel />
          </div>

          {/* Media Requests */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Media Requests</h2>
                <p className="text-xs text-slate-500 mt-0.5">Overseerr request status</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                1m refresh
              </div>
            </div>
            <RequestsPanel />
          </div>
        </div>

        {/* Secondary Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Total LLM Cost */}
          <Link
            href="/admin/cost-analysis"
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4 hover:border-cyan-500/50 transition-colors group"
          >
            <div className="text-sm text-slate-400 mb-1">Total LLM Cost</div>
            <div className="text-2xl font-bold text-green-400">
              ${data.llm.totalCost.toFixed(2)}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              View cost analysis
              <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>

          {/* Maintenance Queue */}
          <Link
            href="/admin/maintenance/candidates"
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4 hover:border-cyan-500/50 transition-colors group"
          >
            <div className="text-sm text-slate-400 mb-1">Maintenance Queue</div>
            <div className="text-2xl font-bold text-yellow-400">
              {data.maintenance.pendingCandidates}
              <span className="text-sm text-slate-500 font-normal"> pending review</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {data.maintenance.approvedCandidates} approved, {data.maintenance.totalDeletions} deleted
            </div>
          </Link>

          {/* Quick Settings Access */}
          <Link
            href="/admin/settings"
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4 hover:border-cyan-500/50 transition-colors group"
          >
            <div className="text-sm text-slate-400 mb-1">Settings</div>
            <div className="text-2xl font-bold text-white group-hover:text-cyan-400 transition-colors">
              Configure
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              Manage integrations
              <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        </div>

        {/* Quick Links Grid */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Access</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <QuickLinkCard
              href="/admin/users"
              title="User Management"
              description="View and manage all Plex users and their wrapped status"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              }
            />
            <QuickLinkCard
              href="/admin/llm-usage"
              title="LLM Usage"
              description="Track AI usage, tokens, and individual request details"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
            />
            <QuickLinkCard
              href="/admin/cost-analysis"
              title="Cost Analysis"
              description="Comprehensive cost breakdowns and projections"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <QuickLinkCard
              href="/admin/discord"
              title="Discord Bot"
              description="Monitor bot activity and command usage"
              icon={
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
              }
            />
            <QuickLinkCard
              href="/admin/maintenance"
              title="Library Maintenance"
              description="Manage deletion rules and review candidates"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              }
            />
            <QuickLinkCard
              href="/admin/settings"
              title="Settings"
              description="Configure integrations and system settings"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function QuickLinkCard({
  href,
  title,
  description,
  icon,
}: {
  href: string
  title: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4 hover:border-cyan-500/50 transition-all group"
      data-testid={`quick-link-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-start gap-3">
        <div className="text-slate-400 group-hover:text-cyan-400 transition-colors mt-0.5">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white group-hover:text-cyan-400 transition-colors">
            {title}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {description}
          </p>
        </div>
        <svg
          className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  )
}
