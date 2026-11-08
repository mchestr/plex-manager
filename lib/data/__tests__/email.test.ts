/**
 * @jest-environment node
 */

/**
 * `getEmailSettings`: the admin check before any read, the mail set-up
 * without its secrets, and the newest test email from its audit row.
 */

import { mockReset } from "jest-mock-extended"

import { buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { getEmailSettings } from "@/lib/data/email"
import { emailStatus } from "@/lib/email/config"
import { AuditEventType } from "@/lib/security/audit-log"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/email/config", () => ({ emailStatus: jest.fn() }))
jest.mock("@/lib/settings/app-settings", () => ({
  getFormat: jest.fn(async () => ({ date: (value: unknown) => String(value), number: (value: number) => String(value) })),
}))

const TESTED_AT = new Date("2027-02-01T10:00:00Z")

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(emailStatus).mockReturnValue({ state: "off" })
})

describe("getEmailSettings", () => {
  it("checks the admin before it reads anything", async () => {
    jest.mocked(assertAdmin).mockRejectedValueOnce(Object.assign(new Error("forbidden"), { digest: "PM_FORBIDDEN" }))

    await expect(getEmailSettings()).rejects.toMatchObject({ digest: "PM_FORBIDDEN" })
    expect(prismaMock.auditLog.findFirst).not.toHaveBeenCalled()
    expect(emailStatus).not.toHaveBeenCalled()
  })

  it("has no last test before the first one", async () => {
    prismaMock.auditLog.findFirst.mockResolvedValue(null)

    await expect(getEmailSettings()).resolves.toEqual({ status: { state: "off" }, lastTest: null })
    expect(prismaMock.auditLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { type: AuditEventType.EMAIL_TEST_SENT } }))
  })

  it("reads the newest test, who asked and how it went", async () => {
    prismaMock.auditLog.findFirst.mockResolvedValue({ id: "evt-1", actorUserId: "admin-1", createdAt: TESTED_AT, details: { status: "failed", smtpCode: 554 } } as never)
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "admin-1", name: "Sam" }))

    await expect(getEmailSettings()).resolves.toMatchObject({
      lastTest: { at: TESTED_AT, by: "Sam", eventId: "evt-1", outcome: "Not sent, the mail server did not take it (554)" },
    })
  })

  it("names a removed admin and an unknown result plainly", async () => {
    prismaMock.auditLog.findFirst.mockResolvedValue({ id: "evt-2", actorUserId: "gone", createdAt: TESTED_AT, details: { status: "odd" } } as never)
    prismaMock.user.findUnique.mockResolvedValue(null)

    await expect(getEmailSettings()).resolves.toMatchObject({ lastTest: { by: "an admin", outcome: "Unknown result" } })
  })
})
