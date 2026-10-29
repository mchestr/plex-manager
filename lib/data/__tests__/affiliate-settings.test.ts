import { mockReset } from "jest-mock-extended"

import { buildConfig, buildPlexServer } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { getPlexUsers } from "@/lib/connections/plex"
import { withMachineIdentifier } from "@/lib/connections/plex-machine-id"
import type { PlexTvUser } from "@/lib/connections/plex-tv-users"
import { getAffiliateSettingsView, getPlexShareCount } from "@/lib/data/affiliate-settings"
import { getActiveService } from "@/lib/data/active-service"

jest.mock("server-only", () => ({}))
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/connections/plex", () => ({ getPlexUsers: jest.fn() }))
jest.mock("@/lib/connections/plex-machine-id", () => ({ withMachineIdentifier: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))

const user = (id: string, servers: PlexTvUser["servers"]): PlexTvUser => ({ id, username: id, title: id, home: false, restricted: false, servers })
const share = (machineIdentifier: string, pending = false) => ({ machineIdentifier, owned: false, pending })

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(assertAdmin).mockResolvedValue({} as never)
  jest.mocked(getActiveService).mockResolvedValue(buildPlexServer({ machineIdentifier: "m1" }) as never)
  jest.mocked(withMachineIdentifier).mockImplementation(async (server) => server)
})

describe("getAffiliateSettingsView", () => {
  it("refuses a non-admin before reading", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(new Error("PM_FORBIDDEN"))
    await expect(getAffiliateSettingsView()).rejects.toThrow("PM_FORBIDDEN")
    expect(prismaMock.config.findUnique).not.toHaveBeenCalled()
  })

  it("reads the stored settings", async () => {
    prismaMock.config.findUnique.mockResolvedValue(
      buildConfig({ affiliateInvitesEnabled: true, affiliateTiers: [{ overHours: 10, invites: 2 }], affiliateServerCap: null, affiliateLibrarySectionIds: [3, 4] })
    )
    await expect(getAffiliateSettingsView()).resolves.toEqual({ enabled: true, tiers: [{ overHours: 10, invites: 2 }], cap: null, libraryIds: [3, 4] })
  })

  it("falls back to the defaults without a Config row or with a bad library list", async () => {
    prismaMock.config.findUnique.mockResolvedValue(null)
    await expect(getAffiliateSettingsView()).resolves.toMatchObject({ enabled: false, cap: 10, libraryIds: [] })
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateLibrarySectionIds: "all" }))
    await expect(getAffiliateSettingsView()).resolves.toMatchObject({ libraryIds: [] })
  })
})

describe("getPlexShareCount", () => {
  it("counts the users with an accepted share of this server", async () => {
    jest.mocked(getPlexUsers).mockResolvedValue({
      success: true,
      data: [user("a", [share("m1")]), user("b", [share("m1", true)]), user("c", [share("m2")]), user("d", [share("m2"), share("m1")])],
    })
    await expect(getPlexShareCount()).resolves.toBe(2)
  })

  it.each([
    ["no Plex server is set up", () => jest.mocked(getActiveService).mockResolvedValue(null)],
    ["the server has no machine id", () => jest.mocked(getActiveService).mockResolvedValue(buildPlexServer({ machineIdentifier: null }) as never)],
    ["plex.tv does not answer", () => jest.mocked(getPlexUsers).mockResolvedValue({ success: false, error: "down" })],
    ["the read throws", () => jest.mocked(getPlexUsers).mockRejectedValue(new Error("boom"))],
  ])("is null when %s", async (_label, arrange) => {
    arrange()
    await expect(getPlexShareCount()).resolves.toBeNull()
  })
})
