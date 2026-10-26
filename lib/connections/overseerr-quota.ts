/**
 * Overseerr request quotas: every user's quota for the tier sync, one user's
 * write, and one user's usage in the current period.
 *
 * @module lib/connections/overseerr-quota
 */

import { z } from "zod"

import type { ServiceErrorCode, ServiceResult } from "@/lib/connections/http"
import { overseerrFetch, userPagePath, type OverseerrEndpoint } from "@/lib/connections/overseerr"
import type { OverseerrQuotaUser } from "@/lib/request-tiers/match"
import type { Quota } from "@/lib/request-tiers/quota"

const MAX_USER_PAGES = 100

const quotaField = z.number().int().nullish().transform((value) => value ?? null)

const quotaUserPageSchema = z.object({
  pageInfo: z.looseObject({ page: z.number(), pages: z.number() }),
  results: z.array(
    z.looseObject({
      id: z.number().int(),
      plexId: z.number().int().nullish(),
      displayName: z.string().nullish(),
      username: z.string().nullish(),
      plexUsername: z.string().nullish(),
      movieQuotaLimit: quotaField,
      movieQuotaDays: quotaField,
      tvQuotaLimit: quotaField,
      tvQuotaDays: quotaField,
    })
  ),
})

/**
 * Every Overseerr user with the quota they have now, paged 100 at a time.
 * Reaching the page cap is a failure, never a partial list, so the sync does
 * not treat a member past the cap as missing.
 */
export async function listOverseerrQuotaUsers(
  config: OverseerrEndpoint,
  { signal }: { signal?: AbortSignal } = {}
): Promise<ServiceResult<OverseerrQuotaUser[], "PAGE_LIMIT" | ServiceErrorCode>> {
  const users: OverseerrQuotaUser[] = []
  for (let page = 0; page < MAX_USER_PAGES; page++) {
    const result = await overseerrFetch(config, userPagePath(page), quotaUserPageSchema, { signal })
    if (!result.ok) return result
    for (const user of result.data.results) {
      users.push({
        id: user.id,
        plexId: user.plexId ?? null,
        name: user.displayName || user.plexUsername || user.username || `User ${user.id}`,
        movieQuotaLimit: user.movieQuotaLimit,
        movieQuotaDays: user.movieQuotaDays,
        tvQuotaLimit: user.tvQuotaLimit,
        tvQuotaDays: user.tvQuotaDays,
      })
    }
    if (result.data.results.length === 0 || result.data.pageInfo.page >= result.data.pageInfo.pages) {
      return { ok: true, data: users }
    }
  }
  return { ok: false, code: "PAGE_LIMIT" }
}

/** Writes a user's request quota. Overseerr is called only when the caller found a change. */
export function setOverseerrUserQuota(
  config: OverseerrEndpoint,
  overseerrUserId: number,
  quota: Quota,
  { signal }: { signal?: AbortSignal } = {}
): Promise<ServiceResult<unknown>> {
  return overseerrFetch(config, `/user/${overseerrUserId}/settings/main`, z.unknown(), {
    method: "POST",
    body: JSON.stringify(quota),
    signal,
  })
}

const usageSchema = z.looseObject({
  days: z.number().nullish(),
  limit: z.number().nullish(),
  used: z.number().nullish(),
  remaining: z.number().nullish(),
  restricted: z.boolean().nullish(),
})

const quotaUsageSchema = z.looseObject({ movie: usageSchema.nullish(), tv: usageSchema.nullish() })

export interface QuotaUsage {
  /** Requests per period; 0 is unlimited. */
  limit: number
  days: number
  used: number
  /** Requests left in this period; null when unlimited. */
  remaining: number | null
}

export interface OverseerrUserUsage {
  movie: QuotaUsage
  tv: QuotaUsage
}

function toUsage(raw: z.infer<typeof usageSchema> | null | undefined): QuotaUsage {
  const limit = raw?.limit ?? 0
  return {
    limit,
    days: raw?.days ?? 0,
    used: raw?.used ?? 0,
    remaining: limit > 0 ? Math.max(0, raw?.remaining ?? limit - (raw?.used ?? 0)) : null,
  }
}

/** `GET /user/{id}/quota`: the requests used and left in the current period. */
export async function getOverseerrUserUsage(
  config: OverseerrEndpoint,
  overseerrUserId: number,
  { signal }: { signal?: AbortSignal } = {}
): Promise<ServiceResult<OverseerrUserUsage>> {
  const result = await overseerrFetch(config, `/user/${overseerrUserId}/quota`, quotaUsageSchema, { signal })
  if (!result.ok) return result
  return { ok: true, data: { movie: toUsage(result.data.movie), tv: toUsage(result.data.tv) } }
}
