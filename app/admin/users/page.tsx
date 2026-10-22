import { getAllUsersWithWrapped } from "@/actions/users"
import { ImportPlexUsersButton } from "@/components/admin/users/import-plex-users-button"
import { UsersList } from "@/components/admin/users/users-list"
import { UsersStatsSummary } from "@/components/admin/users/users-stats-summary"
import { getStripeDashboardBaseUrl } from "@/lib/stripe/client"
import { getSeasonYear } from "@/lib/wrapped/season"

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const currentYear = await getSeasonYear()
  const [allUsers, stripeDashboardBaseUrl] = await Promise.all([
    getAllUsersWithWrapped(currentYear),
    getStripeDashboardBaseUrl(),
  ])

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative">
            <div>
              <h1 data-testid="admin-users-heading" className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Users</h1>
              <p className="text-sm text-muted-foreground">
                {allUsers.length} user{allUsers.length !== 1 ? "s" : ""} in database
              </p>
            </div>
            <ImportPlexUsersButton />
          </div>
        </div>

        <UsersList
          users={allUsers}
          currentYear={currentYear}
          stripeDashboardBaseUrl={stripeDashboardBaseUrl}
        />

        <UsersStatsSummary users={allUsers} />
      </div>
    </div>
  )
}

