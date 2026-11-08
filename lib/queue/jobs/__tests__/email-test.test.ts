/**
 * @jest-environment node
 */

import { deliverTestEmail } from "@/lib/email/send-test-email"
import { getJobProcessor } from "@/lib/queue/jobs"
import { getEmailTestProcessor } from "@/lib/queue/jobs/email-test"
import { JOB_ID_POLICY, JOB_TYPE_LABELS, JOB_TYPES, MAIN_QUEUE_JOB_TYPES } from "@/lib/queue/types"

jest.mock("@/lib/email/send-test-email", () => ({ deliverTestEmail: jest.fn() }))
jest.mock("@/lib/instrumentation/shutdown", () => ({ shutdownSignal: new AbortController().signal }))

describe("the test email job", () => {
  it("is registered on the main queue, labelled and deduplicated per admin", () => {
    expect(MAIN_QUEUE_JOB_TYPES).toContain(JOB_TYPES.EMAIL_TEST)
    expect(JOB_TYPE_LABELS[JOB_TYPES.EMAIL_TEST]).toBe("Test email")
    const policy = JOB_ID_POLICY[JOB_TYPES.EMAIL_TEST]
    expect("deduplication" in policy && policy.deduplication({ userId: "admin-1" })).toBe("email:test:admin-1")
    expect(getJobProcessor(JOB_TYPES.EMAIL_TEST)).toBeInstanceOf(Function)
    expect(getEmailTestProcessor(JOB_TYPES.MEMBER_ACTIVITY)).toBeNull()
  })

  it("sends to the admin in the payload with a time limit, and returns the result", async () => {
    jest.mocked(deliverTestEmail).mockResolvedValue({ status: "failed", smtpCode: 554, failure: "refused" })
    const processor = getEmailTestProcessor(JOB_TYPES.EMAIL_TEST)

    await expect(processor?.({ data: { userId: "admin-1" } })).resolves.toEqual({ status: "failed", smtpCode: 554, failure: "refused" })
    expect(deliverTestEmail).toHaveBeenCalledWith("admin-1", expect.any(AbortSignal))
  })
})
