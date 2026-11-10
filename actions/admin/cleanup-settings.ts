"use server"

/**
 * The media cleanup switch, settings, pause and resume, and the jobs that an
 * admin starts by hand (TS 10.2, 10.3, 8.12, 9.5): `updateCleanupSettings`,
 * `pauseCleanup`, `resumeCleanup`, `runCleanupNow`, `refreshCleanupData` and
 * `startCleanupFirstRead`. Each is admin only. The writes spend the
 * per-admin `admin:cleanup` limit, the job starts the `admin` limit. The
 * steps live in `lib/cleanup/actions/settings/`.
 *
 * @module actions/admin/cleanup-settings
 */

import { revalidatePath } from "next/cache"

import { adminAction } from "@/lib/actions/define-action"
import { type ActionFailure, fail, ok } from "@/lib/actions/result"
import { cleanup } from "@/lib/admin/routes"
import { type StartRefusal, startAdminJob, startFirstRead } from "@/lib/cleanup/actions/settings/enqueue"
import { pauseAll, resumeAll } from "@/lib/cleanup/actions/settings/pause"
import { saveFeatureSection, saveOptionsSection } from "@/lib/cleanup/actions/settings/section"
import { SETTINGS_WORDS } from "@/lib/cleanup/actions/settings/words"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"
import { CLEANUP_CONFLICT_WORDS, CLEANUP_UPSTREAM_WORDS } from "@/lib/cleanup/constants"
import type {
  CleanupFirstReadResult,
  CleanupQueuedResult,
  PauseCleanupResult,
  ResumeCleanupResult,
  UpdateCleanupSettingsResult,
} from "@/lib/cleanup/types/actions"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { updateCleanupSettingsInput } from "@/lib/validations/cleanup-actions"

const LIMIT = { name: "admin:cleanup" } as const
const JOB_LIMIT = { name: "admin" } as const

/** The words of a refused job start (TS 9.5). */
function startFailure(code: StartRefusal): ActionFailure {
  if (code === "VALIDATION") return fail("VALIDATION", SETTINGS_WORDS.redis)
  if (code === "CONFLICT") return fail("CONFLICT", CLEANUP_CONFLICT_WORDS.run)
  return fail("UPSTREAM_UNAVAILABLE", CLEANUP_UPSTREAM_WORDS.queue)
}

/**
 * Save one section of the media cleanup settings. `cleanup-feature` turns
 * media cleanup on or off. On holds every deletion for 7 days: leave dates
 * before then move to that day. Off stops every run from changing anything,
 * and approved batches go back to waiting for approval. The other sections
 * (`cleanup-protections`, `cleanup-budget`, `cleanup-defaults`,
 * `cleanup-plex`, `cleanup-members`) replace their part of the options.
 * Titles that a new protection keeps safe leave Leaving soon at once.
 * `exitsApplied` is false while a run is in progress: they leave at its end.
 * Turning member Keeps off stops new Keeps only: every current Keep still
 * protects its title.
 */
export const updateCleanupSettings = adminAction<UpdateCleanupSettingsResult, typeof updateCleanupSettingsInput>({
  input: updateCleanupSettingsInput,
  rateLimit: LIMIT,
  fallbackError: "Could not save the settings. Try again.",
  handler: (input, { userId }) =>
    input.section === "cleanup-feature" ? saveFeatureSection(input.values.enabled, userId) : saveOptionsSection(input, userId),
})

/**
 * Pause all media cleanup at once. No run changes anything and nothing is
 * deleted until a resume. A deletion that has already started finishes.
 * Approved batches go back to waiting for approval (`unapproved` counts
 * them). The Leaving soon collections in Plex empty and members stop seeing
 * Leaving soon. Every Keep stays. Pausing while paused changes nothing.
 */
export const pauseCleanup = adminAction<PauseCleanupResult>({
  rateLimit: LIMIT,
  fallbackError: "Could not pause cleanup. Try again.",
  handler: async (_input, { userId }) => {
    const paused = await pauseAll(userId, new Date())
    if (paused.changed) {
      logAuditEvent(AuditEventType.CLEANUP_PAUSED, userId, { unapproved: paused.unapproved })
      await requestCollectionSync("pause")
    }
    revalidatePath(cleanup())
    return ok({ unapproved: paused.unapproved })
  },
})

/**
 * Resume media cleanup after a pause. Members see Leaving soon again.
 * Nothing is deleted before `holdUntil`, 7 days from today: titles due
 * earlier get that date, and every batch waits for a new approval. Refused
 * while a run is in progress. Resuming while not paused changes nothing.
 */
export const resumeCleanup = adminAction<ResumeCleanupResult>({
  rateLimit: LIMIT,
  fallbackError: "Could not resume cleanup. Try again.",
  handler: async (_input, { userId }) => {
    const resumed = await resumeAll(userId, new Date())
    if (resumed.status === "busy") return fail("CONFLICT", CLEANUP_CONFLICT_WORDS.run)
    if (resumed.status === "resumed") {
      logAuditEvent(AuditEventType.CLEANUP_RESUMED, userId, { holdUntil: resumed.holdUntil, moved: resumed.moved })
      await requestCollectionSync("resume")
    }
    revalidatePath(cleanup())
    return ok({ holdUntil: resumed.holdUntil })
  },
})

/**
 * Run every media cleanup rule now on the stored library data, without a
 * new library read. New matches join Leaving soon and rescues apply. It
 * never deletes: due titles wait for the nightly run or an approval. Needs
 * the job queue. Refused while a run is in progress or queued.
 */
export const runCleanupNow = adminAction<CleanupQueuedResult>({
  rateLimit: JOB_LIMIT,
  fallbackError: "Could not start the run. Try again.",
  handler: async (_input, { userId }) => {
    const started = await startAdminJob("run", userId)
    if (!started.ok) return startFailure(started.code)
    logAuditEvent(AuditEventType.CLEANUP_RUN_STARTED, userId, { kind: "run", queued: true })
    revalidatePath(cleanup())
    return ok({ queued: true as const })
  },
})

/**
 * Read the library data again now from Plex, Tautulli, Overseerr, Radarr
 * and Sonarr. It takes 1 to 3 minutes and changes no title. A read started
 * here that agrees with the services clears a "returned much less" safety
 * stop. Needs the job queue. Refused while a read is in progress or queued.
 */
export const refreshCleanupData = adminAction<CleanupQueuedResult>({
  rateLimit: JOB_LIMIT,
  fallbackError: "Could not start the library read. Try again.",
  handler: async (_input, { userId }) => {
    const started = await startAdminJob("read", userId)
    if (!started.ok) return startFailure(started.code)
    logAuditEvent(AuditEventType.CLEANUP_RUN_STARTED, userId, { kind: "read", queued: true })
    revalidatePath(cleanup())
    return ok({ queued: true as const })
  },
})

/**
 * Start the first media cleanup library read, once, while no library data
 * exists. `queued` is false when library data exists, a read is in
 * progress or queued, or the job queue is not set up or does not answer.
 */
export const startCleanupFirstRead = adminAction<CleanupFirstReadResult>({
  rateLimit: JOB_LIMIT,
  fallbackError: "Could not start the library read. Try again.",
  handler: async () => ok({ queued: await startFirstRead() }),
})
