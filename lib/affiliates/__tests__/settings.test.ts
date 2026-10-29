/**
 * `readAffiliateSettings`: the switch reads as on only while it is turned on,
 * has libraries, and the active Plex server is the one it was turned on for.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildConfig } from "@/__tests__/helpers/factories"
import { readAffiliateSettings } from "@/lib/affiliates/settings"
import type { Config, PlexServer } from "@/lib/generated/prisma/client"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const ON: Partial<Config> = { affiliateInvitesEnabled: true, affiliateLibrarySectionIds: [1, 2], affiliatePlexMachineId: "machine-1" }

function arrange(config: Partial<Config> | null, machineIdentifier: string | null = "machine-1") {
  prismaMock.config.findUnique.mockResolvedValue(config && buildConfig({ ...ON, ...config }))
  prismaMock.plexServer.findFirst.mockResolvedValue({ machineIdentifier } as PlexServer)
}

beforeEach(() => mockReset(prismaMock))

describe("readAffiliateSettings", () => {
  it("is on with the library list while every condition holds", async () => {
    arrange({})
    await expect(readAffiliateSettings()).resolves.toEqual({ on: true, librarySectionIds: [1, 2] })
    expect(prismaMock.plexServer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true }, orderBy: { updatedAt: "desc" } })
    )
  })

  it.each<[string, Partial<Config>, string | null]>([
    ["turned off", { affiliateInvitesEnabled: false }, "machine-1"],
    ["with an empty library list", { affiliateLibrarySectionIds: [] }, "machine-1"],
    ["with a malformed library list", { affiliateLibrarySectionIds: ["1"] }, "machine-1"],
    ["without a stored server", { affiliatePlexMachineId: null }, "machine-1"],
    ["after the active server changed", {}, "machine-2"],
    ["while the active server has no machine id", {}, null],
  ])("is off %s", async (_label, config, machine) => {
    arrange(config, machine)
    await expect(readAffiliateSettings()).resolves.toMatchObject({ on: false })
  })

  it("is off without a Config row", async () => {
    arrange(null)
    await expect(readAffiliateSettings()).resolves.toEqual({ on: false, librarySectionIds: [] })
  })
})
