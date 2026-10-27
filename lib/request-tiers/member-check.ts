/**
 * One member's request tier, checked live the way the daily sync sees it: the
 * all-time hours Tautulli has, the tier they earn, and the quota Overseerr has
 * now. The admin's user page shows it, and {@link applyMemberTier} writes the
 * tier's quota for that one member.
 *
 * ## Status
 *
 * | Status | Meaning |
 * |---|---|
 * | `in-sync` | Overseerr has the tier's quota |
 * | `out-of-sync` | the next sync, or {@link applyMemberTier}, changes it |
 * | `excluded` | an admin set the member's limits by hand |
 * | `bypass` | an Overseerr admin or user manager: no quota applies |
 * | `unknown` | a service did not answer, or Overseerr has no user for the member |
 * | `not-connected` | Tautulli or Overseerr is not connected |
 *
 * @module lib/request-tiers/member-check
 */

import "server-only"

import { buildOverseerrUserIndex, findOverseerrUserId, type OverseerrEndpoint } from "@/lib/connections/overseerr"
import { serviceErrorMessage } from "@/lib/connections/http"
import { getOverseerrQuotaMember, setOverseerrUserQuota, type OverseerrQuotaMember } from "@/lib/connections/overseerr-quota"
import { getAllTimeWatchHours } from "@/lib/connections/tautulli-watch-time"
import { getActiveService } from "@/lib/data/active-service"
import { prisma } from "@/lib/prisma"
import { quotaForTier, sameQuota, type Quota } from "@/lib/request-tiers/quota"
import { tierProgress, tiersFromConfig, type RequestTier, type TierProgress } from "@/lib/request-tiers/tiers"

const CHECK_TIMEOUT_MS = 8000

export type MemberTierStatus = "in-sync" | "out-of-sync" | "excluded" | "bypass" | "unknown" | "not-connected"

export interface MemberTierCheck {
  status: MemberTierStatus
  /** The daily sync is on. */
  enabled: boolean
  tiers: RequestTier[]
  /** All-time watch time; null when Tautulli did not answer. */
  hours: number | null
  progress: TierProgress | null
  /** The quota the member's tier sets; null while the hours are unknown. */
  tierQuota: Quota | null
  /** The member's Overseerr user; null when there is none or Overseerr did not answer. */
  overseerr: OverseerrQuotaMember | null
  /** Why part of the check is missing, as copy for the admin. */
  problems: string[]
}

interface Evaluation {
  check: MemberTierCheck
  /** The write {@link applyMemberTier} makes; set only while `out-of-sync`. */
  write: { config: OverseerrEndpoint; overseerrUserId: number; quota: Quota } | null
}

const NO_OVERSEERR_USER = "Overseerr has no user for this member's Plex account. One appears when they sign in to Overseerr."

async function findMember(config: OverseerrEndpoint, plexUserId: string, signal: AbortSignal) {
  const index = await buildOverseerrUserIndex(config, { signal })
  if (!index.ok) return index
  const overseerrUserId = findOverseerrUserId(index.data, plexUserId)
  return overseerrUserId === null ? { ok: true as const, data: null } : getOverseerrQuotaMember(config, overseerrUserId, { signal })
}

function statusOf(excluded: boolean, member: OverseerrQuotaMember | null, tierQuota: Quota | null): MemberTierStatus {
  if (excluded) return "excluded"
  if (member?.bypassesQuota) return "bypass"
  if (!member || !tierQuota) return "unknown"
  return sameQuota(member, tierQuota) ? "in-sync" : "out-of-sync"
}

/** Null when the member is gone or has no Plex account the sync could match. */
async function evaluate(userId: string): Promise<Evaluation | null> {
  const [user, config, tautulli, overseerr] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { plexUserId: true, requestTiersExcluded: true } }),
    prisma.config.findUnique({ where: { id: "config" }, select: { requestTiersEnabled: true, requestTiers: true } }),
    getActiveService("tautulli"),
    getActiveService("overseerr"),
  ])
  const plexUserId = user?.plexUserId
  if (!user || !plexUserId || !/^\d+$/.test(plexUserId) || !Number.isSafeInteger(Number(plexUserId))) return null

  const tiers = [...tiersFromConfig(config?.requestTiers)]
  const base = { enabled: config?.requestTiersEnabled ?? false, tiers }
  if (!tautulli || !overseerr) {
    const check = { ...base, status: "not-connected" as const, hours: null, progress: null, tierQuota: null, overseerr: null, problems: [] }
    return { check, write: null }
  }

  const signal = AbortSignal.timeout(CHECK_TIMEOUT_MS)
  const [watch, found] = await Promise.all([
    getAllTimeWatchHours(tautulli, Number(plexUserId), { signal }),
    findMember(overseerr, plexUserId, signal),
  ])
  const problems: string[] = []
  if (!watch.ok) problems.push(serviceErrorMessage("Tautulli", watch))
  if (!found.ok) problems.push(serviceErrorMessage("Overseerr", found))
  else if (!found.data) problems.push(NO_OVERSEERR_USER)

  const hours = watch.ok ? watch.data : null
  const progress = hours === null ? null : tierProgress(hours, tiers)
  const tierQuota = progress ? quotaForTier(progress.tier) : null
  const member = found.ok ? found.data : null
  const status = statusOf(user.requestTiersExcluded, member, tierQuota)
  const check = { ...base, status, hours, progress, tierQuota, overseerr: member, problems }
  const write = status === "out-of-sync" && member && tierQuota ? { config: overseerr, overseerrUserId: member.id, quota: tierQuota } : null
  return { check, write }
}

/** The member's tier and Overseerr quota now, or null when they have no Plex account to match. */
export async function checkMemberTier(userId: string): Promise<MemberTierCheck | null> {
  return (await evaluate(userId))?.check ?? null
}

export type ApplyMemberTierResult =
  | { ok: true; quota: Quota | null }
  | { ok: false; code: "NOT_FOUND" | "CONFLICT" | "UPSTREAM_UNAVAILABLE"; message: string }

const REFUSED: Partial<Record<MemberTierStatus, string>> = {
  excluded: "This member's request limits are set by hand",
  bypass: "Overseerr applies no request limits to its admins and user managers",
  "not-connected": "Request limits need an active Tautulli and Overseerr server",
}

/**
 * Writes the member's tier quota to Overseerr when it differs, as the daily
 * sync would, whether or not the sync is on. `quota` is null when Overseerr
 * already had it.
 */
export async function applyMemberTier(userId: string): Promise<ApplyMemberTierResult> {
  const evaluation = await evaluate(userId)
  if (!evaluation) return { ok: false, code: "NOT_FOUND", message: "This member has no Plex account to match" }
  const { check, write } = evaluation
  if (check.status === "in-sync") return { ok: true, quota: null }
  const refused = REFUSED[check.status]
  if (refused) return { ok: false, code: "CONFLICT", message: refused }
  if (!write) return { ok: false, code: "UPSTREAM_UNAVAILABLE", message: check.problems[0] ?? "Overseerr did not answer" }

  const result = await setOverseerrUserQuota(write.config, write.overseerrUserId, write.quota, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
  if (!result.ok) return { ok: false, code: "UPSTREAM_UNAVAILABLE", message: serviceErrorMessage("Overseerr", result) }
  return { ok: true, quota: write.quota }
}
