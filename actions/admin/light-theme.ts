"use server"

/**
 * The settings System section's "Light theme for members" Switch (P10.10):
 * `Config.lightThemeEnabled`, off by default. Turning it on lets members pick
 * Light; turning it off puts everyone back on dark, cookies or not.
 *
 * @module actions/admin/light-theme
 */

import { revalidatePath, updateTag } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { ok } from "@/lib/actions/result"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import { APP_SETTINGS_TAG } from "@/lib/settings/app-settings"

export const setLightThemeEnabled = adminAction({
  input: z.strictObject({ enabled: z.boolean() }),
  fallbackError: "Could not save the light theme setting",
  handler: async ({ enabled }, { userId }) => {
    const before = await prisma.config.findUnique({ where: { id: "config" }, select: { lightThemeEnabled: true } })
    await prisma.config.upsert({
      where: { id: "config" },
      update: { lightThemeEnabled: enabled, updatedBy: userId },
      create: { id: "config", lightThemeEnabled: enabled, updatedBy: userId },
      select: { id: true },
    })

    logAuditEvent(AuditEventType.CONFIG_CHANGED, userId, configDiff("appearance", before, { lightThemeEnabled: enabled }))
    // The root layout reads the flag through the cached app settings.
    updateTag(APP_SETTINGS_TAG)
    revalidatePath("/", "layout")
    return ok({ enabled })
  },
})
