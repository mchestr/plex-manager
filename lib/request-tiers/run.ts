/**
 * The request-tier sync: sets every member's Overseerr request quota from
 * their all-time Tautulli watch time. It replaces the Windmill flow
 * `sync_overseerr_quotas_from_tautulli_watchtime`.
 *
 * ## Steps
 *
 * 1. Read every Tautulli user and every Overseerr user (all pages).
 * 2. Pair them by plex.tv account id ({@link matchUsers}); skip Overseerr users
 *    without a Plex id and members an admin excluded.
 * 3. Per member: read the all-time hours, pick the tier, and compare the tier's
 *    quota with the one Overseerr has. Overseerr is written only when it differs.
 * 4. One member failing never stops the others.
 * 5. Store the run (`RequestTierRun`) and keep the newest {@link KEPT_RUNS}.
 *
 * @module lib/request-tiers/run
 */

import { getActiveService } from "@/lib/data/active-service"
import { listOverseerrQuotaUsers, setOverseerrUserQuota } from "@/lib/connections/overseerr-quota"
import { getAllTimeWatchHours, listTautulliUserIds } from "@/lib/connections/tautulli-watch-time"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { summaryLine, type RequestTierEntry } from "@/lib/request-tiers/entries"
import { matchUsers, type MatchedUser } from "@/lib/request-tiers/match"
import { quotaForTier, sameQuota } from "@/lib/request-tiers/quota"
import { tierIndexFor, tiersFromConfig, type RequestTier } from "@/lib/request-tiers/tiers"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("REQUEST_TIERS")

/** Runs kept for the admin page. */
const KEPT_RUNS = 30
/** Members handled at once, so a big server does not flood Tautulli or Overseerr. */
const CONCURRENCY = 5

export type RequestTierTrigger = "scheduled" | "admin"

export interface RequestTierRunResult {
  runId: string
  updated: number
  unchanged: number
  failed: number
  skipped: number
  /** Why nothing ran, such as a missing Tautulli or Overseerr. */
  error?: string
}

async function syncMember(
  match: MatchedUser,
  tiers: readonly RequestTier[],
  tautulli: { url: string; apiKey: string },
  overseerr: { url: string; apiKey: string },
  signal?: AbortSignal
): Promise<RequestTierEntry> {
  const { overseerr: user } = match
  const base = { overseerrUserId: user.id, name: user.name, oldQuota: pickQuota(user) }
  if (match.excluded) return { ...base, hours: null, tier: null, status: "excluded", newQuota: null }

  const watch = await getAllTimeWatchHours(tautulli, match.tautulliUserId, { signal })
  if (!watch.ok) return { ...base, hours: null, tier: null, status: "failed", newQuota: null }

  const index = tierIndexFor(watch.data, tiers)
  const newQuota = quotaForTier(tiers[index]!)
  const entry = { ...base, hours: watch.data, tier: index + 1, newQuota }
  if (sameQuota(user, newQuota)) return { ...entry, status: "unchanged" }

  const write = await setOverseerrUserQuota(overseerr, user.id, newQuota, { signal })
  return { ...entry, status: write.ok ? "updated" : "failed" }
}

function pickQuota(user: MatchedUser["overseerr"]) {
  return {
    movieQuotaLimit: user.movieQuotaLimit,
    movieQuotaDays: user.movieQuotaDays,
    tvQuotaLimit: user.tvQuotaLimit,
    tvQuotaDays: user.tvQuotaDays,
  }
}

async function record(trigger: RequestTierTrigger, startedAt: Date, entries: RequestTierEntry[], error?: string) {
  const count = (status: RequestTierEntry["status"]) => entries.filter((entry) => entry.status === status).length
  const run = await prisma.requestTierRun.create({
    data: {
      trigger,
      startedAt,
      finishedAt: new Date(),
      updated: count("updated"),
      unchanged: count("unchanged"),
      failed: count("failed"),
      skipped: count("excluded"),
      entries: entries as unknown as Prisma.InputJsonValue,
      error,
    },
  })
  const old = await prisma.requestTierRun.findMany({ orderBy: { startedAt: "desc" }, skip: KEPT_RUNS, select: { id: true } })
  if (old.length > 0) await prisma.requestTierRun.deleteMany({ where: { id: { in: old.map((row) => row.id) } } })
  return { runId: run.id, updated: run.updated, unchanged: run.unchanged, failed: run.failed, skipped: run.skipped, error }
}

/**
 * Runs the sync once and stores the result. A scheduled run does nothing while
 * the sync is off; an admin's "Run now" runs either way. Throws only on a
 * database error.
 */
export async function runRequestTierSync(
  trigger: RequestTierTrigger,
  { signal }: { signal?: AbortSignal } = {}
): Promise<RequestTierRunResult | null> {
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { requestTiersEnabled: true, requestTiers: true },
  })
  if (trigger === "scheduled" && !config?.requestTiersEnabled) return null

  const startedAt = new Date()
  const [tautulli, overseerr] = await Promise.all([getActiveService("tautulli"), getActiveService("overseerr")])
  if (!tautulli || !overseerr) return record(trigger, startedAt, [], "Tautulli and Overseerr must both be connected")

  const [tautulliIds, overseerrUsers, excluded] = await Promise.all([
    listTautulliUserIds(tautulli, { signal }),
    listOverseerrQuotaUsers(overseerr, { signal }),
    prisma.user.findMany({ where: { requestTiersExcluded: true, plexUserId: { not: null } }, select: { plexUserId: true } }),
  ])
  if (!tautulliIds.ok) return record(trigger, startedAt, [], "Tautulli did not answer")
  if (!overseerrUsers.ok) return record(trigger, startedAt, [], "Overseerr did not answer")

  const excludedIds = new Set(excluded.flatMap((user) => (user.plexUserId && /^\d+$/.test(user.plexUserId) ? [Number(user.plexUserId)] : [])))
  const { matched, withoutPlexId, withoutTautulli } = matchUsers(overseerrUsers.data, tautulliIds.data, excludedIds)
  const tiers = tiersFromConfig(config?.requestTiers)

  const entries: RequestTierEntry[] = []
  for (let i = 0; i < matched.length; i += CONCURRENCY) {
    const batch = matched.slice(i, i + CONCURRENCY)
    entries.push(...(await Promise.all(batch.map((match) => syncMember(match, tiers, tautulli, overseerr, signal)))))
    if (signal?.aborted) break
  }

  for (const entry of entries) logger.debug(summaryLine(entry))
  logger.info("request-tiers.synced", { matched: matched.length, withoutPlexId, withoutTautulli })
  return record(trigger, startedAt, entries)
}
