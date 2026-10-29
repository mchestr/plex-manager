import { z } from "zod"

import { affiliateTiersSchema } from "@/lib/affiliates/tiers"
import { plexLibrarySectionIdsSchema } from "@/lib/invites/plex-library-ids"

export const AFFILIATE_REASON_MAX = 500

/** An optional reason the member sees: trimmed, at most 500 characters, blank as null. */
export const affiliateReasonSchema = z
  .string()
  .trim()
  .max(AFFILIATE_REASON_MAX)
  .optional()
  .transform((value) => value || null)

/** The Disable and Remove dialogs' "Also revoke the inviter's status" option. */
export const revokeInviterSchema = z.object({ reason: affiliateReasonSchema }).optional()

export const affiliateIdSchema = z.string().min(1).max(100)

export const AFFILIATE_CAP_MAX = 1000

/**
 * The affiliate settings an admin saves. `cap` is joins per rolling 30 days
 * across all affiliates (null: no cap; 0 stops new invites). The switch needs
 * at least one library: an empty list is never "every library".
 */
export const affiliateSettingsSchema = z
  .object({
    enabled: z.boolean(),
    tiers: affiliateTiersSchema,
    cap: z.number().int().min(0).max(AFFILIATE_CAP_MAX).nullable(),
    libraryIds: plexLibrarySectionIdsSchema,
  })
  .refine((settings) => !settings.enabled || settings.libraryIds.length > 0, {
    path: ["libraryIds"],
    message: "Select one or more libraries before you turn on affiliate invites",
  })

export type AffiliateSettingsInput = z.infer<typeof affiliateSettingsSchema>
