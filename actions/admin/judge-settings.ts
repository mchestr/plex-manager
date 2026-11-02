"use server"

/**
 * The conversation review settings (admin only, audited as `CONFIG_CHANGED`
 * section `judge`): the nightly sweep, its sample rate and minimum turns, and
 * the judge's daily spend cap.
 *
 * @module actions/admin/judge-settings
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { ensureJudgeSchedule } from "@/lib/judge/schedule"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"

/**
 * Saves the conversation review settings: whether the nightly sweep runs
 * (at 03:17 in the server zone), the percent of changed conversations it
 * reviews each night (0 to 100), the fewest user messages a conversation
 * needs before it is reviewed (1 to 50), and the daily spend cap in USD for
 * all judge reviews, manual and nightly (0 to 1000; 0 refuses every review).
 * Moves the nightly schedule, and answers `UPSTREAM_UNAVAILABLE` when the
 * settings saved but the job queue did not take the schedule.
 */
export const saveJudgeSettings = adminAction({
  input: z.object({
    judgeNightlyEnabled: z.boolean(),
    judgeSampleRate: z.number().int().min(0).max(100),
    judgeMinTurns: z.number().int().min(1).max(50),
    llmDailyCapJudgeUsd: z.number().min(0).max(1000),
  }),
  fallbackError: "Failed to update the conversation review settings",
  handler: async (values, { userId }) => {
    const before = await prisma.config.findUnique({
      where: { id: "config" },
      select: { judgeNightlyEnabled: true, judgeSampleRate: true, judgeMinTurns: true, llmDailyCapJudgeUsd: true },
    })
    await prisma.config.upsert({
      where: { id: "config" },
      create: { id: "config", ...values, updatedBy: userId },
      update: { ...values, updatedBy: userId },
    })

    logAuditEvent(AuditEventType.CONFIG_CHANGED, userId, configDiff("judge", before, values))
    revalidatePath("/admin/settings")

    const schedule = await ensureJudgeSchedule()
    if (!schedule.ok) {
      return fail(
        "UPSTREAM_UNAVAILABLE",
        "Settings saved, but the job queue did not answer, so the schedule was not updated. The worker updates it the next time it starts."
      )
    }
    return ok(null)
  },
})
