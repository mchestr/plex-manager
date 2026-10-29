import { z } from "zod"

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
