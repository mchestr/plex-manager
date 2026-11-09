"use server"

/**
 * The "Stop these emails" button of the unsubscribe page
 * (`app/email/unsubscribe/page.tsx`). Public: the token from the email is
 * the only proof, and it can only turn the access reminders off.
 *
 * @module actions/email-unsubscribe
 */

import { z } from "zod"

import { publicAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { saveAccessReminders } from "@/lib/email/access-reminders"
import { MAX_UNSUBSCRIBE_TOKEN_LENGTH, verifyUnsubscribeToken } from "@/lib/security/unsubscribe-token"

/** The page shows its own words for a dead link; this is the result's text. */
const DEAD_LINK = "This link no longer works."

/**
 * Turns off the access reminders of the member that `token` names. Twenty
 * tries in 15 minutes per address (`email:unsubscribe`). A token that is
 * changed, expired or for a removed member fails with `NOT_FOUND`.
 */
export const unsubscribeWithToken = publicAction({
  input: z.strictObject({ token: z.string().max(MAX_UNSUBSCRIBE_TOKEN_LENGTH) }),
  rateLimit: { name: "email:unsubscribe" },
  fallbackError: "Could not save the email setting",
  handler: async ({ token }) => {
    const userId = verifyUnsubscribeToken(token)
    if (!userId) return fail("NOT_FOUND", DEAD_LINK)
    const saved = await saveAccessReminders(userId, { enabled: false, via: "link" })
    if (saved === "no_member") return fail("NOT_FOUND", DEAD_LINK)
    return ok(null)
  },
})
