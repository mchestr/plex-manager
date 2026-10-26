import { RequestLimitsCard } from "@/components/dashboard/request-limits-card"
import { getMemberRequestLimits } from "@/lib/request-tiers/member-limits"

/** Home's request-limits card, read on the server in its own boundary so a slow Overseerr never holds up home. */
export async function RequestLimits({ userId }: { userId: string }) {
  const limits = await getMemberRequestLimits(userId)
  return limits ? <RequestLimitsCard limits={limits} /> : null
}
