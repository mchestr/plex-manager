/**
 * Whom the inactivity sweep would remove now, for `/admin/inactivity`
 * (admin only).
 *
 * The sweep's own rules (`lib/inactivity/rules.ts`) over the sweep's member
 * rows (`lib/inactivity/members.ts`), so the list is what a run would remove
 * from the same data. Two inputs differ from a run's:
 *
 * | Input       | Sweep                                  | Preview                                                                 |
 * |-------------|----------------------------------------|-------------------------------------------------------------------------|
 * | `readSince` | The start of its own read, just before | The start of the newest finished run whose read worked; null before one |
 * | `newestPlayAt` | Its own read's                      | The newest finished run's that found a play, for the removal gate        |
 * | Plex shares | No answer blocks the run               | No answer keeps every inactive member, and `shareCheck` says why        |
 *
 * Each member counts once: under the first rule that protects them (`skips`),
 * as active (played, joined or got access back within the threshold), as without access
 * (inactive, with no share of the server), as held by the sweep's removal gate
 * (`removalGate`, `lib/inactivity/notices.ts`: waiting for a removal date or a
 * warning email), or as a row. So the rows, and the Run now dialog's
 * confirmed members, are the members a run would remove. Rows sort like the
 * sweep's candidates, the longest inactive first. `scheduledLimit` is a
 * scheduled run's safety limit, from the members with a share.
 *
 * The warning lists (`lib/inactivity/notice-lists.ts`) cover every member
 * with a share and no skip, active ones too, since a first warning goes out
 * before the due day: who waits for a date a warning named, who the next
 * daily run warns first, and who of them the app cannot email, by code.
 * These lists name a member by name only, never by address. While
 * warnings are off, the first warnings and the cannot-email list are what a
 * switch-on would do.
 *
 * @module lib/data/inactivity-preview
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { getActiveService } from "@/lib/data/active-service"
import { listInactivityMembers } from "@/lib/inactivity/members"
import { cannotEmail, newestNotice, warningLists, type CannotEmailCode, type NoticeSummary } from "@/lib/inactivity/notice-lists"
import { readNoticeDetails } from "@/lib/inactivity/notice-store"
import { cycleState, MAX_NOTICE_ATTEMPTS, removalGate } from "@/lib/inactivity/notices"
import {
  byLongestInactive,
  INACTIVITY_SKIPS,
  inactivitySkip,
  isInactive,
  lastActiveAt,
  scheduledRunLimit,
  type InactivityMember,
  type InactivitySkip,
  withReturn,
} from "@/lib/inactivity/rules"
import { getInactivityWarnings } from "@/lib/inactivity/settings"
import { hasShare, readPlexShares, type ShareBlock } from "@/lib/inactivity/shares"
import { prisma } from "@/lib/prisma"
import { serverZone } from "@/lib/utils/server-zone"

/** A member a run would remove now. */
export interface InactivityPreviewRow {
  id: string
  name: string
  lastSeenAt: Date | null
  /** The latest of the newest play, the day they joined and the day their access came back. */
  lastActiveAt: Date
  createdAt: Date
}

/** A member with an open warning, waiting for its removal date. */
export interface WaitingRow {
  id: string
  name: string
  /** The removal date, `YYYY-MM-DD` in the member's zone. */
  removalDay: string
  /** The newest warning of the cycle. */
  last: NoticeSummary | null
}

/** A member the next daily run warns first. */
export interface FirstWarningRow {
  id: string
  name: string
  /** The removal date the first warning would name, `YYYY-MM-DD` in the member's zone. */
  removalDay: string
  lastActiveAt: Date
}

/**
 * A member whose newest warning of the cycle failed and holds the removal (a
 * first warning with none sent, or a last warning): the removal waits until a
 * run sends a new one. A failed reminder is not one.
 */
interface FailedWarningRow {
  id: string
  name: string
  /** It failed {@link MAX_NOTICE_ATTEMPTS} times, so no run tries it again. */
  stuck: boolean
}

