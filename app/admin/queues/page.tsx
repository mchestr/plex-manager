import { Suspense } from "react"
import { getQueueDashboardData, getQueueJobs } from "@/actions/admin/queue"
import { QueueStatus } from "@/components/admin/queues/queue-status"
import { QueueStats } from "@/components/admin/queues/queue-stats"
import { QueueControls } from "@/components/admin/queues/queue-controls"
import { QueueFilters } from "@/components/admin/queues/queue-filters"
import { JobTable } from "@/components/admin/queues/job-table"
import { SchedulerInfo } from "@/components/admin/queues/scheduler-info"

export const dynamic = "force-dynamic"

interface QueueDashboardPageProps {
  searchParams: Promise<{
    status?: string
    jobType?: string
    page?: string
  }>
}

export default async function QueueDashboardPage({
  searchParams,
}: QueueDashboardPageProps) {
  const params = await searchParams

  // Fetch dashboard data and jobs in parallel
  const [dashboardResult, jobsResult] = await Promise.all([
    getQueueDashboardData(),
    getQueueJobs({
      status: params.status as "waiting" | "active" | "completed" | "failed" | "delayed" | undefined,
      jobType: params.jobType,
      page: parseInt(params.page ?? "1", 10),
      limit: 50,
    }),
  ])

  const dashboard = dashboardResult.success ? dashboardResult.data : null
  const jobs = jobsResult.success ? jobsResult.data : null
  const error = !dashboardResult.success ? dashboardResult.error : null

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Job Queue Dashboard
          </h1>
          <p className="text-sm text-slate-400">
            Monitor and manage background job processing
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h3 className="text-red-400 font-medium">Queue Unavailable</h3>
                <p className="text-sm text-red-300 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Queue Status */}
        <Suspense
          fallback={
            <div className="mb-6 h-20 bg-slate-800/50 rounded-lg animate-pulse" />
          }
        >
          <QueueStatus
            workerRunning={dashboard?.workerRunning ?? false}
            isPaused={dashboard?.isPaused ?? false}
            redisConnected={dashboard?.redisConnected ?? false}
          />
        </Suspense>

        {/* Statistics Cards */}
        <QueueStats stats={dashboard?.stats ?? null} />

        {/* Controls and Scheduler Info */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <QueueControls
            isPaused={dashboard?.isPaused ?? false}
            disabled={!dashboard?.redisConnected}
          />
          <SchedulerInfo schedulers={dashboard?.schedulers ?? []} />
        </div>

        {/* Filters */}
        <QueueFilters />

        {/* Job Table */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Jobs</h2>
            {jobs && (
              <span className="text-sm text-slate-400">
                Page {jobs.page}
                {jobs.hasMore && "+"}
              </span>
            )}
          </div>
          <JobTable
            jobs={jobs?.jobs ?? []}
            page={jobs?.page ?? 1}
            hasMore={jobs?.hasMore ?? false}
            disabled={!dashboard?.redisConnected}
          />
        </div>
      </div>
    </div>
  )
}
