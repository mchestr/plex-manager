/**
 * The inactivity sweep: removes Plex access from members who have not played
 * anything for the threshold, under the rules in `lib/inactivity/rules.ts`.
 * `lib/inactivity/run.ts` calls it right after the last seen read.
 *
 * ## Steps
 *
 * 1. Guards, each a block that removes no one (`lib/inactivity/blocks.ts`):
 *    the sweep is off (`disabled`); Tautulli recorded no play on the whole
 *    server in 14 days (`tautulli_stale`); no Plex server (`no_plex_server`);
 *    the server or plex.tv's share list does not answer (`plex_unavailable`,
 *    or `plex_auth` when plex.tv refuses the token). Without a share list,
 *    access is unknown, so no one is removed.
 * 2. Candidates: members with an accepted share of this server, no skip, and
 *    inactive; the longest inactive first.
 * 3. The limit: a scheduled run removes no one when more qualify than
 *    `scheduledRunLimit` allows (`over_limit`); an admin run, when more qualify
 *    than the admin confirmed (`not_confirmed`).
 * 4. Each candidate, under the member's access lock when Redis is set up: read
 *    the member again and re-check the rules, remove the share and offboard
 *    them (`unshareMember`), then write `MEMBER_UNSHARED` and wait for the row.
 *
 * ## Each candidate
 *
 * | Case                                         | Entry                                  | Run                     |
 * |----------------------------------------------|----------------------------------------|-------------------------|
 * | The re-check protects the member             | `skipped`: the skip, `active` or `missing` | goes on             |
 * | Another access change holds the member's lock | `failed`: `busy`                      | goes on                 |
 * | plex.tv did not answer                       | `failed`: `PLEX_UNAVAILABLE`           | goes on                 |
 * | plex.tv refused the token                    | `failed`: `PLEX_AUTH`                  | stops: `plex_auth`      |
 * | Removed and audited                          | `removed` or `already_removed`         | goes on                 |
 * | Removed, the audit row failed                | `removed` or `already_removed`         | stops: `audit_failed`   |
 * | Removed, the clean-up failed                 | `failed`: `offboard_failed`            | stops: `offboard_failed` |
 * | The server shuts down                        | none                                   | stops: `stopped`        |
 *
 * A removal whose clean-up failed still gets its `MEMBER_UNSHARED` row, with
 * `offboarded: false`, when the row can be written.
 *
 * @module lib/inactivity/sweep
 */

import "server-only"

import type { PlexUnshareResult } from "@/lib/connections/plex-invitations"
import { getActiveService } from "@/lib/data/active-service"
import { TAUTULLI_STALE_DAYS, type InactivityBlock } from "@/lib/inactivity/blocks"
import type { InactivityEntry, InactivityOutcome } from "@/lib/inactivity/entries"
import { listInactivityMembers, readInactivityMember } from "@/lib/inactivity/members"
import {
  byLongestInactive,
  inactivitySkip,
  isInactive,
  lastActiveAt,
  scheduledRunLimit,
  type InactivityMember,
} from "@/lib/inactivity/rules"
import type { InactivitySettingsValues } from "@/lib/inactivity/settings"
import { hasShare, readPlexShares, type ShareServer } from "@/lib/inactivity/shares"
import { AccessLockBusyError, withAccessLock } from "@/lib/locks/access-lock"
import { UnshareCleanupError, unshareMember } from "@/lib/members/unshare"
import { getRedisConnection, isRedisConfigured } from "@/lib/queue/connection"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("INACTIVITY_SWEEP")

const DAY_MS = 24 * 60 * 60 * 1000
/** How long a removal waits for another access change of the same member. */
const LOCK_WAIT_MS = 5_000

export type MemberActivityTrigger = "scheduled" | "admin"

export interface SweepOptions {
  runId: string
  trigger: MemberActivityTrigger
  /** The admin who started the run, or `SYSTEM_ACTOR`. */
  actorId: string
  /** An admin run's confirmed member count. */
  confirmedRemovals?: number
  settings: InactivitySettingsValues
  now: Date
  signal?: AbortSignal
  /** A member whose `lastSeenReadAt` is before this was not found by the latest read. */
  readSince: Date
  /** The newest play on the whole server, for the freshness guard. */
  newestPlayAt: Date | null
}

export interface SweepResult {
  qualified: number
  /** Removed or already removed. */
  removed: number
  failed: number
  entries: InactivityEntry[]
  blocked: InactivityBlock | null
}

interface Removal {
  entry: InactivityEntry
  /** Why the run stops after this member, if it does. */
  stop?: InactivityBlock
}

interface RemovalContext extends SweepOptions {
  server: ShareServer
}

const blocked = (block: InactivityBlock, qualified = 0): SweepResult => ({ qualified, removed: 0, failed: 0, entries: [], blocked: block })

function entryFor(member: InactivityMember, outcome: InactivityOutcome, code?: string): InactivityEntry {
  return {
    userId: member.id,
    outcome,
    lastActiveAt: lastActiveAt(member).toISOString(),
    lastSeenAt: member.lastSeenAt?.toISOString() ?? null,
    ...(code ? { code } : {}),
  }
}

