import "server-only"

import { Queue } from "bullmq"
import { unstable_cache } from "next/cache"

import type { NavCounts } from "@/lib/admin/nav"
import { CLEANUP_SETTINGS_ID, isLive, today } from "@/lib/cleanup/settings"
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
 * Media cleanup items that wait for an admin (TS 12.3 item 3): those held by
 * the entry check, and those due in a Review first deletion batch (leave date
 * today or earlier, in the server zone). Zero while the feature is off or
 * paused, because no batch can then be approved.
 */
async function cleanupReviewCount(): Promise<number> {
  const settings = await prisma.cleanupSettings.findUnique({ where: { id: CLEANUP_SETTINGS_ID }, select: { enabled: true, pausedAt: true } })
  if (!settings || !isLive(settings)) return 0
  const day = await today()
  return prisma.cleanupItem.count({ where: { OR: [{ state: "held" }, { state: "leaving", needsApproval: true, leaveOn: { lte: day } }] } })
}

/**
 * The admin sidebar's badges: members, affiliate applications waiting for a
 * decision, failed jobs, and the media cleanup items to review. Cached for 30
 * seconds under `admin-nav-counts`, so every admin page render does not count
 * again.
 */
export const getAdminNavCounts = unstable_cache(
  async (): Promise<NavCounts> => {
    const [users, pendingAffiliates, failed, cleanupReview] = await Promise.all([
      prisma.user.count(),
      prisma.affiliateApplication.count({ where: { status: "PENDING" } }),
      failedJobs(),
      cleanupReviewCount(),
    ])
    return { users, pendingAffiliates, failedJobs: failed, cleanupReview }
  },
  [ADMIN_NAV_COUNTS_TAG],
  { tags: [ADMIN_NAV_COUNTS_TAG], revalidate: 30 }
)
