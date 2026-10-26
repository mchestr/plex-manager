"use server"

/**
 * The request-limit tier settings (admin only, audited as `CONFIG_CHANGED`
 * section `request-tiers`), "Run now", and the per-member exclusion from the
 * sync.
 *
 * @module actions/admin/request-tiers
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { getActiveService } from "@/lib/data/active-service"
import { prisma } from "@/lib/prisma"
import { addJob } from "@/lib/queue/client"
import { isRedisConfigured } from "@/lib/queue/connection"
import { JOB_TYPES } from "@/lib/queue/types"
import { runRequestTierSync } from "@/lib/request-tiers/run"
import { ensureRequestTierSchedule } from "@/lib/request-tiers/schedule"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import { requestTierSettingsSchema } from "@/lib/validations/request-tiers"
import { userIdSchema } from "@/lib/validations/shared-schemas"

export const updateRequestTierSettings = adminAction({
  input: requestTierSettingsSchema,
  fallbackError: "Failed to update the request limits",
  handler: async ({ enabled, runHour, tiers }, { userId }) => {
    if (enabled) {
      const [tautulli, overseerr] = await Promise.all([getActiveService("tautulli"), getActiveService("overseerr")])
      if (!tautulli || !overseerr) {
        return fail("VALIDATION", "Request limits need an active Tautulli and Overseerr server")
      }
    }

    const before = await prisma.config.findUnique({
      where: { id: "config" },
      select: { requestTiersEnabled: true, requestTiersRunHour: true, requestTiers: true },
    })
    const values = { requestTiersEnabled: enabled, requestTiersRunHour: runHour, requestTiers: tiers }
    await prisma.config.upsert({
      where: { id: "config" },
      create: { id: "config", ...values, updatedBy: userId },
      update: { ...values, updatedBy: userId },
    })

    logAuditEvent(AuditEventType.CONFIG_CHANGED, userId, configDiff("request-tiers", before, values))
    revalidatePath("/admin/settings")
    revalidatePath("/")

    const schedule = await ensureRequestTierSchedule()
    if (!schedule.ok) {
      return fail(
        "UPSTREAM_UNAVAILABLE",
        "Settings saved, but the job queue did not answer, so the schedule was not updated. Save again once the queue is back."
      )
    }
    return ok(null)
  },
})

export const runRequestTiersNow = adminAction({
  rateLimit: { name: "admin" },
  fallbackError: "Could not run the request limits",
  handler: async () => {
    if (isRedisConfigured()) {
      await addJob(JOB_TYPES.REQUEST_TIER_SYNC, { triggeredBy: "admin" }, { attempts: 1, removeOnComplete: true, removeOnFail: true })
      return ok({ queued: true })
    }
    await runRequestTierSync("admin", { signal: AbortSignal.timeout(20_000) })
    revalidatePath("/admin/settings")
    return ok({ queued: false })
  },
})

/** Keeps a member's Overseerr quota out of the tier sync, so an admin's hand-set quota stays. */
export const setMemberTiersExcluded = adminAction({
  input: z.object({ userId: userIdSchema, excluded: z.boolean() }),
  fallbackError: "Could not update the member",
  handler: async ({ userId, excluded }, { userId: actorId }) => {
    const updated = await prisma.user.updateMany({ where: { id: userId }, data: { requestTiersExcluded: excluded } })
    if (updated.count === 0) return fail("NOT_FOUND", "User not found")

    logAuditEvent(AuditEventType.CONFIG_CHANGED, actorId, { section: "request-tiers.member", targetUserId: userId, excluded })
    revalidatePath(`/admin/users/${userId}`)
    revalidatePath("/")
    return ok(null)
  },
})