const rulesFor = (ctx: Pick<RemovalContext, "server" | "readSince">) => ({
  ownerPlexUserId: ctx.server.adminPlexUserId,
  readSince: ctx.readSince,
})

/** Re-checks one candidate, removes their share, offboards them and writes the audit row. */
async function remove(candidate: InactivityMember, ctx: RemovalContext): Promise<Removal> {
  const member = await readInactivityMember(candidate.id)
  if (!member) return { entry: entryFor(candidate, "skipped", "missing") }
  const skip = inactivitySkip(member, rulesFor(ctx))
  if (skip) return { entry: entryFor(member, "skipped", skip) }
  if (!isInactive(member, ctx.settings.thresholdDays, ctx.now)) return { entry: entryFor(member, "skipped", "active") }

  const audit = (status: "removed" | "already_removed", extra: { offboarded?: false } = {}) =>
    recordAuditEvent(AuditEventType.MEMBER_UNSHARED, ctx.actorId, {
      targetUserId: member.id,
      status,
      reason: "inactivity",
      lastSeenAt: member.lastSeenAt?.toISOString() ?? null,
      lastActiveAt: lastActiveAt(member).toISOString(),
      thresholdDays: ctx.settings.thresholdDays,
      runId: ctx.runId,
      ...extra,
    })

  let result: PlexUnshareResult
  try {
    result = await unshareMember({ id: member.id, plexUserId: member.plexUserId!.trim() }, ctx.server, ctx.actorId)
  } catch (error) {
    if (!(error instanceof UnshareCleanupError)) throw error
    logger.error("inactivity.offboard_failed", error, { userId: member.id, runId: ctx.runId })
    await audit(error.status, { offboarded: false }).catch((auditError: unknown) =>
      logger.error("inactivity.audit_failed", auditError, { userId: member.id, runId: ctx.runId })
    )
    return { entry: entryFor(member, "failed", "offboard_failed"), stop: "offboard_failed" }
  }
  if (!result.success) {
    const entry = entryFor(member, "failed", result.code)
    return result.code === "PLEX_AUTH" ? { entry, stop: "plex_auth" } : { entry }
  }

  const entry = entryFor(member, result.status)
  try {
    await audit(result.status)
  } catch (error) {
    logger.error("inactivity.audit_failed", error, { userId: member.id, runId: ctx.runId })
    return { entry, stop: "audit_failed" }
  }
  return { entry }
}

/** {@link remove} under the member's access lock, so a grant or revoke job cannot run at the same time. */
async function removeLocked(candidate: InactivityMember, ctx: RemovalContext): Promise<Removal> {
  if (!isRedisConfigured()) return remove(candidate, ctx)
  try {
    return await withAccessLock(candidate.id, `inactivity:${ctx.runId}`, () => remove(candidate, ctx), {
      redis: getRedisConnection(),
      waitMs: LOCK_WAIT_MS,
    })
  } catch (error) {
    if (error instanceof AccessLockBusyError) return { entry: entryFor(candidate, "failed", "busy") }
    throw error
  }
}

/**
 * Removes the inactive members' Plex access, or no one when a guard or the
 * limit blocks the run. Throws only on a database or Redis error.
 */
export async function runSweep(options: SweepOptions): Promise<SweepResult> {
  const { settings, now, newestPlayAt, trigger } = options
  if (!settings.enabled) return blocked("disabled")
  if (!newestPlayAt || now.getTime() - newestPlayAt.getTime() > TAUTULLI_STALE_DAYS * DAY_MS) return blocked("tautulli_stale")

  const shares = await readPlexShares(await getActiveService("plex"))
  if (!shares.ok) return blocked(shares.block)

  const withAccess = (await listInactivityMembers()).filter((member) => hasShare(shares.ids, member.plexUserId))
  const ctx: RemovalContext = { ...options, server: shares.server }
  const candidates = withAccess
    .filter((member) => !inactivitySkip(member, rulesFor(ctx)) && isInactive(member, settings.thresholdDays, now))
    .sort(byLongestInactive)
  const qualified = candidates.length

  if (trigger === "scheduled" && qualified > scheduledRunLimit(withAccess.length)) return blocked("over_limit", qualified)
  if (trigger === "admin" && qualified > (options.confirmedRemovals ?? 0)) return blocked("not_confirmed", qualified)

  const entries: InactivityEntry[] = []
  let stop: InactivityBlock | null = null
  for (const candidate of candidates) {
    if (options.signal?.aborted) {
      stop = "stopped"
      break
    }
    const removal = await removeLocked(candidate, ctx)
    entries.push(removal.entry)
    if (removal.stop) {
      stop = removal.stop
      break
    }
  }

  const count = (...outcomes: InactivityOutcome[]) => entries.filter((entry) => outcomes.includes(entry.outcome)).length
  logger.info("inactivity.swept", { runId: options.runId, trigger, qualified, entries: entries.length, blocked: stop })
  return { qualified, removed: count("removed", "already_removed"), failed: count("failed"), entries, blocked: stop }
}
