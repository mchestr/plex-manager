import "server-only"

import type { NavCounts } from "@/lib/admin/nav"
import { navFor } from "@/lib/admin/nav"
import { getAdminNavCounts } from "@/lib/admin/nav-counts"
import { serverName } from "@/lib/brand"
import { openConversationsOf } from "@/lib/chatbot/history"
import { hasPermission, type PermissionSubject } from "@/lib/permissions"
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
  /**
   * The ids of the nav items the user may open. Assistant shows while AI
   * features are on and a chat model is active, and while they are off only
   * to a user with saved conversations, which its page keeps readable and
   * deletable: an install without AI gets no item that leads nowhere.
   */
  navIds: string[]
  /** True for a non-admin role: a trimmed shell without the admin search or quick actions. */
  scoped: boolean
}

/** Whether the Assistant item shows: on, or off with conversations of the user's to read or delete. */
async function showsAssistant(userId: string): Promise<boolean> {
  const [config, chatProvider] = await Promise.all([
    prisma.config.findUnique({ where: { id: "config" }, select: { llmDisabled: true } }),
    prisma.lLMProvider.findFirst({ where: { isActive: true, purpose: "chat" }, select: { id: true } }),
  ])
  if (!config?.llmDisabled && chatProvider !== null) return true
  const saved = await prisma.chatConversation.findFirst({
    where: { ...openConversationsOf(userId), lastMessageAt: { not: null } },
    select: { id: true },
  })
  return saved !== null
}

/** Everything `AdminShell` needs, read once per admin layout render. */
export async function getAdminShellData(session: ({ id: string; name?: string | null } & PermissionSubject)): Promise<AdminShellData> {
  const items = navFor(session)
  const [name, navCounts, assistant] = await Promise.all([
    serverName(),
    getAdminNavCounts(),
    items.some((item) => item.id === "assistant") ? showsAssistant(session.id) : false,
  ])
  const displayName = session.name?.trim() || "Admin"

  return {
    serverName: name,
    user: { name: displayName, initials: initialsFor(displayName) },
    // A role sees the member count and, with affiliates:read, the pending applications; never invites or job health
    navCounts: session.isAdmin
      ? navCounts
      : {
          users: navCounts.users,
          activeInvites: 0,
          pendingAffiliates: hasPermission(session, "affiliates:read") ? navCounts.pendingAffiliates : 0,
          failedJobs: null,
        },
    navIds: items.filter((item) => item.id !== "assistant" || assistant).map((item) => item.id),
    scoped: !session.isAdmin,
  }
}
