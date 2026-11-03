import { z } from "zod"

import { JobsTable } from "@/components/admin/queues/jobs-table"
import { QueueHeaderActions } from "@/components/admin/queues/queue-header-actions"
import { QueueStatGrid } from "@/components/admin/queues/queue-stat-grid"
import { QueueStatusRow } from "@/components/admin/queues/queue-status-row"
import { SchedulerInfo } from "@/components/admin/queues/scheduler-info"
import { Alert } from "@/components/ui/alert"
import { LiveRefreshProvider, LiveRefreshStatus } from "@/components/ui/live-status"
import { PageHeader } from "@/components/ui/page-header"
import { getQueueDashboard, listQueueJobs } from "@/lib/admin/queues"
import { LISTED_JOB_STATUSES } from "@/lib/queue/client"
import { MAIN_QUEUE_JOB_TYPES } from "@/lib/queue/types"
import { getFormat } from "@/lib/settings/app-settings"
import { parseTableParams } from "@/lib/ui/table-params"
import { assertAdmin } from "@/lib/admin"

/** Refresh cadence of the monitoring pages (ui-design-system 6.3). */
const LIVE_INTERVAL_MS = 10_000

const filterSchema = z.object({
  status: z.enum(LISTED_JOB_STATUSES).optional().catch(undefined),
  jobType: z.enum(MAIN_QUEUE_JOB_TYPES).optional().catch(undefined),
})

type Params = Record<string, string | string[] | undefined>

export default async function QueuesPage({ searchParams }: { searchParams: Promise<Params> }) {
  await assertAdmin()
  const params = await searchParams
  const renderedAt = new Date().getTime()
  const table = parseTableParams(params, { sortable: ["created"], defaultSort: { id: "created", desc: true } })
  const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
  const filters = filterSchema.parse({ status: single(params.status), jobType: single(params.jobType) })
  const filtered = Boolean(filters.status || filters.jobType)

  const [f, dashboard] = await Promise.all([getFormat(), getQueueDashboard()])
  const noJobs = { rows: [], total: 0 }
  const jobs = dashboard.redisConnected
    ? await listQueueJobs({ ...filters, page: table.page, pageSize: table.pageSize }).catch(() => noJobs)
    : noJobs
  const { stats } = dashboard
  const allJobs = stats ? LISTED_JOB_STATUSES.reduce((sum, status) => sum + stats[status], 0) : 0

  return (
    <LiveRefreshProvider renderedAt={renderedAt} intervalMs={LIVE_INTERVAL_MS}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 md:px-6" data-testid="admin-queues-page">
        <PageHeader
          title="Job queues"
          meta={<LiveRefreshStatus data-testid="queue-live" />}
          actions={<QueueHeaderActions paused={dashboard.paused === true} disabled={!dashboard.redisConnected} />}
          data-testid="admin-queues-header"
        />
        {!dashboard.redisConfigured && (
          <Alert tone="warning" title="Scheduled jobs and Rewind need Redis" data-testid="queue-redis-alert">
            Set REDIS_URL and restart the app.
          </Alert>
        )}
        {dashboard.redisConfigured && !dashboard.redisConnected && (
          <Alert tone="destructive" title="Redis isn't answering" data-testid="queue-redis-alert">
            Jobs can't start until Redis answers.
          </Alert>
        )}
        <QueueStatusRow
          redisConnected={dashboard.redisConnected}
          workerRunning={dashboard.workerRunning}
          paused={dashboard.paused}
        />
        <QueueStatGrid stats={dashboard.stats} f={f} />
        <section aria-labelledby="queue-jobs-heading" className="flex flex-col gap-3">
          <h2 id="queue-jobs-heading" className="text-h3">
            Jobs
          </h2>
          <JobsTable
            rows={jobs.rows}
            total={jobs.total}
            allJobs={allJobs}
            page={table.page}
            pageSize={table.pageSize}
            filtered={filtered}
          />
        </section>
        <SchedulerInfo schedulers={dashboard.schedulers} f={f} />
      </div>
    </LiveRefreshProvider>
  )
}
