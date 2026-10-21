import "server-only"

import type { NavCounts } from "@/lib/admin/nav"
import { getAdminNavCounts } from "@/lib/admin/nav-counts"
import { serverName } from "@/lib/brand"
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
  /** The assistant renders only while LLM calls are on and a chat provider is active. */
  assistant: boolean
}

/** Everything `AdminShell` needs, read once per admin layout render. */
export async function getAdminShellData(session: { id: string; name?: string | null }): Promise<AdminShellData> {
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
    navCounts,
    assistant: !config?.llmDisabled && chatProvider !== null,
  }
}
