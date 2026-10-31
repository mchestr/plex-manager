/**
 * The member activity job (`MEMBER_ACTIVITY`): last seen from Tautulli, then
 * the inactivity sweep (`lib/inactivity/run.ts`). Scheduled daily at boot
 * (`lib/inactivity/schedule.ts`) and queued by an admin's "Run now".
 *
 * A scheduled run acts as `SYSTEM_ACTOR`; an admin run as that admin, with
 * the member count they confirmed. The run stops between removals when the
 * server shuts down. The result holds counts, ids and codes only.
 *
 * @module lib/queue/jobs/member-activity
 */

import { runMemberActivity } from "@/lib/inactivity/run"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { SYSTEM_ACTOR } from "@/lib/session-revocation"

import { JOB_TYPES, type JobPayloadMap } from "../types"

type MemberActivityJob = { data: JobPayloadMap[typeof JOB_TYPES.MEMBER_ACTIVITY] }

async function processMemberActivity({ data }: MemberActivityJob) {
  const admin = data.triggeredBy === "admin"
  const result = await runMemberActivity(admin ? "admin" : "scheduled", {
    actorId: admin ? (data.triggeredByUserId ?? SYSTEM_ACTOR) : SYSTEM_ACTOR,
    confirmedRemovals: admin ? data.confirmedRemovals : undefined,
    signal: shutdownSignal,
  })
  return result ?? { skipped: true }
}

/** The processor for the member activity job type, or null. */
export function getMemberActivityProcessor(jobType: string): ((job: MemberActivityJob) => Promise<unknown>) | null {
  return jobType === JOB_TYPES.MEMBER_ACTIVITY ? processMemberActivity : null
}
