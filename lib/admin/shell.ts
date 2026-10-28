import "server-only"

import type { NavCounts } from "@/lib/admin/nav"
import { navFor } from "@/lib/admin/nav"
import { getAdminNavCounts } from "@/lib/admin/nav-counts"
import { serverName } from "@/lib/brand"
import type { PermissionSubject } from "@/lib/permissions"
import { initialsFor } from "@/lib/member/shell"
import { prisma } from "@/lib/prisma"

/** The signed-in admin as the sidebar footer shows them. */
export interface AdminShellUser {
  name: string
  initials: string
}

export interface AdminShellData {
  serverName: string
  user: AdminShellUser
  navCounts: NavCounts
  /** The ids of the nav items the user may open; Assistant only while LLM calls are on and a chat provider is active. */
  navIds: string[]
  /** True for a non-admin role: a trimmed shell without the admin search or quick actions. */
  scoped: boolean
}

/** Everything `AdminShell` needs, read once per admin layout render. */
export async function getAdminShellData(session: ({ id: string; name?: string | null } & PermissionSubject)): Promise<AdminShellData> {
  const [name, navCounts, config, chatProvider] = await Promise.all([
    serverName(),
    getAdminNavCounts(),
    prisma.config.findUnique({ where: { id: "config" }, select: { llmDisabled: true } }),
    prisma.lLMProvider.findFirst({ where: { isActive: true, purpose: "chat" }, select: { id: true } }),
  ])
  const displayName = session.name?.trim() || "Admin"

  return {
    serverName: name,
    user: { name: displayName, initials: initialsFor(displayName) },
    // A role sees the member count only, not invites or job health
    navCounts: session.isAdmin ? navCounts : { users: navCounts.users, activeInvites: 0, failedJobs: null },
    navIds: navFor(session)
      .filter((item) => item.id !== "assistant" || (!config?.llmDisabled && chatProvider !== null))
      .map((item) => item.id),
    scoped: !session.isAdmin,
  }
}
