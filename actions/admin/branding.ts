"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { expireTag } from "@/lib/actions/invalidate"
import { adminAction } from "@/lib/actions/define-action"
import { ok } from "@/lib/actions/result"
import { ACCENT_PATTERN } from "@/lib/branding/accent"
import { BRANDING_TAG } from "@/lib/branding/settings"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import { APP_SETTINGS_TAG } from "@/lib/settings/app-settings"

/** Blank clears the field, so the default comes back. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} can be at most ${max} characters`)
    .transform((value) => value || null)

const appearanceSchema = z.object({
  serverName: optionalText(60, "The server name"),
  loginSubtitle: optionalText(120, "The login subtitle"),
  accentColor: z
    .string()
    .trim()
    .refine((value) => value === "" || ACCENT_PATTERN.test(value), "Enter a colour as #RRGGBB")
    .transform((value) => (value ? value.toUpperCase() : null)),
})

/**
 * Set the server's identity and colour (admin only): the server name members
 * see, the line under it on the sign-in screen and the accent colour the
 * buttons, links and focus rings take. A blank field clears it: the name falls
 * back to the Plex server's, the subtitle goes and the accent returns to amber.
 */
export const updateAppearance = adminAction({
  input: appearanceSchema,
  fallbackError: "Failed to update the appearance",
  handler: async (appearance, { userId }) => {
    const before = await prisma.config.findUnique({
      where: { id: "config" },
      select: { serverName: true, loginSubtitle: true, accentColor: true },
    })
    await prisma.config.upsert({
      where: { id: "config" },
      update: { ...appearance, updatedBy: userId },
      create: { id: "config", ...appearance, updatedBy: userId },
      select: { id: true },
    })

    logAuditEvent(AuditEventType.CONFIG_CHANGED, userId, configDiff("branding", before, appearance))
    // The name is an app setting; the subtitle and accent are branding
    expireTag(APP_SETTINGS_TAG)
    expireTag(BRANDING_TAG)
    revalidatePath("/", "layout")
    return ok(appearance)
  },
})
