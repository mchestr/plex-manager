import { getSession } from "@/lib/data/session"
import { getAllUsersWithWrapped } from "@/lib/data/admin-users"
import { ImportPlexUsersButton } from "@/components/admin/users/import-plex-users-button"
import { PlexDownAlert } from "@/components/admin/users/plex-down-alert"
import { UsersStatGrid } from "@/components/admin/users/users-stat-grid"
import { UsersTable } from "@/components/admin/users/users-table"
import { PageHeader } from "@/components/ui/page-header"
import { regenerateEstimateCopy } from "@/lib/admin/user-detail-tabs"
import { filterUsers, parseUsersFilter, sortUsers, USERS_DEFAULT_SORT, USERS_SORTS, usersStats } from "@/lib/admin/users-filter"
import { prisma } from "@/lib/prisma"
import { getFormat } from "@/lib/settings/app-settings"
import { getStripeDashboardBaseUrl } from "@/lib/stripe/client"
import { parseTableParams } from "@/lib/ui/table-params"
import { getSeasonYear } from "@/lib/wrapped/season"
import { connection } from "next/server"

type Params = Record<string, string | string[] | undefined>

/**
 * The admin users list, the reference list page (P10.18, ui-design-system
 * 6.3): every member is read once, then filtered, sorted and paged here from
 * the URL, so filters default to All and Plex being down never hides anyone.
 */
export default async function UsersPage({ searchParams }: { searchParams: Promise<Params> }) {
  // The season year reads the clock: render per request, never at build
  await connection()
  // One clock for the filters, the stats and the table, so relative times match on server and client
  const now = new Date().getTime()
  const [params, seasonYear, f, session] = await Promise.all([searchParams, getSeasonYear(), getFormat(), getSession()])
  const [{ users, plexCheck }, stripeDashboardBaseUrl, config, estimateCopy] = await Promise.all([
    getAllUsersWithWrapped(seasonYear),
    getStripeDashboardBaseUrl(),
    prisma.config.findUnique({ where: { id: "config" }, select: { stripeEnabled: true } }),
    regenerateEstimateCopy(seasonYear, f),
  ])
  const stripeEnabled = Boolean(config?.stripeEnabled)

  const filter = parseUsersFilter(params)
  const table = parseTableParams(params, { sortable: USERS_SORTS, defaultSort: USERS_DEFAULT_SORT })
  const matching = sortUsers(filterUsers(users, filter, now), table.sort)
  const page = Math.min(table.page, Math.max(1, Math.ceil(matching.length / table.pageSize)))
  const rows = matching.slice((page - 1) * table.pageSize, page * table.pageSize)

  const stats = usersStats(users, plexCheck, now)
  const checkedAgo = f.relative(plexCheck.checkedAt, now)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-users-page">
      <PageHeader
        title="Users"
        actions={session?.user.isAdmin ? <ImportPlexUsersButton /> : undefined}
        data-testid="admin-users-header"
      />
      <UsersStatGrid stats={stats} year={seasonYear} stripeEnabled={stripeEnabled} f={f} />
      {stats.plexDown && <PlexDownAlert notVerified={stats.notVerified} checkedAgo={checkedAgo} />}
      <UsersTable
        rows={rows}
        total={matching.length}
        memberCount={users.length}
        page={page}
        pageSize={table.pageSize}
        sort={table.sort}
        year={seasonYear}
        now={now}
        stripeEnabled={stripeEnabled}
        stripeDashboardBaseUrl={stripeDashboardBaseUrl}
        estimateCopy={estimateCopy}
        readOnly={!session?.user.isAdmin}
        unknownSub={stats.plexDown ? `Last checked ${checkedAgo}` : undefined}
      />
    </div>
  )
}
