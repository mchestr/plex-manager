/**
 * An Overseerr user's request quota, as `POST /user/{id}/settings/main` takes
 * it, and the rules for telling whether a write would change anything.
 *
 * @module lib/request-tiers/quota
 */

import type { RequestTier } from "@/lib/request-tiers/tiers"

export interface Quota {
  movieQuotaLimit: number | null
  movieQuotaDays: number | null
  tvQuotaLimit: number | null
  tvQuotaDays: number | null
}

/** The quota a tier sets. */
export function quotaForTier(tier: RequestTier): Quota {
  return { movieQuotaLimit: tier.movieLimit, movieQuotaDays: tier.days, tvQuotaLimit: tier.tvLimit, tvQuotaDays: tier.days }
}

/** A limit of 0 or none is unlimited, and then the period does not matter. */
function side(limit: number | null, days: number | null): string {
  return limit ? `${limit}/${days ?? 0}` : "unlimited"
}

/** True when two quotas allow the same requests, so Overseerr needs no write. */
export function sameQuota(a: Quota, b: Quota): boolean {
  return (
    side(a.movieQuotaLimit, a.movieQuotaDays) === side(b.movieQuotaLimit, b.movieQuotaDays) &&
    side(a.tvQuotaLimit, a.tvQuotaDays) === side(b.tvQuotaLimit, b.tvQuotaDays)
  )
}

/** "4 movies, 2 TV/week", the figures of the run summary. */
export function quotaCopy(quota: Quota): string {
  const part = (limit: number | null, days: number | null, noun: string) =>
    limit ? `${limit} ${noun}${days === 7 ? "/week" : `/${days ?? 0}d`}` : `unlimited ${noun}`
  return `${part(quota.movieQuotaLimit, quota.movieQuotaDays, "movies")}, ${part(quota.tvQuotaLimit, quota.tvQuotaDays, "TV")}`
}