/** A member of either list whom the app cannot email. */
export interface CannotEmailRow {
  id: string
  name: string
  code: CannotEmailCode
  list: "waiting" | "first"
}

export interface InactivityPreview {
  /** The longest inactive first. */
  rows: InactivityPreviewRow[]
  /** Members each rule protects, by the first rule that applies. */
  skips: Record<InactivitySkip, number>
  /** Members who played, joined or got access back within the threshold. */
  active: number
  /** Inactive members with no share of the server: nothing to remove. */
  noAccess: number
  /** Inactive members the removal gate holds back for their removal date or their warning emails. */
  held: number
  /** Of {@link held}, those with no warning yet in their cycle, while warnings are on: the next run warns them first. */
  unwarned: number
  /** Set when the shares could not be read, so the rows can hold members without access. */
  shareCheck: ShareBlock | null
  /** The most members a scheduled run may remove now; null while the shares are unknown. */
  scheduledLimit: number | null
  /** When the read the preview uses started; null before the first read worked. */
  readSince: Date | null
  /** Warning emails are on; while off, the first warnings and cannot-email list are a projection. */
  warningsOn: boolean
  /** The soonest removal date first. */
  waiting: WaitingRow[]
  /** The longest inactive first. */
  firstWarnings: FirstWarningRow[]
  /** Waiting first, then the first warnings, each in their list's order. */
  cannotEmail: CannotEmailRow[]
  /** While warnings are on, the members whose newest warning failed. */
  failedWarnings: FailedWarningRow[]
}

/**
 * The preview for `thresholdDays` as of `now`. Reads plex.tv's share list
 * once, which can take up to 15 seconds when plex.tv is slow.
 *
 * @throws the `PM_FORBIDDEN` or `PM_UNAUTHENTICATED` error from {@link assertAdmin}
 */
