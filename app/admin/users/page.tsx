import { getAllUsersWithWrapped } from "@/actions/users"
import { ImportPlexUsersClient } from "@/components/admin/users/import-plex-users-client"
import { UsersListClient } from "@/components/admin/users/users-list-client"
import { UsersStatsSummary } from "@/components/admin/users/users-stats-summary"

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const currentYear = new Date().getFullYear()
  const allUsers = await getAllUsersWithWrapped(currentYear)

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Users</h1>
              <p className="text-sm text-slate-400">
                {allUsers.length} user{allUsers.length !== 1 ? "s" : ""} in database
              </p>
            </div>
            <ImportPlexUsersClient />
          </div>
        </div>

        <UsersListClient users={allUsers} currentYear={currentYear} />

        <UsersStatsSummary users={allUsers} />
      </div>
    </div>
  )
}

