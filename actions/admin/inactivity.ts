"use server"

/**
 * The inactivity sweep (admin only): its settings, "Run now", and the
 * per-member exclusion. Each is audited: `INACTIVITY_SETTINGS_CHANGED`,
 * `ACTIVITY_SYNC_TRIGGERED` and `INACTIVITY_EXCLUSION_CHANGED`. See
 * `docs/inactive-members.md`.
 *
 * @module actions/admin/inactivity
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { userDetail } from "@/lib/admin/routes"
import { getActiveService } from "@/lib/data/active-service"
import { isRunInProgress, runMemberActivity } from "@/lib/inactivity/run"
import { getInactivitySettings, INACTIVITY_SETTINGS_ID } from "@/lib/inactivity/settings"
import { prisma } from "@/lib/prisma"
import { addJob } from "@/lib/queue/client"
import { isRedisConfigured } from "@/lib/queue/connection"
import { JOB_TYPES } from "@/lib/queue/types"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { inactivitySettingsSchema } from "@/lib/validations/inactivity"
import { userIdSchema } from "@/lib/validations/shared-schemas"

const PAGE = "/admin/inactivity"

/** Saves the switch and the threshold; audits the fields that changed. */
export const updateInactivitySettings = adminAction({
  input: inactivitySettingsSchema,
  fallbackError: "Could not save the inactivity settings",
  handler: async (after, { userId }) => {
    const before = await getInactivitySettings()
    await prisma.inactivitySettings.upsert({
      where: { id: INACTIVITY_SETTINGS_ID },
      create: { id: INACTIVITY_SETTINGS_ID, ...after, updatedBy: userId },
      update: { ...after, updatedBy: userId },
    })

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

const BUSY = "A run is already in progress. Try again in a few minutes."

/**
 * Reads last seen from Tautulli now and, when the sweep is on, runs it. The
 * run removes no one when more members qualify than `confirmedRemovals`, the
 * count the admin confirmed in the dialog. Queued on the worker when Redis is
 * set up, else run here (two minutes at most). Refused while another run (the
 * daily one, say) holds the claim, so a confirmed count is never dropped
 * silently.
 */
export const runMemberActivityNow = adminAction({
  input: z.object({ confirmedRemovals: z.number().int().min(0).max(10_000).optional() }),
  rateLimit: { name: "admin" },
  fallbackError: "Could not start the run",
  handler: async ({ confirmedRemovals }, { userId }) => {
    if (!(await getActiveService("tautulli"))) {
      return fail("VALIDATION", "Set up Tautulli first. Last seen comes from Tautulli.")
    }
    if (await isRunInProgress()) return fail("CONFLICT", BUSY)

    const queued = isRedisConfigured()
    if (queued) {
      await addJob(
        JOB_TYPES.MEMBER_ACTIVITY,
        { triggeredBy: "admin", triggeredByUserId: userId, confirmedRemovals },
        { attempts: 1, removeOnComplete: true }
      )
    } else {
      const result = await runMemberActivity("admin", {
        actorId: userId,
        confirmedRemovals,
        signal: AbortSignal.timeout(120_000),
      })
      if (result?.busy) return fail("CONFLICT", BUSY)
    }

    logAuditEvent(AuditEventType.ACTIVITY_SYNC_TRIGGERED, userId, { queued, confirmedRemovals: confirmedRemovals ?? null })
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
