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

export const AFFILIATE_NOTE_MAX = 500
export const AFFILIATE_LABEL_MAX = 60

/** A member's optional note to the admins when they apply: trimmed, at most 500 characters, blank as null. */
export const affiliateNoteSchema = z
  .string()
  .trim()
  .max(AFFILIATE_NOTE_MAX)
  .optional()
  .transform((value) => value || null)

/** An affiliate's private label for an invite: trimmed, at most 60 characters, blank as null. */
export const affiliateLabelSchema = z
  .string()
  .trim()
  .max(AFFILIATE_LABEL_MAX)
  .optional()
  .transform((value) => value || null)
