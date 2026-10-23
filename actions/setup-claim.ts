"use server"

/**
 * Claims the server before first-run setup (SEC-30): the setup code from the
 * log, or `SETUP_TOKEN`, sets the `pm-setup` cookie that every setup action
 * checks until setup completes (`lib/setup/claim.ts`).
 */

import { cookies } from "next/headers"
import { z } from "zod"

import { publicAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { actionClientIp, reward } from "@/lib/security/rate-limit"
import { redeemSetupCode, setupClaimCookie } from "@/lib/setup/claim"
import { getSetupStatus } from "@/lib/setup/status"
import { maskIp } from "@/lib/utils/log-redaction"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("SETUP_CLAIM")

const WRONG_CODE = "That code doesn't match. Use the newest setup code in the server log, or SETUP_TOKEN."

/**
 * Checks `code` and, on a match, sets the claim cookie. Five tries a minute
 * per address (`setup:claim`); a successful claim gives its try back, so only
 * wrong codes count.
 */
export const claimServer = publicAction({
  input: z.strictObject({ code: z.string().trim().min(1, "Enter the setup code").max(200) }),
  rateLimit: { name: "setup:claim" },
  fallbackError: "Could not claim the server",
  handler: async ({ code }) => {
    if ((await getSetupStatus()).isComplete) {
      return fail("CONFLICT", "Setup is already complete.")
    }

    const claim = await redeemSetupCode(code)
    if (!claim.ok) {
      return fail("VALIDATION", WRONG_CODE, { fieldErrors: { code: [WRONG_CODE] } })
    }

    ;(await cookies()).set(setupClaimCookie(claim.claimId))
    const ip = await actionClientIp()
    // The claim and its cookie already exist: a limiter error must not turn them into a failure
    await reward("setup:claim", ip).catch((error: unknown) => logger.warn("Could not give back the claim attempt", { error }))
    logAuditEvent(AuditEventType.SETUP_CLAIMED, "setup", { method: claim.method, ip: maskIp(ip) })
    return ok(null)
  },
})