export async function getInactivityPreview(thresholdDays: number, now: Date): Promise<InactivityPreview> {
  await assertAdmin()
  const [stored, active, read, played, warnings, zone] = await Promise.all([
    listInactivityMembers(),
    getActiveService("plex"),
    prisma.inactivityRun.findFirst({ where: { error: null, finishedAt: { not: null } }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
    // A run whose read found no play stores none; an older play is earlier, so the gate holds more, never less
    prisma.inactivityRun.findFirst({
      where: { finishedAt: { not: null }, newestPlayAt: { not: null } },
      orderBy: { startedAt: "desc" },
      select: { newestPlayAt: true },
    }),
    getInactivityWarnings(),
    serverZone(),
  ])
  const shares = await readPlexShares(active)
  const readSince = read?.startedAt ?? null
  const newestPlayAt = played?.newestPlayAt ?? null
  const rules = { ownerPlexUserId: active?.adminPlexUserId ?? null, readSince }
  // Without the share list every member may have access, so none is left out
  const withAccess = (member: InactivityMember) => !shares.ok || hasShare(shares.ids, member.plexUserId)
  // A run stamps a return it sees (lib/inactivity/members.ts recordReturns); the preview only reads
  const members = stored.map((member) => withReturn(member, shares.ok && hasShare(shares.ids, member.plexUserId), now))

  const skips = Object.fromEntries(INACTIVITY_SKIPS.map((skip) => [skip, 0])) as Record<InactivitySkip, number>
  const inactive: InactivityMember[] = []
  let recent = 0
  let noAccess = 0
  for (const member of members) {
    const skip = inactivitySkip(member, rules)
    if (skip) skips[skip] += 1
    else if (!isInactive(member, thresholdDays, now)) recent += 1
    else if (!withAccess(member)) noAccess += 1
    else inactive.push(member)
  }

  // The members a run warns or removes: a share and no skip, as the sweep picks them
  const shared = members.filter(withAccess)
  const eligible = shared.filter((member) => !inactivitySkip(member, rules))
  const notices = Map.groupBy(await readNoticeDetails(eligible.map((member) => member.id)), (row) => row.userId)
  const rowsOf = (member: InactivityMember) => notices.get(member.id) ?? []
  const warningsOn = warnings.warningsEnabled
  const gate = { thresholdDays, now, newestPlayAt, warnings: warningsOn ? { warningDays: warnings.warningDays, serverZone: zone } : null }
  const holds = inactive.map((member) => ({ member, hold: removalGate(member, rowsOf(member), gate) }))
  const candidates = holds.flatMap(({ member, hold }) => (hold === null ? [member] : [])).sort(byLongestInactive)
  // The newest warning of the cycle failed and holds the removal: a first warning with none sent, or a last
  // warning (rule 6). A later stage or a new last warning would have replaced it. A failed reminder holds
  // nothing, since the member still gets the last warning, so it is not listed.
  const smallestLead = warnings.warningDays[warnings.warningDays.length - 1]
  const failed = warningsOn
    ? eligible.flatMap((member) => {
        const state = cycleState(member, rowsOf(member), { thresholdDays, serverZone: zone })
        const newest = newestNotice(state.rows)
        const holds = newest?.status === "failed" && (newest.leadDays <= smallestLead || state.active.length === 0)
        return holds ? [{ id: member.id, stuck: newest.attempts >= MAX_NOTICE_ATTEMPTS }] : []
      })
    : []
  const lists = warningLists(
    eligible.map((member) => ({ member, rows: rowsOf(member) })),
    { now, thresholdDays, newestPlayAt, warningsOn, warningDays: warnings.warningDays, serverZone: zone, sharedMembers: shared.length }
  )

  const ids = [
    ...new Set([
      ...[...candidates, ...lists.waiting.map((entry) => entry.member), ...lists.firstWarnings.map((entry) => entry.member)].map((member) => member.id),
      ...failed.map((row) => row.id),
    ]),
  ]
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true, disabledAt: true, inactivityEmailsOff: true },
      })
    : []
  const userOf = new Map(users.map((user) => [user.id, user]))
  const nameOf = (id: string) => {
    const user = userOf.get(id)
    return user?.name || user?.email || "Unknown member"
  }
  // The warning lists name a member without their address, since "Cannot email" is about that address
  const listName = (id: string) => userOf.get(id)?.name || "Unknown member"
  const reasonFor = (member: InactivityMember, last: NoticeSummary | null = null) => {
    const user = userOf.get(member.id)
    const plexEmail = shares.ok ? shares.emails.get(member.plexUserId?.trim() ?? "") : undefined
    return cannotEmail({ email: user?.email ?? null, disabledAt: user?.disabledAt ?? null, inactivityEmailsOff: user?.inactivityEmailsOff ?? false, plexEmail, plexRead: shares.ok }, last)
  }
  const unreachable = [
    ...lists.waiting.map((entry) => ({ member: entry.member, code: reasonFor(entry.member, entry.last), list: "waiting" as const })),
    ...lists.firstWarnings.map((entry) => ({ member: entry.member, code: reasonFor(entry.member), list: "first" as const })),
  ].flatMap(({ member, code, list }) => (code ? [{ id: member.id, name: listName(member.id), code, list }] : []))

  return {
    rows: candidates.map((member) => ({
      id: member.id,
      name: nameOf(member.id),
      lastSeenAt: member.lastSeenAt,
      lastActiveAt: lastActiveAt(member),
      createdAt: member.createdAt,
    })),
    skips,
    active: recent,
    noAccess,
    held: inactive.length - candidates.length,
    unwarned: holds.filter(({ hold }) => hold === "unwarned").length,
    shareCheck: shares.ok ? null : shares.block,
    scheduledLimit: shares.ok ? scheduledRunLimit(shared.length) : null,
    readSince,
    warningsOn,
    waiting: lists.waiting.map(({ member, removalDay, last }) => ({ id: member.id, name: listName(member.id), removalDay, last })),
    firstWarnings: lists.firstWarnings.map(({ member, removalDay }) => ({
      id: member.id,
      name: listName(member.id),
      removalDay,
      lastActiveAt: lastActiveAt(member),
    })),
    cannotEmail: unreachable,
    failedWarnings: failed.map(({ id, stuck }) => ({ id, name: listName(id), stuck })),
  }
}
