/**
 * Whether a member sees Leaving soon at all (TS 13.1, UX 9.1): the one value
 * that the nav item, the Home row and the page content follow. Server-only.
 *
 * The checks run cheap ones first, and each must pass:
 *
 * 1. The feature is on and not paused, and the member option "Leaving soon
 *    page and Home row" (`members.pageEnabled`) is on.
 * 2. The member has a plex.tv account id, and an active Plex server exists.
 * 3. One title is in Leaving soon, in any library. Without one, no plex.tv
 *    call is made.
 * 4. `memberCleanupAccess()` with the caller's budget. `null` (plex.tv did
 *    not answer) gives `sees: null`. Then one Leaving soon title must be one
 *    that the member may see.
 *
 * `lib/data/leaving-soon.ts` wraps {@link readMemberGate} in React `cache`,
 * keyed on the member and the budget, so the shell's 300 ms answer never
 * stands in for the page's 1500 ms one (E29).
 *
 * @module lib/cleanup/member/gate
 */

import "server-only"

import { isLive, readCleanupSettingsRow } from "@/lib/cleanup/settings"
import { getActiveService } from "@/lib/data/active-service"
import type { PlexServer } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"

import { type MemberCleanupAccess, memberCleanupAccess } from "./access"
import { countLeavingSoon, hasVisibleItem } from "./items"

/** The member sees Leaving soon, with what the page needs to list it. */
export interface OpenGate {
  sees: true
  options: CleanupOptions
  server: PlexServer
  plexUserId: string
  access: MemberCleanupAccess
}

/** `sees`: true, false, or null when plex.tv did not answer in time. The options hold the Keep settings either way. */
type MemberGate = OpenGate | { sees: false | null; options: CleanupOptions }

/**
 * The checks of TS 13.1 for one member and one plex.tv budget.
 *
 * @param userId - The member's app user id
 * @param timeoutMs - How long to wait for the plex.tv share list
 */
export async function readMemberGate(userId: string, timeoutMs: number): Promise<MemberGate> {
  const settings = await readCleanupSettingsRow()
  const { options } = settings
  const closed = { sees: false, options } as const
  if (!isLive(settings) || !options.members.pageEnabled) return closed

  const [user, server] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { plexUserId: true } }),
    getActiveService("plex"),
  ])
  const plexUserId = user?.plexUserId
  if (!plexUserId || !server) return closed
  if ((await countLeavingSoon()) === 0) return closed

  const access = await memberCleanupAccess(server, plexUserId, { timeoutMs })
  if (access === null) return { sees: null, options }
  if (access !== "all" && !(await hasVisibleItem(access))) return closed
  return { sees: true, options, server, plexUserId, access }
}
