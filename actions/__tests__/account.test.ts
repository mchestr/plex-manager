/**
 * @jest-environment node
 *
 * Tests for actions/account.ts (P6.11): the Rewind ready switch is the
 * season year's `RewindPrefs.notify`, the time zone is stored under its
 * canonical IANA name, the browser's zone fills only an empty one, and the
 * Access reminders switch is `User.inactivityEmailsOff`, audited on a change.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

import { buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { adoptBrowserTimezone, setAccessReminders, setRewindNotify, setUserTimezone } from "@/actions/account"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { getSeasonState } from "@/lib/wrapped/season"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/wrapped/season", () => ({ getSeasonState: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))

const SEASON = {
  seasonYear: 2026,
  isOpen: false,
  opensAt: new Date("2026-12-01T06:00:00Z"),
  closesAt: new Date("2027-02-01T06:00:00Z"),
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "member-1", isAdmin: false } })
  jest.mocked(getSeasonState).mockResolvedValue(SEASON)
  prismaMock.user.update.mockResolvedValue(buildUser({ id: "member-1" }))
})

describe("setUserTimezone", () => {
  it("refuses a zone that is not on the list", async () => {
    const result = await setUserTimezone({ timeZone: "Mars/Olympus" })

    expect(result).toMatchObject({ success: false, code: "VALIDATION" })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it("stores an alias under its canonical name", async () => {
    const result = await setUserTimezone({ timeZone: "US/Pacific" })

    expect(result).toEqual({ success: true, data: { timeZone: "America/Los_Angeles" } })
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "member-1" },
      data: { timezone: "America/Los_Angeles" },
    })
    expect(revalidatePath).toHaveBeenCalledWith("/account")
  })

  it("refuses a call without a session", async () => {
    jest.mocked(getServerSession).mockResolvedValue(null)

    const result = await setUserTimezone({ timeZone: "Europe/London" })

    expect(result).toMatchObject({ success: false, code: "UNAUTHENTICATED" })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })
})

describe("adoptBrowserTimezone", () => {
  beforeEach(() => prismaMock.user.updateMany.mockResolvedValue({ count: 1 }))

  it("saves the canonical zone only while none is saved", async () => {
    const result = await adoptBrowserTimezone({ timeZone: "US/Pacific" })

    expect(result).toEqual({ success: true, data: null })
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "member-1", timezone: null },
      data: { timezone: "America/Los_Angeles" },
    })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it("leaves the member on the server zone when the browser's zone is not on the list", async () => {
    const result = await adoptBrowserTimezone({ timeZone: "+05:00" })

    expect(result).toMatchObject({ success: false, code: "VALIDATION" })
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })

  it("refuses a call without a session", async () => {
    jest.mocked(getServerSession).mockResolvedValue(null)

    const result = await adoptBrowserTimezone({ timeZone: "Europe/London" })

    expect(result).toMatchObject({ success: false, code: "UNAUTHENTICATED" })
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })
})

describe("setRewindNotify", () => {
  it("upserts the signed-in member's prefs for the season year", async () => {
    const result = await setRewindNotify({ notify: false })

    expect(result).toEqual({ success: true, data: { notify: false } })
    expect(prismaMock.rewindPrefs.upsert).toHaveBeenCalledTimes(1)
    expect(prismaMock.rewindPrefs.upsert).toHaveBeenCalledWith({
      where: { userId_year: { userId: "member-1", year: 2026 } },
      create: { userId: "member-1", year: 2026, notify: false },
      update: { notify: false },
    })
    expect(revalidatePath).toHaveBeenCalledWith("/account")
  })

  it("touches only the caller's row, whatever the input carries", async () => {
    const result = await setRewindNotify({ notify: true, userId: "member-2" } as { notify: boolean })

    expect(result).toMatchObject({ success: false, code: "VALIDATION" })
    expect(prismaMock.rewindPrefs.upsert).not.toHaveBeenCalled()

    await setRewindNotify({ notify: true })
    const [call] = prismaMock.rewindPrefs.upsert.mock.calls
    expect(call[0].where).toEqual({ userId_year: { userId: "member-1", year: 2026 } })
    expect(prismaMock.rewindPrefs.updateMany).not.toHaveBeenCalled()
  })

  it("refuses a call without a session", async () => {
    jest.mocked(getServerSession).mockResolvedValue(null)

    const result = await setRewindNotify({ notify: true })

    expect(result).toMatchObject({ success: false, code: "UNAUTHENTICATED" })
    expect(prismaMock.rewindPrefs.upsert).not.toHaveBeenCalled()
  })
})

describe("setAccessReminders", () => {
  it.each([
    [false, true],
    [true, false],
  ])("with enabled %s, stores inactivityEmailsOff %s for the caller and audits it", async (enabled, off) => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 })

    const result = await setAccessReminders({ enabled })

    expect(result).toEqual({ success: true, data: { enabled } })
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "member-1", inactivityEmailsOff: !off },
      data: { inactivityEmailsOff: off },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.EMAIL_PREFERENCE_CHANGED, "member-1", {
      targetUserId: "member-1",
      enabled,
      via: "account",
    })
    expect(revalidatePath).toHaveBeenCalledWith("/account")
  })

  it("writes no audit row when nothing changes", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "member-1", inactivityEmailsOff: true }))

    await expect(setAccessReminders({ enabled: false })).resolves.toEqual({ success: true, data: { enabled: false } })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("touches only the caller's row, whatever the input carries", async () => {
    const result = await setAccessReminders({ enabled: true, userId: "member-2" } as { enabled: boolean })

    expect(result).toMatchObject({ success: false, code: "VALIDATION" })
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })

  it("refuses a call without a session", async () => {
    jest.mocked(getServerSession).mockResolvedValue(null)

    await expect(setAccessReminders({ enabled: true })).resolves.toMatchObject({ success: false, code: "UNAUTHENTICATED" })
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })
})
