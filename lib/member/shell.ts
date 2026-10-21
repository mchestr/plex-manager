import "server-only"

import { serverName } from "@/lib/brand"
import { hasMembershipPage } from "@/lib/member/membership-page"
import { memberNav, type MemberNavItem } from "@/lib/member/nav"
import { prisma } from "@/lib/prisma"
import { requestRewindCardModel } from "@/lib/rewind/home-card"
import { rewindNavYear } from "@/lib/rewind/home-card-state"

/** The signed-in member as the shell shows them (ui-design-system 5.5). */
export interface ShellUser {
  name: string
  email: string | null
  initials: string
  isAdmin: boolean
  /** The linked Discord handle, `null` when unlinked, and absent when Discord is off. */
  discordHandle?: string | null
  /** Whether `/membership` exists for them, for the account menu. */
  membership: boolean
}

export interface AppShellData {
  serverName: string
  user: ShellUser
  nav: MemberNavItem[]
}

/** Up to two initials from the name's first words; "?" for an empty name. */
export function initialsFor(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => [...word][0] ?? "")
  return letters.join("").toLocaleUpperCase() || "?"
}

/**
 * The year Rewind's nav item opens, from the home card's resolver (P6.9):
 * null hides it when the member has nothing to open there.
 */
async function rewindYearFor(userId: string, isAdmin: boolean): Promise<number | null> {
  const card = await requestRewindCardModel(userId, isAdmin)
  return card ? rewindNavYear(card.state, card.archive) : null
}

/** The member's Discord username, `null` when unlinked, `undefined` when Discord linking is off. */
export async function discordHandleFor(userId: string): Promise<string | null | undefined> {
  const [integration, connection] = await Promise.all([
    prisma.discordIntegration.findUnique({
      where: { id: "discord" },
      select: { isEnabled: true, clientId: true, clientSecret: true },
    }),
    prisma.discordConnection.findUnique({ where: { userId }, select: { username: true } }),
  ])
  if (connection) return connection.username
  return integration?.isEnabled && integration.clientId && integration.clientSecret ? null : undefined
}

/** Everything `AppShell` needs for the signed-in member, read once per layout render. */
export async function getAppShellData(session: { id: string; isAdmin: boolean }): Promise<AppShellData> {
  const [name, user, rewindYear, discordHandle, membership] = await Promise.all([
    serverName(),
    prisma.user.findUnique({ where: { id: session.id }, select: { name: true, email: true } }),
    rewindYearFor(session.id, session.isAdmin),
    discordHandleFor(session.id),
    hasMembershipPage(session.id),
  ])
  const displayName = user?.name?.trim() || user?.email || "Member"

  return {
    serverName: name,
    user: {
      name: displayName,
      email: user?.email ?? null,
      initials: initialsFor(displayName),
      isAdmin: session.isAdmin,
      membership,
      ...(discordHandle === undefined ? {} : { discordHandle }),
    },
    nav: memberNav({ rewindYear, membership }),
  }
}
