/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/connections/overseerr", () => ({ buildOverseerrUserIndex: jest.fn(), findOverseerrUserId: jest.fn() }))
jest.mock("@/lib/connections/overseerr-quota", () => ({ getOverseerrUserUsage: jest.fn() }))
jest.mock("@/lib/connections/tautulli-watch-time", () => ({ getAllTimeWatchHours: jest.fn() }))

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildOverseerrUserIndex, findOverseerrUserId } from "@/lib/connections/overseerr"
import { getOverseerrUserUsage } from "@/lib/connections/overseerr-quota"
import { getAllTimeWatchHours } from "@/lib/connections/tautulli-watch-time"
import { getActiveService } from "@/lib/data/active-service"

import { getMemberRequestLimits } from "../member-limits"

const service = { url: "http://x", apiKey: "k" }
const usage = { movie: { limit: 4, days: 7, used: 1, remaining: 3 }, tv: { limit: 2, days: 7, used: 0, remaining: 2 } }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  ;(getActiveService as unknown as jest.Mock).mockResolvedValue(service)
  prismaMock.user.findUnique.mockResolvedValue({ plexUserId: "100", requestTiersExcluded: false } as never)
  prismaMock.config.findUnique.mockResolvedValue({ requestTiersEnabled: true, requestTiers: null } as never)
  ;(buildOverseerrUserIndex as jest.Mock).mockResolvedValue({ ok: true, data: new Map([[100, 7]]) })
  ;(findOverseerrUserId as jest.Mock).mockReturnValue(7)
  ;(getAllTimeWatchHours as jest.Mock).mockResolvedValue({ ok: true, data: 37 })
  ;(getOverseerrUserUsage as jest.Mock).mockResolvedValue({ ok: true, data: usage })
})

describe("getMemberRequestLimits", () => {
  it("gives the tier, progress and usage", async () => {
    const limits = await getMemberRequestLimits("u1")

    expect(limits).toMatchObject({ hours: 37, excluded: false, usage })
    expect(limits?.progress).toMatchObject({ index: 1, hoursToNext: 13, percent: 50 })
    expect(limits?.tiers).toHaveLength(5)
    expect(getOverseerrUserUsage).toHaveBeenCalledWith(service, 7, expect.anything())
    expect(getAllTimeWatchHours).toHaveBeenCalledWith(service, 100, expect.anything())
  })

  it.each([
    ["the feature is off", () => prismaMock.config.findUnique.mockResolvedValue({ requestTiersEnabled: false, requestTiers: null } as never)],
    ["the member has no Plex account", () => prismaMock.user.findUnique.mockResolvedValue({ plexUserId: null, requestTiersExcluded: false } as never)],
    ["Overseerr is not connected", () => (getActiveService as unknown as jest.Mock).mockResolvedValueOnce(service).mockResolvedValueOnce(null)],
  ])("is null when %s", async (_name, arrange) => {
    arrange()
    await expect(getMemberRequestLimits("u1")).resolves.toBeNull()
  })

  it("keeps the usage when Tautulli does not answer", async () => {
    ;(getAllTimeWatchHours as jest.Mock).mockResolvedValue({ ok: false, code: "TIMEOUT" })
    await expect(getMemberRequestLimits("u1")).resolves.toMatchObject({ hours: null, progress: null, usage })
  })

  it("keeps the tier when the member is not in Overseerr", async () => {
    ;(findOverseerrUserId as jest.Mock).mockReturnValue(null)
    const limits = await getMemberRequestLimits("u1")
    expect(limits).toMatchObject({ hours: 37, usage: null })
    expect(getOverseerrUserUsage).not.toHaveBeenCalled()
  })

  it("flags an excluded member", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ plexUserId: "100", requestTiersExcluded: true } as never)
    await expect(getMemberRequestLimits("u1")).resolves.toMatchObject({ excluded: true })
  })
})
