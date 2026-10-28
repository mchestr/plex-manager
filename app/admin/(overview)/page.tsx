import { QueuesTile } from "@/components/admin/overview/queues-tile"
import { RewindTile } from "@/components/admin/overview/rewind-tile"
import { ServicesTile } from "@/components/admin/overview/services-tile"
import { SpendTile } from "@/components/admin/overview/spend-tile"
import { LiveRefreshProvider, LiveRefreshStatus } from "@/components/ui/live-status"
import { PageHeader } from "@/components/ui/page-header"
import { StatGrid } from "@/components/ui/stat-tile"
import { getAdminOverview } from "@/lib/admin/overview"
import { getFormat } from "@/lib/settings/app-settings"
import { getSession } from "@/lib/data/session"
import { redirect } from "next/navigation"
import { connection } from "next/server"

/** Refresh cadence of the monitoring pages (ui-design-system 6.3). */
const LIVE_INTERVAL_MS = 10_000

/**
 * The admin Overview (P10.8, ui-design-system 6.2): service health, job
 * queues, Rewind progress and LLM spend, each tile linking to the page that
 * fixes it. Each source fails on its own, as a dash.
 */
export default async function AdminOverviewPage() {
  // The health, queue and spend tiles are admin-only; a role lands on its first page
  if (!(await getSession())?.user.isAdmin) redirect("/admin/users")
  // The tiles read the clock: render per request, never at build
  await connection()
  const renderedAt = new Date().getTime()
  const [overview, f] = await Promise.all([getAdminOverview(new Date(renderedAt)), getFormat()])

  return (
    <LiveRefreshProvider renderedAt={renderedAt} intervalMs={LIVE_INTERVAL_MS}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 md:px-6" data-testid="admin-overview-page">
        <PageHeader
          title="Overview"
          meta={<LiveRefreshStatus data-testid="admin-overview-live" />}
          data-testid="admin-overview-header"
        />
        <StatGrid data-testid="admin-overview-tiles">
          <ServicesTile services={overview.services} f={f} />
          <QueuesTile queues={overview.queues} f={f} />
          <RewindTile rewind={overview.rewind} f={f} />
          <SpendTile spend={overview.spend} f={f} />
        </StatGrid>
      </div>
    </LiveRefreshProvider>
  )
}
