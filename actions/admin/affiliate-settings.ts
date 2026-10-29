"use server"

import { revalidatePath } from "next/cache"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { saveAffiliateSettings } from "@/lib/affiliates/switch"
import { affiliateSettingsSchema } from "@/lib/validations/affiliates"

/**
 * Saves the affiliate settings (admin only): the switch, the tiers, the
 * server cap and the library list. The switch refuses to go on without a
 * library list, Tautulli and the Plex server's machine id (`VALIDATION`);
 * turning it off cancels every open affiliate invite and returns the count.
 */
export const updateAffiliateSettings = adminAction({
  input: affiliateSettingsSchema,
  rateLimit: { name: "admin:affiliates" },
  fallbackError: "Could not save the affiliate settings",
  handler: async (input, { userId }) => {
    const result = await saveAffiliateSettings(input, userId)
    if (!result.ok) return fail("VALIDATION", result.reason)
    revalidatePath("/admin/affiliates")
    return ok({ invitesCancelled: result.invitesCancelled })
  },
})
