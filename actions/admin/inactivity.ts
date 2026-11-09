"use server"

/**
 * The inactivity sweep (admin only): its settings, the warning emails
 * before removal, "Run now", and the per-member exclusion. Each is audited:
 * `INACTIVITY_SETTINGS_CHANGED` (section `inactivity` or
 * `inactivity-warnings`), `ACTIVITY_SYNC_TRIGGERED` and
 * `INACTIVITY_EXCLUSION_CHANGED`. See `docs/inactive-members.md`.
 *
 * @module actions/admin/inactivity
 */

import { randomUUID } from "node:crypto"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok, type ActionResult } from "@/lib/actions/result"
import { userDetail } from "@/lib/admin/routes"
import { getActiveService } from "@/lib/data/active-service"
import { inSerializable, isTransactionConflict } from "@/lib/db/serializable"
import { isRunInProgress, runMemberActivity } from "@/lib/inactivity/run"
import { emailConfigured } from "@/lib/email/config"
import { getInactivitySettings, getInactivityWarnings, INACTIVITY_SETTINGS_ID } from "@/lib/inactivity/settings"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { isRedisConfigured } from "@/lib/queue/connection"
import { enqueueFromRequest, isDeduplicatedJobPending } from "@/lib/queue/request-path"
import { JOB_TYPES } from "@/lib/queue/types"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { inactivitySettingsSchema, inactivityWarningsSchema, maxWarningLead } from "@/lib/validations/inactivity"
import { userIdSchema } from "@/lib/validations/shared-schemas"

const PAGE = "/admin/inactivity"
/** Account offers the Access reminders switch only while the warning emails are on. */
const ACCOUNT = "/account"

/** Two saves of the settings row raced, and the other one won. */
const SAVE_CONFLICT = "The inactivity settings changed while you saved. Reload the page and try again."

/**
 * Runs one save of the settings row (its read, checks and write) in a
 * Serializable transaction, so two cards saved at once cannot each pass a
 * check against the other's old value. A save that still conflicts after the
 * retries is refused with `CONFLICT`.
 */
async function saveRow<T>(body: (tx: PrismaTransactionClient) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await inSerializable(body)
  } catch (error) {
    if (isTransactionConflict(error)) return fail("CONFLICT", SAVE_CONFLICT)
    throw error
  }
}

/**
 * Saves the switch and the threshold; audits the fields that changed. While
 * the warning emails are on, refuses a new threshold below twice the largest
 * saved lead (the days before removal of the first warning). A save that
 * keeps the threshold, such as turning removal off, always passes. The read,
 * the check and the write run in one Serializable transaction, so a parallel
 * save of the warning emails cannot slip past the check; a save that loses
 * the race is refused with `CONFLICT`.
 */
export const updateInactivitySettings = adminAction({
  input: inactivitySettingsSchema,
  fallbackError: "Could not save the inactivity settings",
  handler: async (after, { userId }) => {
    const saved = await saveRow(async (tx) => {
      const before = await getInactivitySettings(tx)
      const warnings = await getInactivityWarnings(tx)
      const largest = warnings.warningDays[0]
      if (warnings.warningsEnabled && after.thresholdDays !== before.thresholdDays && maxWarningLead(after.thresholdDays) < largest) {
        const error = `With warning emails on, use at least ${largest * 2} days: twice the ${largest} days before removal of the first warning.`
        return fail("VALIDATION", error, { fieldErrors: { thresholdDays: [error] } })
      }
      await tx.inactivitySettings.upsert({
        where: { id: INACTIVITY_SETTINGS_ID },
        create: { id: INACTIVITY_SETTINGS_ID, ...after, updatedBy: userId },
        update: { ...after, updatedBy: userId },
      })
      return ok(before)
    })
    if (!saved.success) return saved
    const before = saved.data

    const changedFields = (["enabled", "thresholdDays"] as const).filter((field) => before[field] !== after[field])
    if (changedFields.length > 0) {
      logAuditEvent(AuditEventType.INACTIVITY_SETTINGS_CHANGED, userId, {
        section: "inactivity",
        changedFields,
        before: { enabled: before.enabled, thresholdDays: before.thresholdDays },
        after: { enabled: after.enabled, thresholdDays: after.thresholdDays },
      })
    }
    revalidatePath(PAGE)
    return ok(null)
  },
})

const NO_EMAIL = "Set up email first. Warning emails need SMTP_URL and EMAIL_FROM."
const NO_QUEUE = "Set up Redis first. Warning emails go out through the job queue."

/**
 * Saves the warning emails before removal: the switch and the days before
 * removal that each warning goes out, largest first. The largest lead can be
 * at most half the saved threshold; a save that only turns the emails off
 * passes without that check. Turning the emails on needs email set up
 * (`SMTP_URL`, `EMAIL_FROM`) and Redis; turning them off, or a change while
 * they are on, does not. With the emails on, the run removes a member only
 * after their last warning. The read, the checks and the write run in one
 * Serializable transaction, as for the settings save. Audited as
 * `INACTIVITY_SETTINGS_CHANGED` with `section: "inactivity-warnings"` when a
 * value changes.
 */
