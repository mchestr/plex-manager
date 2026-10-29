/** `readWatchHours`: a live Tautulli read stored on the User row, and a tier rise flagged on the APPROVED row. */

import { mockReset } from "jest-mock-extended"

import { buildAffiliateApplication, buildConfig, buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { readWatchHours } from "@/lib/affiliates/watch-hours"
import { getWatchHours } from "@/lib/connections/tautulli-watch-time"
import { getActiveService } from "@/lib/data/active-service"
import type { Tautulli } from "@/lib/generated/prisma/client"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/connections/tautulli-watch-time", () => ({ getWatchHours: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))

const tautulli = { url: "http://tautulli:8181", apiKey: "k" } as Tautulli

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(getActiveService).mockResolvedValue(tautulli)
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ plexUserId: "42" }))
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateTiers: null }))
  jest.mocked(getWatchHours).mockResolvedValue({ ok: true, data: { allTime: 250, last30Days: 30 } })
})

describe("readWatchHours", () => {
  it("stores the hours on the User row", async () => {
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(null)
    await expect(readWatchHours("user-1")).resolves.toEqual({ ok: true, allTime: 250, last30Days: 30 })
    expect(getWatchHours).toHaveBeenCalledWith(tautulli, 42, { signal: expect.any(AbortSignal) })
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { watchHours: 250, watchHoursLast30Days: 30, watchHoursReadAt: expect.any(Date) },
    })
    expect(prismaMock.affiliateApplication.updateMany).not.toHaveBeenCalled()
  })

  it("flags a tier rise on the APPROVED row", async () => {
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "APPROVED", tierIndex: 0 }))
    await readWatchHours("user-1")
    expect(prismaMock.affiliateApplication.updateMany).toHaveBeenCalledWith({
      where: { id: "application-1", status: "APPROVED" },
      data: { tierIndex: 1, tierRaisedAt: expect.any(Date) },
    })
  })

  it("records a first tier or a fall without the rise flag", async () => {
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "APPROVED", tierIndex: 2 }))
    await readWatchHours("user-1")
    expect(prismaMock.affiliateApplication.updateMany).toHaveBeenCalledWith({ where: { id: "application-1", status: "APPROVED" }, data: { tierIndex: 1 } })

    prismaMock.affiliateApplication.updateMany.mockClear()
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "APPROVED", tierIndex: null }))
    await readWatchHours("user-1")
    expect(prismaMock.affiliateApplication.updateMany).toHaveBeenCalledWith({ where: { id: "application-1", status: "APPROVED" }, data: { tierIndex: 1 } })
  })

  it("leaves a PENDING row and an unchanged tier alone", async () => {
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "PENDING" }))
    await readWatchHours("user-1")
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "APPROVED", tierIndex: 1 }))
    await readWatchHours("user-1")
    expect(prismaMock.affiliateApplication.updateMany).not.toHaveBeenCalled()
  })

  it.each([null, "jf-only", "not-a-number"])("is NO_PLEX_ID for plexUserId %p", async (plexUserId) => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ plexUserId: plexUserId === "jf-only" ? null : plexUserId }))
    await expect(readWatchHours("user-1")).resolves.toEqual({ ok: false, code: "NO_PLEX_ID" })
  })

  it("is NOT_CONNECTED without Tautulli", async () => {
    jest.mocked(getActiveService).mockResolvedValue(null)
    await expect(readWatchHours("user-1")).resolves.toEqual({ ok: false, code: "NOT_CONNECTED" })
  })

  it("is UNAVAILABLE when Tautulli fails, and stores nothing", async () => {
    jest.mocked(getWatchHours).mockResolvedValue({ ok: false, code: "TIMEOUT" } as Awaited<ReturnType<typeof getWatchHours>>)
    await expect(readWatchHours("user-1")).resolves.toEqual({ ok: false, code: "UNAVAILABLE" })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })
})
