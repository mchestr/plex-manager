/**
 * @jest-environment node
 *
 * Tests for actions/account.ts (P6.11): the Rewind ready switch is the
 * season year's `RewindPrefs.notify`, and the time zone is stored under its
 * canonical IANA name or as null for the server zone.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

import { buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { setRewindNotify, setUserTimezone } from "@/actions/account"
import { getSeasonState } from "@/lib/wrapped/season"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/wrapped/season", () => ({ getSeasonState: jest.fn() }))

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

  it("stores null for the server zone", async () => {
    const result = await setUserTimezone({ timeZone: null })

    expect(result).toEqual({ success: true, data: { timeZone: null } })
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: "member-1" }, data: { timezone: null } })
  })

  it("refuses a call without a session", async () => {
    jest.mocked(getServerSession).mockResolvedValue(null)

    const result = await setUserTimezone({ timeZone: "Europe/London" })

    expect(result).toMatchObject({ success: false, code: "UNAUTHENTICATED" })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
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
