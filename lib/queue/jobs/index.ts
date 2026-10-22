/**
 * Job Registry
 *
 * Central registry for all job handlers.
 * Add new job handlers here as the system grows.
 */

import { Job } from "bullmq"
import { JobType, JOB_TYPES } from "../types"
import { getWatchlistProcessor } from "./watchlist-sync"
import { getStripeProcessor } from "./stripe"
import { getDiscordRoleProcessor } from "./discord-role"

/**
 * Job processor function type
 */
export type JobProcessor = (job: Job, token?: string) => Promise<unknown>

/**
 * Get the processor function for a given job type
 *
 * @param jobType - The job type to get a processor for
 * @returns The processor function, or null if not found
 */
export function getJobProcessor(jobType: string): JobProcessor | null {
  // Check watchlist processors
  const watchlistProcessor = getWatchlistProcessor(jobType)
  if (watchlistProcessor) {
    return watchlistProcessor
  }

  // Check Stripe processors
  const stripeProcessor = getStripeProcessor(jobType)
  if (stripeProcessor) {
    return stripeProcessor
  }

  // Check Discord role processors
  const discordRoleProcessor = getDiscordRoleProcessor(jobType)
  if (discordRoleProcessor) {
    return discordRoleProcessor
  }

  // Add more processor lookups here as new job types are added
  // Example:
  // const emailProcessor = getEmailProcessor(jobType)
  // if (emailProcessor) return emailProcessor

  return null
}

/**
 * Get all registered job types
 * Used for worker initialization and admin UI
 */
export function getRegisteredJobTypes(): JobType[] {
  return Object.values(JOB_TYPES)
}

/**
 * Check if a job type is registered
 * @internal
 */
export function isRegisteredJobType(jobType: string): jobType is JobType {
  return Object.values(JOB_TYPES).includes(jobType as JobType)
}
