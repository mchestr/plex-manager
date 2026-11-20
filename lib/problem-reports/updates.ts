/**
 * Telling people a report changed: a DM to each member who made or follows
 * a report when it is fixed or closed (`PROBLEM_REPORT_UPDATE`, one job per
 * member and change, told apart by when it ended), and the admins' alert
 * when a fix hands a report back to them (`PROBLEM_REPORT_NOTIFY`).
 *
 * Request paths queue through `enqueueFromRequest`; the fix job, which runs
 * in a worker, through `addJob`. Neither ever throws: the report has changed
 * already, and a lost DM is only a lost DM.
 *
 * @module lib/problem-reports/updates
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { addJob } from "@/lib/queue/client"
import { isRedisConfigured } from "@/lib/queue/connection"
import { enqueueFromRequest } from "@/lib/queue/request-path"
import { JOB_TYPES } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("PROBLEM_REPORT_UPDATES")

/** Three attempts, the second a minute after the first, as for the admins' alert. */
const UPDATE_JOB_OPTIONS = { attempts: 3, backoff: { type: "exponential", delay: 60_000 } }

/** When the report ended, and the members to tell: the reporter and every follower, once each, without `except`. */
async function membersOf(reportId: string, except: string | undefined): Promise<{ resolvedAt: Date; members: string[] } | null> {
  const report = await prisma.problemReport.findUnique({
    where: { id: reportId },
    select: { reporterId: true, resolvedAt: true, events: { where: { kind: "ALSO_REPORTED", actorUserId: { not: null } }, select: { actorUserId: true } } },
  })
  // A report that opened again before its DMs were queued has nothing to tell
  if (!report?.resolvedAt) return null
  const members = new Set([report.reporterId, ...report.events.flatMap((event) => (event.actorUserId ? [event.actorUserId] : []))])
  if (except) members.delete(except)
  return { resolvedAt: report.resolvedAt, members: [...members] }
}

/**
 * Queues a DM for each member who made or follows the report.
 *
 * @param options.except - Who changed it, when they need no DM (a member who cancelled)
 * @param options.from - `worker` in a job, `request` in an action
 */
export async function queueMemberUpdates(
  reportId: string,
  status: "FIXED" | "CLOSED",
  options: { except?: string; from: "request" | "worker" }
): Promise<void> {
  if (!isRedisConfigured()) return
  try {
    const told = await membersOf(reportId, options.except)
    if (!told) return
    for (const userId of told.members) {
      const data = { reportId, userId, status, resolvedAt: told.resolvedAt.toISOString() }
      if (options.from === "worker") await addJob(JOB_TYPES.PROBLEM_REPORT_UPDATE, data, UPDATE_JOB_OPTIONS)
      else if (!(await enqueueFromRequest(JOB_TYPES.PROBLEM_REPORT_UPDATE, data, UPDATE_JOB_OPTIONS)).ok) logger.warn("Could not queue a problem report update", { reportId })
    }
  } catch (error) {
    logger.error("Could not queue the problem report updates", error, { reportId })
  }
}

/** Queues the admins' alert from the fix job, for a report a fix handed back to them. */
export async function queueAdminAlertFromWorker(reportId: string): Promise<void> {
  if (!isRedisConfigured()) return
  try {
    await addJob(JOB_TYPES.PROBLEM_REPORT_NOTIFY, { reportId }, UPDATE_JOB_OPTIONS)
  } catch (error) {
    logger.error("Could not queue the problem report alert", error, { reportId })
  }
}
