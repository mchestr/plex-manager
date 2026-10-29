import "server-only"

import { Queue } from "bullmq"
import { unstable_cache } from "next/cache"

import { inviteStatusWhere } from "@/lib/admin/invites/queries"
import type { NavCounts } from "@/lib/admin/nav"
import { onShutdown } from "@/lib/instrumentation/shutdown"
import { prisma } from "@/lib/prisma"
import { QUEUE_NAME } from "@/lib/queue/client"
import { getRequestPathRedis, isRedisConfigured, readyWithin } from "@/lib/queue/connection"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("admin-nav-counts")

const ADMIN_NAV_COUNTS_TAG = "admin-nav-counts"

const REDIS_WAIT_MS = 2000

let failedJobsQueue: Queue | null = null

/** A read-only handle on the job queue over the fail-fast request-path client. */
function queue(): Queue {
  if (!failedJobsQueue) {
    const created = new Queue(QUEUE_NAME, { connection: getRequestPathRedis() })
    onShutdown("admin-nav-counts-queue", "close", () => created.close())
    failedJobsQueue = created
  }
  return failedJobsQueue
}

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

/** Failed jobs in the job queue, or `null` when Redis is unset or does not answer within 2s. */
async function failedJobs(): Promise<number | null> {
  if (!isRedisConfigured()) return null
  try {
    if (!(await readyWithin(getRequestPathRedis(), REDIS_WAIT_MS))) return null
    return await within(queue().getFailedCount(), REDIS_WAIT_MS)
  } catch (error) {
    logger.warn("Failed-job count unavailable", { error: String(error) })
    return null
  }
}

/**
 * The admin sidebar's badges: members, invites that can still be redeemed,
 * affiliate applications waiting for a decision, and failed jobs. Cached for 30 seconds under `admin-nav-counts`, so every
 * admin page render does not count again.
 */
export const getAdminNavCounts = unstable_cache(
  async (): Promise<NavCounts> => {
    const now = new Date()
    const [users, activeInvites, pendingAffiliates, failed] = await Promise.all([
      prisma.user.count(),
      prisma.invite.count({ where: inviteStatusWhere("active", now) }),
      prisma.affiliateApplication.count({ where: { status: "PENDING" } }),
      failedJobs(),
    ])
    return { users, activeInvites, pendingAffiliates, failedJobs: failed }
  },
  [ADMIN_NAV_COUNTS_TAG],
  { tags: [ADMIN_NAV_COUNTS_TAG], revalidate: 30 }
)
