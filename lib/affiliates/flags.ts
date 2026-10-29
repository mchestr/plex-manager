/**
 * The flags the admin Affiliates tables show beside an applicant or an
 * affiliate: facts worth a second look before a decision. A flag decides
 * nothing. Pure, so the tables and their tests share it.
 *
 * | Flag | When |
 * |---|---|
 * | `new_member` | the account was made less than 60 days ago |
 * | `invited` | they joined through an affiliate invite |
 * | `recent_hours` | more than half of their all-time hours are from the last 30 days |
 * | `shared_email` | their Plex email matches another row (`plexEmailShared`, set when they apply) |
 * | `tier_raised` | they moved up a tier in the last 30 days |
 *
 * @module lib/affiliates/flags
 */

export type AffiliateFlag = "new_member" | "invited" | "recent_hours" | "shared_email" | "tier_raised"

const DAY_MS = 24 * 60 * 60 * 1000

export interface FlagFacts {
  memberSince: Date
  invited: boolean
  watchHours: number | null
  watchHoursLast30Days: number | null
  plexEmailShared: boolean
  tierRaisedAt: Date | null
}

/** The flags for one member at `now`, in the table's order. */
export function affiliateFlags(facts: FlagFacts, now: Date): AffiliateFlag[] {
  const flags: AffiliateFlag[] = []
  if (now.getTime() - facts.memberSince.getTime() < 60 * DAY_MS) flags.push("new_member")
  if (facts.invited) flags.push("invited")
  if (facts.watchHours && facts.watchHoursLast30Days !== null && facts.watchHoursLast30Days > facts.watchHours / 2) {
    flags.push("recent_hours")
  }
  if (facts.plexEmailShared) flags.push("shared_email")
  if (facts.tierRaisedAt && now.getTime() - facts.tierRaisedAt.getTime() < 30 * DAY_MS) flags.push("tier_raised")
  return flags
}
