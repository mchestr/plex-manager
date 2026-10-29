/** `hasInvitesPage`: the switch reads as on and the member has a Plex id. */

import { mockReset } from "jest-mock-extended"

import { buildConfig, buildPlexServer, buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { hasInvitesPage } from "@/lib/member/invites-page"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const SWITCH_ON = { affiliateInvitesEnabled: true, affiliateLibrarySectionIds: [1], affiliatePlexMachineId: "machine-1" }

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.config.findUnique.mockResolvedValue(buildConfig(SWITCH_ON))
  prismaMock.plexServer.findFirst.mockResolvedValue(buildPlexServer({ machineIdentifier: "machine-1" }))
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ plexUserId: "42" }))
})

describe("hasInvitesPage", () => {
  it("is true while the switch is on for a member with a Plex id", async () => {
    await expect(hasInvitesPage("user-1")).resolves.toBe(true)
  })

  it("is false while the switch is off, or on for another server", async () => {
    prismaMock.config.findUnique.mockResolvedValueOnce(buildConfig({ ...SWITCH_ON, affiliateInvitesEnabled: false }))
    await expect(hasInvitesPage("user-1")).resolves.toBe(false)
    prismaMock.plexServer.findFirst.mockResolvedValueOnce(buildPlexServer({ machineIdentifier: "machine-2" }))
    await expect(hasInvitesPage("user-1")).resolves.toBe(false)
  })

  it("is false for a member without a Plex id", async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ plexUserId: null }))
    await expect(hasInvitesPage("user-1")).resolves.toBe(false)
  })
})
