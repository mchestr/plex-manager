/**
 * @jest-environment node
 */

/**
 * The admin Problem reports settings loaders: admin only, the breaker, the
 * settings card's values with the newest audited save, and the recycle bins
 * that keep members' swaps from turning On.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { getProblemBreaker, getProblemReportSettingsView, getSwapRecycleBins } from "@/lib/data/problem-report-settings"
import { servicesWithoutRecycleBin } from "@/lib/problem-reports/recycle-bins"

jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/problem-reports/recycle-bins", () => ({ servicesWithoutRecycleBin: jest.fn() }))

const AT = new Date("2026-11-08T20:00:00.000Z")

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(assertAdmin).mockReset().mockResolvedValue({ user: { id: "admin-1" } } as never)
  jest.mocked(servicesWithoutRecycleBin).mockReset()
})

describe("getProblemBreaker", () => {
  it("is when the breaker tripped, or null", async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValueOnce({ breakerTrippedAt: AT } as never).mockResolvedValueOnce(null)

    expect(await getProblemBreaker()).toEqual(AT)
    expect(await getProblemBreaker()).toBeNull()
    expect(assertAdmin).toHaveBeenCalled()
  })
})

describe("getProblemReportSettingsView", () => {
  it("reads the switch, members' swaps and the newest audited save", async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue({
      id: "problem-reports",
      breakerTrippedAt: null,
      enabled: true,
      updatedAt: AT,
      updatedBy: "admin-1",
      automatic: "DRY_RUN",
      automaticSince: AT,
      weeklySwaps: 2,
      titleCooldownDays: 30,
      dailySwapCap: 5,
    })
    prismaMock.auditLog.findFirst.mockResolvedValue({ id: "audit-1", actorUserId: "admin-1", createdAt: AT } as never)
    prismaMock.user.findUnique.mockResolvedValue({ name: "Dana", email: null } as never)

    expect(await getProblemReportSettingsView()).toEqual({
      enabled: true,
      automatic: "DRY_RUN",
      weeklySwaps: 2,
      titleCooldownDays: 30,
      dailySwapCap: 5,
      lastSaved: { at: AT, by: "Dana", eventId: "audit-1" },
    })
    expect(prismaMock.auditLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { type: "PROBLEM_REPORT_SETTINGS_CHANGED" } }))
  })

  it("is off, with the default limits, never saved, without a row", async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue(null)
    prismaMock.auditLog.findFirst.mockResolvedValue(null)

    expect(await getProblemReportSettingsView()).toEqual({ enabled: false, automatic: "OFF", weeklySwaps: 3, titleCooldownDays: 14, dailySwapCap: 10, lastSaved: null })
  })

  it("is for admins only", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(new Error("PM_FORBIDDEN"))

    await expect(getProblemReportSettingsView()).rejects.toThrow("PM_FORBIDDEN")
    expect(prismaMock.problemReportSettings.findUnique).not.toHaveBeenCalled()
  })
})

describe("getSwapRecycleBins", () => {
  it("names the services without a recycle bin, for admins only", async () => {
    jest.mocked(servicesWithoutRecycleBin).mockResolvedValue(["Sonarr"])

    expect(await getSwapRecycleBins()).toEqual(["Sonarr"])

    jest.mocked(assertAdmin).mockRejectedValue(new Error("PM_FORBIDDEN"))
    await expect(getSwapRecycleBins()).rejects.toThrow("PM_FORBIDDEN")
    expect(servicesWithoutRecycleBin).toHaveBeenCalledTimes(1)
  })
})
