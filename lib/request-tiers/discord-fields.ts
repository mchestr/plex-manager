/**
 * The request-limit fields of the `/mystats` embed: the member's tier, the
 * requests they have left, and the watch time to the next tier.
 *
 * @module lib/request-tiers/discord-fields
 */

import type { QuotaUsage } from "@/lib/connections/overseerr-quota"
import type { MemberRequestLimits } from "@/lib/request-tiers/member-limits"
import { limitCopy } from "@/lib/request-tiers/tiers"

export interface EmbedField {
  name: string
  value: string
  inline?: boolean
}

const left = (usage: QuotaUsage) => (usage.remaining === null ? "unlimited" : `${usage.remaining} of ${usage.limit} left`)

export function requestLimitFields(limits: MemberRequestLimits): EmbedField[] {
  const fields: EmbedField[] = []
  const { progress, usage } = limits

  if (!limits.excluded && progress) {
    fields.push({
      name: `🎟️ Request tier ${progress.index + 1}`,
      value: `${limitCopy(progress.tier.movieLimit, "movies")} and ${limitCopy(progress.tier.tvLimit, "shows")} every ${progress.tier.days} days`,
    })
  }
  if (usage) {
    fields.push({ name: "📥 Requests left", value: `Movies: ${left(usage.movie)}\nShows: ${left(usage.tv)}`, inline: true })
  }
  if (!limits.excluded && progress?.next && progress.hoursToNext !== null) {
    const hours = Math.ceil(progress.hoursToNext)
    fields.push({
      name: "⬆️ Next tier",
      value: `${hours} more ${hours === 1 ? "hour" : "hours"} for tier ${progress.index + 2} (${limitCopy(progress.next.movieLimit, "movies")}, ${limitCopy(progress.next.tvLimit, "shows")})`,
      inline: true,
    })
  }
  return fields
}
