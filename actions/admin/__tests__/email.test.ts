/**
 * @jest-environment node
 *
 * The test email action: admin only, rate limited, refused without a mail
 * set-up or an address, queued with Redis and sent in the request without it.
 */

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"
import { mockReset } from "jest-mock-extended"

import { sendTestEmail } from "@/actions/admin/email"
import { buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { emailConfigured } from "@/lib/email/config"
import { deliverTestEmail } from "@/lib/email/send-test-email"
import { isRedisConfigured } from "@/lib/queue/connection"
import { enqueueFromRequest } from "@/lib/queue/request-path"
import { JOB_TYPES } from "@/lib/queue/types"
import { consume } from "@/lib/security/rate-limit"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/email/config", () => ({ emailConfigured: jest.fn() }))
jest.mock("@/lib/email/send-test-email", () => ({ deliverTestEmail: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: jest.fn() }))
jest.mock("@/lib/queue/request-path", () => ({ enqueueFromRequest: jest.fn() }))

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true } })
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(emailConfigured).mockReturnValue(true)
  jest.mocked(isRedisConfigured).mockReturnValue(false)
  jest.mocked(deliverTestEmail).mockResolvedValue({ status: "sent", smtpCode: 250 })
  jest.mocked(enqueueFromRequest).mockResolvedValue({ ok: true, jobId: "job-1" })
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "admin-1", email: "sam@example.com" }))
})

describe("sendTestEmail", () => {
  it("refuses a signed-out user, a member and a Support user", async () => {
    jest.mocked(getServerSession).mockResolvedValueOnce(null)
    await expect(sendTestEmail()).resolves.toMatchObject({ success: false, code: "UNAUTHENTICATED" })

    jest.mocked(getServerSession).mockResolvedValueOnce({ user: { id: "m1", isAdmin: false } })
    await expect(sendTestEmail()).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })

    jest.mocked(getServerSession).mockResolvedValueOnce({ user: { id: "s1", isAdmin: false, role: "support" } })
    await expect(sendTestEmail()).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(deliverTestEmail).not.toHaveBeenCalled()
    expect(enqueueFromRequest).not.toHaveBeenCalled()
  })

  it("spends the admin:test rate limit", async () => {
    jest.mocked(consume).mockResolvedValue({ ok: false, retryAfterSec: 30 })

    await expect(sendTestEmail()).resolves.toMatchObject({ success: false, code: "RATE_LIMITED" })
    expect(consume).toHaveBeenCalledWith("admin:test", "admin-1")
    expect(deliverTestEmail).not.toHaveBeenCalled()
  })

  it("refuses while email is not set up", async () => {
    jest.mocked(emailConfigured).mockReturnValue(false)

    await expect(sendTestEmail()).resolves.toMatchObject({ success: false, code: "VALIDATION", error: expect.stringContaining("SMTP_URL") })
    expect(deliverTestEmail).not.toHaveBeenCalled()
  })

  it("gives a field error when the admin has no usable address", async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "admin-1", email: null }))

    await expect(sendTestEmail()).resolves.toMatchObject({ success: false, code: "VALIDATION", fieldErrors: { email: [expect.any(String)] } })
    expect(deliverTestEmail).not.toHaveBeenCalled()
  })

  it("queues the job with Redis, ids only, one attempt", async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(true)

    await expect(sendTestEmail()).resolves.toEqual({ success: true, data: { queued: true } })
    expect(enqueueFromRequest).toHaveBeenCalledWith(JOB_TYPES.EMAIL_TEST, { userId: "admin-1" }, { attempts: 1, removeOnComplete: true })
    expect(deliverTestEmail).not.toHaveBeenCalled()
  })

  it("answers UPSTREAM_UNAVAILABLE while the queue is down", async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(true)
    jest.mocked(enqueueFromRequest).mockResolvedValue({ ok: false, code: "QUEUE_UNAVAILABLE" })

    await expect(sendTestEmail()).resolves.toMatchObject({ success: false, code: "UPSTREAM_UNAVAILABLE" })
  })

  it("sends in the request without Redis and refreshes the page", async () => {
    await expect(sendTestEmail()).resolves.toEqual({ success: true, data: { queued: false } })
    expect(deliverTestEmail).toHaveBeenCalledWith("admin-1", expect.any(AbortSignal))
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings")
  })

  it.each([
    ["rejected", 550, "The mail server refused your address. (SMTP 550)"],
    ["refused", 554, "The mail server refused the email. Check the sender address and the login. (SMTP 554)"],
    ["temporary", 451, "The mail server did not take the email. Try again in a few minutes. (SMTP 451)"],
    ["timeout", null, "The mail server took too long to answer. Try again in a few minutes."],
  ] as const)("says why a %s send failed, with the code only", async (failure, smtpCode, error) => {
    jest.mocked(deliverTestEmail).mockResolvedValue({ status: "failed", smtpCode, failure })

    await expect(sendTestEmail()).resolves.toEqual({ success: false, code: "UPSTREAM_UNAVAILABLE", error })
  })

  it("refuses when the set-up or the address changed before the send", async () => {
    jest.mocked(deliverTestEmail).mockResolvedValueOnce({ status: "not_configured" })
    await expect(sendTestEmail()).resolves.toMatchObject({ success: false, code: "VALIDATION", error: expect.stringContaining("SMTP_URL") })

    jest.mocked(deliverTestEmail).mockResolvedValueOnce({ status: "no_address" })
    await expect(sendTestEmail()).resolves.toMatchObject({ success: false, code: "VALIDATION", error: expect.stringContaining("no email address") })
  })
})
