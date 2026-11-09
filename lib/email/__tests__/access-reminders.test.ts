/**
 * @jest-environment node
 *
 * The Access reminders switch (lib/email/access-reminders.ts): a real
 * change is audited, a save that changes nothing is not, and the Email card
 * shows only while email is set up and the warning emails are on.
 */

import { mockReset } from "jest-mock-extended"

import { buildInactivitySettings, buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { accessRemindersOffered, saveAccessReminders } from "@/lib/email/access-reminders"
import { emailConfigured } from "@/lib/email/config"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/email/config", () => ({ emailConfigured: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
})

describe("saveAccessReminders", () => {
  it("turns the emails off and audits where", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 })

    await expect(saveAccessReminders("member-1", { enabled: false, via: "one_click" })).resolves.toBe("changed")

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "member-1", inactivityEmailsOff: false },
      data: { inactivityEmailsOff: true },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.EMAIL_PREFERENCE_CHANGED, "member-1", {
      targetUserId: "member-1",
      enabled: false,
      via: "one_click",
    })
  })

  it("turns the emails on from Account", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 })

    await expect(saveAccessReminders("member-1", { enabled: true, via: "account" })).resolves.toBe("changed")

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "member-1", inactivityEmailsOff: true },
      data: { inactivityEmailsOff: false },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.EMAIL_PREFERENCE_CHANGED, "member-1", {
      targetUserId: "member-1",
      enabled: true,
      via: "account",
    })
  })

  it("writes no audit row when the value is already as asked", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "member-1" }))

    await expect(saveAccessReminders("member-1", { enabled: false, via: "link" })).resolves.toBe("unchanged")
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("says when the member is gone", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.user.findUnique.mockResolvedValue(null)

    await expect(saveAccessReminders("gone", { enabled: false, via: "link" })).resolves.toBe("no_member")
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe("accessRemindersOffered", () => {
  it("is false while email is not set up, without a database read", async () => {
    jest.mocked(emailConfigured).mockReturnValue(false)

    await expect(accessRemindersOffered()).resolves.toBe(false)
    expect(prismaMock.inactivitySettings.findUnique).not.toHaveBeenCalled()
  })

  it.each([
    ["no settings row", null, false],
    ["warning emails off", buildInactivitySettings({ warningsEnabled: false }), false],
    ["warning emails on", buildInactivitySettings({ warningsEnabled: true }), true],
  ])("with email set up and %s, is %s", async (_case, row, expected) => {
    jest.mocked(emailConfigured).mockReturnValue(true)
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(row)

    await expect(accessRemindersOffered()).resolves.toBe(expected)
    expect(prismaMock.inactivitySettings.findUnique).toHaveBeenCalledWith({ where: { id: "inactivity" }, select: { warningsEnabled: true } })
  })
})
