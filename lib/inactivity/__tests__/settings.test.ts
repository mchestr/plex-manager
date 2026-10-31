/**
 * @jest-environment node
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

import { mockReset } from "jest-mock-extended"

import { buildInactivitySettings } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getInactivitySettings, INACTIVITY_DEFAULTS } from "@/lib/inactivity/settings"

beforeEach(() => mockReset(prismaMock))

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