export const updateInactivityWarnings = adminAction({
  input: inactivityWarningsSchema,
  fallbackError: "Could not save the warning email settings",
  handler: async (after, { userId }) => {
    const saved = await saveRow(async (tx) => {
      const settings = await getInactivitySettings(tx)
      const before = await getInactivityWarnings(tx)
      const daysChanged = before.warningDays.join() !== after.warningDays.join()
      const turningOn = after.warningsEnabled && !before.warningsEnabled
      const most = maxWarningLead(settings.thresholdDays)
      if ((daysChanged || turningOn) && after.warningDays[0] > most) {
        const error = `Use at most ${most} days, half of the ${settings.thresholdDays} days without a play. ${after.warningDays[0]} is too many.`
        return fail("VALIDATION", error, { fieldErrors: { warningDays: [error] } })
      }
      if (turningOn) {
        const missing = !emailConfigured() ? NO_EMAIL : !isRedisConfigured() ? NO_QUEUE : null
        if (missing) return fail("VALIDATION", missing, { fieldErrors: { warningsEnabled: [missing] } })
      }
      await tx.inactivitySettings.upsert({
        where: { id: INACTIVITY_SETTINGS_ID },
        create: { id: INACTIVITY_SETTINGS_ID, ...after, updatedBy: userId },
        update: { ...after, updatedBy: userId },
      })
      return ok(before)
    })
    if (!saved.success) return saved
    const before = saved.data

    const changedFields = [
      ...(before.warningsEnabled !== after.warningsEnabled ? ["warningsEnabled" as const] : []),
      ...(before.warningDays.join() !== after.warningDays.join() ? ["warningDays" as const] : []),
    ]
    if (changedFields.length > 0) {
      logAuditEvent(AuditEventType.INACTIVITY_SETTINGS_CHANGED, userId, { section: "inactivity-warnings", changedFields, before, after })
    }
    revalidatePath(PAGE)
    revalidatePath(ACCOUNT)
    return ok(null)
  },
})

const BUSY = "A run is already in progress. Try again in a few minutes."
const QUEUE_UNAVAILABLE = "The job queue is unavailable. Try again in a minute."
/** The deduplication id of every member activity job (`JOB_ID_POLICY`). */
const RUN_DEDUPLICATION_ID = "members:activity"

/**
 * Reads last seen from Tautulli now and, when the sweep is on, runs it. The
 * run reads Tautulli again and removes no one when any member who qualifies
 * then is not in `confirmedUserIds`, the members the admin confirmed in the
 * dialog.
 *
 * With Redis the run is queued for the worker: one attempt, removed from the
 * queue when it ends, so Job queues cannot replay it; the worker drops the
 * confirmation after 15 minutes. Without Redis it runs here, two minutes at
 * most. Refused with `CONFLICT` while another run holds the claim or an
 * earlier Run now is still queued (a second job would join it and lose its
 * confirmation; the job carries its own id, so one that joins anyway in a
 * race is caught by its returned id), and with `UPSTREAM_UNAVAILABLE` while
 * the queue does not answer; a refusal writes no audit row. A queued run can still find the
 * daily run in progress when it starts; it then removes no one and records
 * that (`busy`).
 */
export const runMemberActivityNow = adminAction({
  input: z.object({ confirmedUserIds: z.array(userIdSchema).max(1000).optional() }),
  rateLimit: { name: "admin" },
  fallbackError: "Could not start the run",
  handler: async ({ confirmedUserIds }, { userId }) => {
    if (!(await getActiveService("tautulli"))) {
      return fail("VALIDATION", "Set up Tautulli first. Last seen comes from Tautulli.")
    }
    if (await isRunInProgress()) return fail("CONFLICT", BUSY)

    const queued = isRedisConfigured()
    if (queued) {
      const pending = await isDeduplicatedJobPending(RUN_DEDUPLICATION_ID)
      if (!pending.ok) return fail("UPSTREAM_UNAVAILABLE", QUEUE_UNAVAILABLE)
      if (pending.value) return fail("CONFLICT", BUSY)
      const jobId = randomUUID()
      const added = await enqueueFromRequest(
        JOB_TYPES.MEMBER_ACTIVITY,
        { triggeredBy: "admin", triggeredByUserId: userId, confirmedUserIds },
        { attempts: 1, removeOnComplete: true, removeOnFail: true, jobId, deduplication: { id: RUN_DEDUPLICATION_ID } }
      )
      if (!added.ok) return fail("UPSTREAM_UNAVAILABLE", QUEUE_UNAVAILABLE)
      // Another id means the job joined one queued a moment earlier, which keeps that job's confirmation
      if (added.jobId !== jobId) return fail("CONFLICT", BUSY)
    } else {
      const result = await runMemberActivity("admin", {
        actorId: userId,
        confirmedUserIds,
        signal: AbortSignal.timeout(120_000),
      })
      if (result?.busy) return fail("CONFLICT", BUSY)
    }

    logAuditEvent(AuditEventType.ACTIVITY_SYNC_TRIGGERED, userId, { queued, confirmedRemovals: confirmedUserIds?.length ?? null })
    revalidatePath(PAGE)
    return ok({ queued })
  },
})

/** Keeps a member out of the inactivity sweep, or lets the sweep consider them again. */
export const setMemberInactivityExcluded = adminAction({
  input: z.object({ userId: userIdSchema, excluded: z.boolean() }),
  fallbackError: "Could not update the member",
  handler: async ({ userId, excluded }, { userId: actorId }) => {
    const updated = await prisma.user.updateMany({ where: { id: userId }, data: { inactivityExcluded: excluded } })
    if (updated.count === 0) return fail("NOT_FOUND", "User not found")

    logAuditEvent(AuditEventType.INACTIVITY_EXCLUSION_CHANGED, actorId, { targetUserId: userId, excluded })
    revalidatePath(userDetail(userId))
    revalidatePath(PAGE)
    return ok(null)
  },
})
