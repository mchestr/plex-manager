import "server-only"

import type { Route } from "next"

import type { NavCounts } from "@/lib/admin/nav"
import { childrenOf, navFor } from "@/lib/admin/nav"
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

/** One nav item the user may open, as the server sends it: the client adds the label and icon from `ADMIN_NAV`. */
export interface AdminShellNavEntry {
  id: string
  /** Where the item opens for this user, as `navFor` resolved it: a role opens a folded item on its first permitted tab. */
  href: Route
  /** The ids of the item's tabs (`children`) the user may open; empty for an item without tabs. */
  childIds: string[]
}

export interface AdminShellData {
  serverName: string
  user: AdminShellUser
  navCounts: NavCounts
  /**
   * The nav items the user may open, in nav order, each with the href `navFor`
   * resolved for the user and the ids of its tabs the user may open (icons are
   * not serialisable, so the client rebuilds the items from `ADMIN_NAV` by
   * id). Assistant shows while AI features are on and a chat model is active,
   * and while they are off only to a user with saved conversations, which its
   * page keeps readable and deletable: an install without AI gets no item that
   * leads nowhere.
   */
  nav: AdminShellNavEntry[]
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
    // A role sees the member count and, with affiliates:read, the pending applications; never job health or problem reports
    navCounts: session.isAdmin
      ? navCounts
      : {
          users: navCounts.users,
          pendingAffiliates: hasPermission(session, "affiliates:read") ? navCounts.pendingAffiliates : 0,
          failedJobs: null,
          reportsToReview: 0,
        },
    nav: items
      .filter((item) => item.id !== "assistant" || assistant)
      .map((item) => ({ id: item.id, href: item.href, childIds: childrenOf(item.id, session).map((child) => child.id) })),
    scoped: !session.isAdmin,
  }
}
