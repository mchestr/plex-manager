/**
 * Test connection with typed values, as an action result (P10.20): the input
 * schema and the mapping both callers share, settings'
 * `testServiceConnection` (admin) and setup's `testSetupConnection` (the
 * claim, P10.25). The result is `{ status, code }` or a coded refusal, never
 * a tester's message.
 *
 * @module lib/settings/test-connection
 */

import "server-only"

import { z } from "zod"

import { ok, type ActionErrorCode, type ActionResult } from "@/lib/actions/result"
import { SECRET_REQUIRED_MESSAGE, type SecretRequiredCode } from "@/lib/security/secret-reuse"
import type { Probe } from "@/lib/settings/probe"
import { TESTABLE_SERVICES, testService } from "@/lib/settings/test-service"

export const testConnectionInput = z.object({
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
export async function runConnectionTest(input: z.output<typeof testConnectionInput>): Promise<TestConnectionResult> {
  const result = await testService(input)
  if (result.ok) return ok(result.probe)
  if (result.code === "SECRET_REQUIRED") {
    return { success: false, code: "SECRET_REQUIRED", error: SECRET_REQUIRED_MESSAGE, fieldErrors: { secret: [SECRET_REQUIRED_MESSAGE] } }
  }
  return { success: false, code: "VALIDATION", error: result.message, fieldErrors: { [result.field]: [result.message] } }
}
