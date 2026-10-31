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
 * | Plex shares | No answer blocks the run               | No answer keeps every inactive member, and `shareCheck` says why        |
 *
 * Each member counts once: under the first rule that protects them (`skips`),
 * as active (played or joined within the threshold), as without access
 * (inactive, with no share of the server), or as a row. Rows sort like the
 * sweep's candidates, the longest inactive first. `scheduledLimit` is a
 * scheduled run's safety limit, from the members with a share.
 *
 * @module lib/data/inactivity-preview
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { getActiveService } from "@/lib/data/active-service"
import { listInactivityMembers } from "@/lib/inactivity/members"
import {
  byLongestInactive,
  INACTIVITY_SKIPS,
  inactivitySkip,
  isInactive,
  lastActiveAt,
  scheduledRunLimit,
  type InactivityMember,
  type InactivitySkip,
} from "@/lib/inactivity/rules"
import { hasShare, readPlexShares, type ShareBlock } from "@/lib/inactivity/shares"
import { prisma } from "@/lib/prisma"

/** A member a run would remove now. */
export interface InactivityPreviewRow {
  id: string
  name: string
  lastSeenAt: Date | null
  /** The later of the newest play and the day they joined. */
  lastActiveAt: Date
  createdAt: Date
}

export interface InactivityPreview {
  /** The longest inactive first. */
  rows: InactivityPreviewRow[]
  /** Members each rule protects, by the first rule that applies. */
  skips: Record<InactivitySkip, number>
  /** Members who played or joined within the threshold. */
  active: number
  /** Inactive members with no share of the server: nothing to remove. */
  noAccess: number
  /** Set when the shares could not be read, so the rows can hold members without access. */
  shareCheck: ShareBlock | null
  /** The most members a scheduled run may remove now; null while the shares are unknown. */
  scheduledLimit: number | null
  /** When the read the preview uses started; null before the first read worked. */
  readSince: Date | null
}

/**
 * The preview for `thresholdDays` as of `now`. Reads plex.tv's share list
 * once, which can take up to 15 seconds when plex.tv is slow.
 *
 * @throws the `PM_FORBIDDEN` or `PM_UNAUTHENTICATED` error from {@link assertAdmin}
 */
export async function getInactivityPreview(thresholdDays: number, now: Date): Promise<InactivityPreview> {
  await assertAdmin()
  const [members, active, read] = await Promise.all([
    listInactivityMembers(),
    getActiveService("plex"),
    prisma.inactivityRun.findFirst({
      where: { error: null, finishedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
  ])
  const shares = await readPlexShares(active)
  const readSince = read?.startedAt ?? null
  const rules = { ownerPlexUserId: active?.adminPlexUserId ?? null, readSince }
  // Without the share list every member may have access, so none is left out
  const withAccess = (member: InactivityMember) => !shares.ok || hasShare(shares.ids, member.plexUserId)

  const skips = Object.fromEntries(INACTIVITY_SKIPS.map((skip) => [skip, 0])) as Record<InactivitySkip, number>
  const candidates: InactivityMember[] = []
  let recent = 0
  let noAccess = 0
  for (const member of members) {
    const skip = inactivitySkip(member, rules)
    if (skip) skips[skip] += 1
    else if (!isInactive(member, thresholdDays, now)) recent += 1
    else if (!withAccess(member)) noAccess += 1
    else candidates.push(member)
  }
  candidates.sort(byLongestInactive)

  const users = candidates.length
    ? await prisma.user.findMany({ where: { id: { in: candidates.map((member) => member.id) } }, select: { id: true, name: true, email: true } })
    : []
  const nameOf = new Map(users.map((user) => [user.id, user.name || user.email || "Unknown member"]))
  return {
    rows: candidates.map((member) => ({
      id: member.id,
      name: nameOf.get(member.id) ?? "Unknown member",
      lastSeenAt: member.lastSeenAt,
      lastActiveAt: lastActiveAt(member),
      createdAt: member.createdAt,
    })),
    skips,
    active: recent,
    noAccess,
    shareCheck: shares.ok ? null : shares.block,
    scheduledLimit: shares.ok ? scheduledRunLimit(members.filter(withAccess).length) : null,
    readSince,
  }
}
