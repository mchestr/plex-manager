"use server"

import { revalidatePath } from "next/cache"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import { rewindSettingsSchema, unknownEntries, type RewindSettings } from "@/lib/validations/rewind-settings"
import { getRewindContentRatings, getRewindLibraries } from "@/lib/wrapped/admin/settings-options"
import { REWIND_SETTINGS_SELECT, rewindSettingsFromConfig } from "@/lib/wrapped/config"

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Saves the Rewind settings section (admin only, P7.12). The input is the
 * whole section; only the fields that differ from the stored row are written,
 * and one `CONFIG_CHANGED` entry (section `rewind`) lists them. A save with no
 * change writes nothing.
 *
 * Excluded libraries must be ones Tautulli lists and excluded ratings ones the
 * metadata cache has seen; entries already stored stay allowed, so a Tautulli
 * outage does not block the other fields.
 */
export const updateRewindSettings = adminAction({
  input: rewindSettingsSchema,
  fallbackError: "Failed to save the Rewind settings",
  handler: async (input, { userId }) => {
    const row = await prisma.config.findUnique({ where: { id: "config" }, select: REWIND_SETTINGS_SELECT })
    const before = row ? rewindSettingsFromConfig(row) : null

    const keys = Object.keys(input) as (keyof RewindSettings)[]
    const changed = keys.filter((key) => !before || !same(before[key], input[key]))
    if (changed.length === 0) return ok(null)

    if (changed.includes("rewindExcludedSectionIds")) {
      const { libraries } = await getRewindLibraries()
      const known = libraries?.map((library) => library.id) ?? []
      if (unknownEntries(input.rewindExcludedSectionIds, known, before?.rewindExcludedSectionIds ?? []).length > 0) {
        return fail("VALIDATION", "Choose libraries from the list")
      }
    }
    if (changed.includes("rewindExcludedContentRatings")) {
      const known = await getRewindContentRatings()
      if (unknownEntries(input.rewindExcludedContentRatings, known, before?.rewindExcludedContentRatings ?? []).length > 0) {
        return fail("VALIDATION", "Choose content ratings from the list")
      }
    }

    const values = Object.fromEntries(changed.map((key) => [key, input[key]])) as Partial<RewindSettings>
    await prisma.config.upsert({
      where: { id: "config" },
      update: { ...values, updatedBy: userId },
      create: { id: "config", ...values, updatedBy: userId },
      select: { id: true },
    })

    logAuditEvent(
      AuditEventType.CONFIG_CHANGED,
      userId,
      configDiff("rewind", before && Object.fromEntries(changed.map((key) => [key, before[key]])), values)
    )

    revalidatePath("/admin/settings")
    revalidatePath("/admin/rewind")
    revalidatePath("/")
    revalidatePath("/rewind", "layout")
    return ok(null)
  },
})
