/**
 * @jest-environment node
 */

import { mockReset } from "jest-mock-extended"

import { buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getEmailConfig } from "@/lib/email/config"
import { loadEmailContext } from "@/lib/email/context"
import type { EmailConfig } from "@/lib/email/env-rules"
import { deliverTestEmail } from "@/lib/email/send-test-email"
import { sendEmail } from "@/lib/email/transport"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/email/config", () => ({ getEmailConfig: jest.fn() }))
jest.mock("@/lib/email/context", () => ({ loadEmailContext: jest.fn() }))
jest.mock("@/lib/email/transport", () => ({ sendEmail: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), recordAuditEvent: jest.fn() }))
jest.mock("@/lib/utils/logger", () => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { createLogger: () => logger }
})

const logger = createLogger("EMAIL")

const config: EmailConfig = {
  server: { host: "smtp.example.com", port: 587, secure: false },
  auth: null,
  from: "noreply@example.com",
  replyTo: null,
  postalAddress: null,
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getEmailConfig).mockReturnValue(config)
  jest.mocked(loadEmailContext).mockResolvedValue({
    serverName: "Northfield Plex",
    appUrl: "https://plex.example.com",
    accent: { fill: "#b45309", ink: "#ffffff" },
    replyTo: null,
    postalAddress: null,
  })
  jest.mocked(recordAuditEvent).mockResolvedValue(undefined)
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "admin-1", name: "Sam", email: "sam@example.com" }))
})

describe("deliverTestEmail", () => {
  it("sends the test email to the admin's address and audits it as sent", async () => {
    jest.mocked(sendEmail).mockResolvedValue({ ok: true, smtpCode: 250 })
    const signal = new AbortController().signal

    await expect(deliverTestEmail("admin-1", signal)).resolves.toEqual({ status: "sent", smtpCode: 250 })

    const [usedConfig, message, usedSignal] = jest.mocked(sendEmail).mock.calls[0]
    expect(usedConfig).toBe(config)
    expect(usedSignal).toBe(signal)
    expect(message).toMatchObject({
      from: { name: "Northfield Plex", address: "noreply@example.com" },
      to: { name: "", address: "sam@example.com" },
      subject: "[Test] Email from Northfield Plex",
    })
    expect(recordAuditEvent).toHaveBeenCalledWith(AuditEventType.EMAIL_TEST_SENT, "admin-1", { status: "sent", smtpCode: 250 })
    expect(logger.info).toHaveBeenCalledWith("email_test.sent", { userId: "admin-1", smtpCode: 250 })
  })

  it("audits a failed send with its class and code, never the address", async () => {
    jest.mocked(sendEmail).mockResolvedValue({ ok: false, failure: { kind: "refused", smtpCode: 554, status: null, step: "DATA" } })

    await expect(deliverTestEmail("admin-1")).resolves.toEqual({ status: "failed", smtpCode: 554, failure: "refused" })
    expect(recordAuditEvent).toHaveBeenCalledWith(AuditEventType.EMAIL_TEST_SENT, "admin-1", { status: "failed", smtpCode: 554, failure: "refused" })
    expect(JSON.stringify([jest.mocked(recordAuditEvent).mock.calls, jest.mocked(logger.warn).mock.calls])).not.toContain("@")
  })

  it("sends nothing when email is not set up", async () => {
    jest.mocked(getEmailConfig).mockReturnValue(null)

    await expect(deliverTestEmail("admin-1")).resolves.toEqual({ status: "not_configured" })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(recordAuditEvent).toHaveBeenCalledWith(AuditEventType.EMAIL_TEST_SENT, "admin-1", { status: "not_configured" })
  })

  it.each([
    ["no user", null],
    ["no address", buildUser({ id: "admin-1", email: null })],
    ["a value that is not one address", buildUser({ id: "admin-1", email: "plexuser" })],
  ])("sends nothing for %s", async (_case, user) => {
    prismaMock.user.findUnique.mockResolvedValue(user)

    await expect(deliverTestEmail("admin-1")).resolves.toEqual({ status: "no_address" })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("still returns the result when the audit row cannot be written", async () => {
    jest.mocked(sendEmail).mockResolvedValue({ ok: true, smtpCode: 250 })
    jest.mocked(recordAuditEvent).mockRejectedValue(new Error("database down"))

    await expect(deliverTestEmail("admin-1")).resolves.toEqual({ status: "sent", smtpCode: 250 })
    expect(logger.error).toHaveBeenCalledWith("email_test.audit_failed", expect.any(Error), { userId: "admin-1" })
  })
})
