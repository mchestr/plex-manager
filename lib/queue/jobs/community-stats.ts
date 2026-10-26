/**
 * The two jobs that replaced Windmill flows: the Discord stat channels
 * (`DISCORD_CHANNEL_STATS`, every few minutes) and the request-limit tiers
 * (`REQUEST_TIER_SYNC`, daily). Both are scheduled by the settings save and at
 * boot (`lib/discord/channel-stats/schedule.ts`, `lib/request-tiers/schedule.ts`).
 *
 * @module lib/queue/jobs/community-stats
 */

import type { Job } from "bullmq"

import { runChannelStats } from "@/lib/discord/channel-stats/run"
import { runRequestTierSync } from "@/lib/request-tiers/run"

import { JOB_TYPES } from "../types"

/** The processor for the stat-channel and request-tier job types, or null. */
export function getCommunityStatsProcessor(jobType: string): ((job: Job) => Promise<unknown>) | null {
  switch (jobType) {
    case JOB_TYPES.DISCORD_CHANNEL_STATS:
      return (job) => runChannelStats(job.data.triggeredBy === "admin" ? "admin" : "scheduled")
    case JOB_TYPES.REQUEST_TIER_SYNC:
      return (job) => runRequestTierSync(job.data.triggeredBy === "admin" ? "admin" : "scheduled")
    default:
      return null
  }
}
