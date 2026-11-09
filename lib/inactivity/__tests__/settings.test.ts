/**
 * @jest-environment node
 */

const mockWarn = jest.fn()
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args) }),
}))

import { mockReset } from "jest-mock-extended"

import { buildInactivitySettings } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getInactivitySettings, getInactivityWarnings, INACTIVITY_DEFAULTS, WARNING_DEFAULTS } from "@/lib/inactivity/settings"

beforeEach(() => {
  mockReset(prismaMock)
  mockWarn.mockReset()
})

describe("getInactivitySettings", () => {
  it("reads the one settings row", async () => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ enabled: true, thresholdDays: 90 }))

    await expect(getInactivitySettings()).resolves.toMatchObject({ enabled: true, thresholdDays: 90 })
    expect(prismaMock.inactivitySettings.findUnique).toHaveBeenCalledWith({
      where: { id: "inactivity" },
      select: { enabled: true, thresholdDays: true },
    })
  })

  it("is off, at the schema's 180 days, before an admin saves", async () => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(null)

    await expect(getInactivitySettings()).resolves.toEqual({ enabled: false, thresholdDays: 180 })
    expect(INACTIVITY_DEFAULTS).toEqual({ enabled: false, thresholdDays: 180 })
  })
})

describe("getInactivityWarnings", () => {
  it("reads the switch and the leads", async () => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ warningsEnabled: true, warningDays: [30, 7, 1] }))

    await expect(getInactivityWarnings()).resolves.toEqual({ warningsEnabled: true, warningDays: [30, 7, 1] })
    expect(prismaMock.inactivitySettings.findUnique).toHaveBeenCalledWith({
      where: { id: "inactivity" },
      select: { warningsEnabled: true, warningDays: true },
    })
  })

  it("is off, at 30, 7 and 1 days, before an admin saves", async () => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(null)

    await expect(getInactivityWarnings()).resolves.toEqual({ warningsEnabled: false, warningDays: [30, 7, 1] })
    expect(WARNING_DEFAULTS).toEqual({ warningsEnabled: false, warningDays: [30, 7, 1] })
  })

  it("sorts the leads largest first and drops repeats and values below one day", async () => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ warningsEnabled: true, warningDays: [1, 7, 0, 30, 7, -2] }))

    await expect(getInactivityWarnings()).resolves.toEqual({ warningsEnabled: true, warningDays: [30, 7, 1] })
  })

  it.each([[[]], [[0, -3]]])("keeps warnings on at the default leads with no valid lead left (%j), and logs it", async (warningDays) => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ warningsEnabled: true, warningDays }))

    await expect(getInactivityWarnings()).resolves.toEqual({ warningsEnabled: true, warningDays: [30, 7, 1] })
    expect(mockWarn).toHaveBeenCalledWith("inactivity.warning_days_invalid", { fallback: [30, 7, 1] })
  })

  it("keeps warnings off with no valid lead left, and logs nothing", async () => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ warningsEnabled: false, warningDays: [] }))

    await expect(getInactivityWarnings()).resolves.toEqual({ warningsEnabled: false, warningDays: [30, 7, 1] })
    expect(mockWarn).not.toHaveBeenCalled()
  })
})
