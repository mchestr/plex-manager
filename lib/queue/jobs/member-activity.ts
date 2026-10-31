/**
 * The member activity job (`MEMBER_ACTIVITY`): last seen from Tautulli, then
 * the inactivity sweep (`lib/inactivity/run.ts`). Scheduled daily at boot
 * (`lib/inactivity/schedule.ts`) and queued by an admin's "Run now".
 *
 * A scheduled run acts as `SYSTEM_ACTOR`. An admin run acts as that admin,
 * with the members they confirmed, only while the confirmation is still
 * theirs to give:
 *
 * | Case                                                        | Actor          | Confirmation |
 * |-------------------------------------------------------------|----------------|--------------|
 * | First attempt, queued less than 15 minutes ago, by an admin | the admin      | kept         |
 * | Run before (a retry), or queued 15 minutes ago or more      | the admin      | dropped      |
 * | The user is gone or no longer an admin                      | `SYSTEM_ACTOR` | dropped      |
 *
 * Without a confirmation, an admin run with members to remove removes no one
 * (`not_confirmed`). The run stops between removals when the server shuts
 * down. The result holds counts, ids and codes only.
 *
 * @module lib/queue/jobs/member-activity
 */

import type { Job } from "bullmq"

import { runMemberActivity } from "@/lib/inactivity/run"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { prisma } from "@/lib/prisma"
import { SYSTEM_ACTOR } from "@/lib/session-revocation"
import { createLogger } from "@/lib/utils/logger"

import { JOB_TYPES, type JobPayloadMap } from "../types"

const logger = createLogger("MEMBER_ACTIVITY_JOB")

/** How long an admin's confirmation holds: a job that waited longer runs without it. @internal */
export const CONFIRMATION_TTL_MS = 15 * 60 * 1000

type MemberActivityJob = Pick<Job<JobPayloadMap[typeof JOB_TYPES.MEMBER_ACTIVITY]>, "data" | "attemptsMade" | "timestamp">

/** The user who queued the run, while they are still an admin. */
async function stillAdmin(userId: string | undefined): Promise<string | null> {
  if (!userId) return null
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } })
  return user?.isAdmin ? userId : null
}

/** An admin run's actor and confirmation, as far as they still hold. */
async function adminRun({ data, attemptsMade, timestamp }: MemberActivityJob) {
  const admin = await stillAdmin(data.triggeredByUserId)
  const ageMs = Date.now() - timestamp
  const confirmed = admin !== null && attemptsMade === 0 && ageMs < CONFIRMATION_TTL_MS
  if (data.confirmedUserIds && !confirmed) {
    logger.warn("inactivity.confirmation_dropped", { stillAdmin: admin !== null, attemptsMade, ageMs })
  }
  return { actorId: admin ?? SYSTEM_ACTOR, confirmedUserIds: confirmed ? data.confirmedUserIds : undefined }
}

async function processMemberActivity(job: MemberActivityJob) {
  const result =
    job.data.triggeredBy === "admin"
      ? await runMemberActivity("admin", { ...(await adminRun(job)), signal: shutdownSignal })
      : await runMemberActivity("scheduled", { actorId: SYSTEM_ACTOR, signal: shutdownSignal })
  return result ?? { skipped: true }
}

/** The processor for the member activity job type, or null. */
export function getMemberActivityProcessor(jobType: string): ((job: MemberActivityJob) => Promise<unknown>) | null {
  return jobType === JOB_TYPES.MEMBER_ACTIVITY ? processMemberActivity : null
}
