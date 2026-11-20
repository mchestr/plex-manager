/**
 * The member side of Leaving soon (TS 13): the nav item check, the page, the
 * Home row and the member's own Keeps. Server-only.
 *
 * Every loader checks the session first: a member reads only their own
 * data. The data holds only titles in libraries shared with the member, and
 * no size, rule name, admin note, other member or plex.tv account id.
 *
 * {@link memberSeesLeavingSoon} is React `cache`d on the member and the
 * plex.tv budget (E29): the shell passes 300 ms and hides the nav item for
 * `null`; the page and the Home row pass 1500 ms, so a late answer in the
 * shell never empties the page. The page shows the plex.tv alert for `null`
 * (`plexFailed`), not the empty state.
 *
 * Each title the page or the Home row renders hands its section to the
 * poster route's cache (`rememberPosters`), as the New on row does.
 *
 * @module lib/data/leaving-soon
 */

import "server-only"

import { cache } from "react"

import { AUTH_ERROR_DIGESTS } from "@/lib/auth-errors"
import { readMemberGate } from "@/lib/cleanup/member/gate"
import { homeRow } from "@/lib/cleanup/member/groups"
import { rememberPosters } from "@/lib/cleanup/member/items"
import { type MemberKeeps, readMemberKeeps } from "@/lib/cleanup/member/keeps"
import { readMemberList } from "@/lib/cleanup/member/list"
import { readCleanupSettingsRow } from "@/lib/cleanup/settings"
import type { LeavingSoonRowData, MemberLeavingSoonData } from "@/lib/cleanup/types/member"
import { getActiveService } from "@/lib/data/active-service"
import { getSession } from "@/lib/data/session"
import type { PlexServer } from "@/lib/generated/prisma/client"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"

/** The plex.tv budget of the page, the Home row and the Keep action (TS 13.1). */
const PAGE_TIMEOUT_MS = 1500

const EMPTY_ROW: LeavingSoonRowData = { items: [], total: 0, forYouCount: 0 }

/** The session check: signed in, as the member whose data is read. */
async function sessionMember(userId: string): Promise<"ok" | "unauthenticated" | "forbidden"> {
  const session = await getSession()
  if (!session?.user?.id) return "unauthenticated"
  return session.user.id === userId ? "ok" : "forbidden"
}

async function assertSessionMember(userId: string): Promise<void> {
  const check = await sessionMember(userId)
  if (check === "ok") return
  const message = check === "forbidden" ? "Not your data" : "Authentication required"
  throw Object.assign(new Error(message), { digest: AUTH_ERROR_DIGESTS[check] })
}

const memberGate = cache((userId: string, timeoutMs: number) => readMemberGate(userId, timeoutMs))

/**
 * Whether the member sees Leaving soon (TS 13.1): `true`, `false`, or `null`
 * when plex.tv did not answer in `timeoutMs`. False for a session of
 * another member.
 */
export const memberSeesLeavingSoon = cache(async (userId: string, timeoutMs: number): Promise<boolean | null> => {
  if ((await sessionMember(userId)) !== "ok") return false
  return (await memberGate(userId, timeoutMs)).sees
})

const meterOf = (options: CleanupOptions, keeps: MemberKeeps): MemberLeavingSoonData["keeps"] => ({
  enabled: options.members.keepsEnabled,
  limit: options.members.keepLimit,
  used: keeps.used,
  days: options.members.keepDays,
})

/**
 * The page data, once per request for the page and the Home row. It reads
 * the same cached gate as `memberSeesLeavingSoon(userId, 1500)`, which also
 * holds the access map that the list needs.
 */
const memberData = cache(async (userId: string): Promise<{ data: MemberLeavingSoonData; server: PlexServer | null }> => {
  const now = new Date()
  const [gate, keeps] = await Promise.all([memberGate(userId, PAGE_TIMEOUT_MS), readMemberKeeps(userId, now)])
  const base = { keeps: meterOf(gate.options, keeps), myKeeps: keeps.rows }
  if (gate.sees !== true) {
    const data: MemberLeavingSoonData = { enabled: false, plexFailed: gate.sees === null, forYou: [], groups: [], ...base }
    return { data, server: null }
  }
  const list = await readMemberList(gate, { userId, activeKeys: keeps.activeKeys, now })
  const data: MemberLeavingSoonData = { enabled: true, plexFailed: false, ...list, ...base }
  return { data, server: gate.server }
})

/**
 * The Leaving soon page of the member (TS 13.3, UX 12.7).
 *
 * @throws the `PM_UNAUTHENTICATED` or `PM_FORBIDDEN` error for no session or another member's
 */
export async function getLeavingSoonForMember(userId: string): Promise<MemberLeavingSoonData> {
  await assertSessionMember(userId)
  const { data, server } = await memberData(userId)
  // Your Keeps renders posters while the feature is off too
  const plex = server ?? (await getActiveService("plex"))
  if (plex) {
    const items = [...data.forYou.map((entry) => entry.item), ...data.groups.flatMap((group) => group.items.map((entry) => entry.item))]
    rememberPosters(plex, [...items, ...data.myKeeps.map((keep) => keep.item)])
  }
  return data
}

/**
 * The Home row: up to 12 titles, For you first. Empty when the member does
 * not see Leaving soon or plex.tv did not answer (no server comes back then),
 * so the row renders nothing.
 *
 * @throws the `PM_UNAUTHENTICATED` or `PM_FORBIDDEN` error for no session or another member's
 */
export async function getLeavingSoonRow(userId: string): Promise<LeavingSoonRowData> {
  await assertSessionMember(userId)
  const { data, server } = await memberData(userId)
  if (!server) return EMPTY_ROW
  const row = homeRow(data.forYou, data.groups)
  rememberPosters(server, row.items.map((entry) => entry.item))
  return row
}

/**
 * The member's Keeps for Account (UX 9.4), with the Keep meter. It works
 * with the feature off: Keeps stay (E30).
 *
 * @throws the `PM_UNAUTHENTICATED` or `PM_FORBIDDEN` error for no session or another member's
 */
export async function getMyKeeps(userId: string): Promise<Pick<MemberLeavingSoonData, "keeps" | "myKeeps">> {
  await assertSessionMember(userId)
  const [settings, keeps, server] = await Promise.all([readCleanupSettingsRow(), readMemberKeeps(userId, new Date()), getActiveService("plex")])
  if (server) rememberPosters(server, keeps.rows.map((keep) => keep.item))
  return { keeps: meterOf(settings.options, keeps), myKeeps: keeps.rows }
}
