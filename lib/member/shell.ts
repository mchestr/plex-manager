import "server-only"

import { serverName } from "@/lib/brand"
import { memberNav, type MemberNavItem } from "@/lib/member/nav"
import { prisma } from "@/lib/prisma"
import { getSeasonYear } from "@/lib/wrapped/season"

/** The signed-in member as the shell shows them (ui-design-system 5.5). */
export interface ShellUser {
  name: string
  email: string | null
  initials: string
  isAdmin: boolean
  /** The linked Discord handle, `null` when unlinked, and absent when Discord is off. */
  discordHandle?: string | null
}

export interface AppShellData {
  serverName: string
  user: ShellUser
  nav: MemberNavItem[]
}

/** Up to two initials from the name's first words; "?" for an empty name. @internal */
export function initialsFor(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => [...word][0] ?? "")
  return letters.join("").toLocaleUpperCase() || "?"
}

/**
 * Rewind is in the nav when the member can open something there: the season
 * is on for their audience (admins are always in it), or they have a
 * completed Rewind of any year. P6.9 swaps in its card resolver.
 */
async function canOpenRewind(userId: string, isAdmin: boolean): Promise<boolean> {
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { rewindEnabled: true, rewindAudience: true },
  })
  if (config?.rewindEnabled && (config.rewindAudience === "all" || isAdmin)) return true
  const completed = await prisma.plexWrapped.findFirst({ where: { userId, status: "completed" }, select: { id: true } })
  return completed !== null
}

async function discordHandleFor(userId: string): Promise<string | null | undefined> {
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
  const [name, user, rewind, seasonYear, discordHandle] = await Promise.all([
    serverName(),
    prisma.user.findUnique({ where: { id: session.id }, select: { name: true, email: true } }),
    canOpenRewind(session.id, session.isAdmin),
    getSeasonYear(),
    discordHandleFor(session.id),
  ])
  const displayName = user?.name?.trim() || user?.email || "Member"

  return {
    serverName: name,
    user: {
      name: displayName,
      email: user?.email ?? null,
      initials: initialsFor(displayName),
      isAdmin: session.isAdmin,
      ...(discordHandle === undefined ? {} : { discordHandle }),
    },
    nav: memberNav({ rewindYear: rewind ? seasonYear : null }),
  }
}
