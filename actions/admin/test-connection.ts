"use server"

/**
 * Test connection with typed values (P10.20, SEC-31): settings calls this
 * before saving; setup calls `testSetupConnection` (`actions/setup.ts`),
 * which runs the same test behind the claim. It returns `{ status, code }`
 * or a coded refusal, never a tester's message, and `lib/ui/error-copy.ts`
 * (`connectionTestCopy`) turns the code into field copy and the fix.
 */

import { adminAction } from "@/lib/actions/define-action"
import { runConnectionTest, testConnectionInput, type TestConnectionResult } from "@/lib/settings/test-connection"

/**
 * Tests one service with the URL and secret in the form. A blank secret uses
 * the stored one only for the origin it was saved with; otherwise it returns
 * `SECRET_REQUIRED` with a field error on `secret` before any request is made.
 */
export const testServiceConnection = adminAction({
  input: testConnectionInput,
  rateLimit: { name: "admin:test" },
  fallbackError: "Could not test the connection",
  handler: (input): Promise<TestConnectionResult> => runConnectionTest(input),
})
