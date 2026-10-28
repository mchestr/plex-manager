import "server-only"

import type { NavCounts } from "@/lib/admin/nav"
import { navFor } from "@/lib/admin/nav"
import { getAdminNavCounts } from "@/lib/admin/nav-counts"
import { serverName } from "@/lib/brand"
import type { PermissionSubject } from "@/lib/permissions"
import { initialsFor } from "@/lib/member/shell"

/** The signed-in admin as the sidebar footer shows them. */
export interface AdminShellUser {
  name: string
  initials: string
}

export interface AdminShellData {
  serverName: string
  user: AdminShellUser
  navCounts: NavCounts
  /**
   * The ids of the nav items the user may open. Assistant shows while AI
   * features are off too: its page keeps the history readable and says why
   * nothing can be sent, as the other AI pages stay listed.
   */
  navIds: string[]
  /** True for a non-admin role: a trimmed shell without the admin search or quick actions. */
  scoped: boolean
}

/** Everything `AdminShell` needs, read once per admin layout render. */
export async function getAdminShellData(session: ({ id: string; name?: string | null } & PermissionSubject)): Promise<AdminShellData> {
  const [name, navCounts] = await Promise.all([serverName(), getAdminNavCounts()])
  const displayName = session.name?.trim() || "Admin"

  return {
    serverName: name,
    user: { name: displayName, initials: initialsFor(displayName) },
    // A role sees the member count only, not invites or job health
    navCounts: session.isAdmin ? navCounts : { users: navCounts.users, activeInvites: 0, failedJobs: null },
    navIds: navFor(session).map((item) => item.id),
    scoped: !session.isAdmin,
  }
}
