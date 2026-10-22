"use server"

/**
 * Test connection with typed values (P10.20, SEC-31): settings and, from
 * P10.25, setup call this before saving. It returns `{ status, code }` or a
 * coded refusal, never a tester's message, and `lib/ui/error-copy.ts`
 * (`connectionTestCopy`) turns the code into field copy and the fix.
 */

import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { ok, type ActionErrorCode, type ActionResult } from "@/lib/actions/result"
import { SECRET_REQUIRED_MESSAGE, type SecretRequiredCode } from "@/lib/security/secret-reuse"
import { TESTABLE_SERVICES, testService } from "@/lib/settings/test-service"
import type { Probe } from "@/lib/settings/probe"

const testInput = z.object({
  service: z.enum(TESTABLE_SERVICES),
  url: z.string().trim().min(1, "Server URL is required").max(2048),
  secret: z.string().max(500).optional(),
  query: z.string().max(2000).optional(),
})

export type TestConnectionResult = ActionResult<Probe, ActionErrorCode | SecretRequiredCode>

/**
 * Tests one service with the URL and secret in the form. A blank secret uses
 * the stored one only for the origin it was saved with; otherwise it returns
 * `SECRET_REQUIRED` with a field error on `secret` before any request is made.
 */
export const testServiceConnection = adminAction({
  input: testInput,
  rateLimit: { name: "admin:test" },
  fallbackError: "Could not test the connection",
  handler: async (input): Promise<TestConnectionResult> => {
    const result = await testService(input)
    if (result.ok) return ok(result.probe)
    if (result.code === "SECRET_REQUIRED") {
      return { success: false, code: "SECRET_REQUIRED", error: SECRET_REQUIRED_MESSAGE, fieldErrors: { secret: [SECRET_REQUIRED_MESSAGE] } }
    }
    return { success: false, code: "VALIDATION", error: result.message, fieldErrors: { [result.field]: [result.message] } }
  },
})
