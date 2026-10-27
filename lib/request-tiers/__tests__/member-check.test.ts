/**
 * @jest-environment node
 */

/**
 * One member's request tier, checked live for the admin's user page, and the
 * "Update Overseerr" write: the same tier and quota rules as the daily sync,
 * with each failed step named.
 */

jest.mock("server-only", () => ({}))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/connections/overseerr", () => ({ buildOverseerrUserIndex: jest.fn(), findOverseerrUserId: jest.fn() }))
jest.mock("@/lib/connections/overseerr-quota", () => ({ getOverseerrQuotaMember: jest.fn(), setOverseerrUserQuota: jest.fn() }))
jest.mock("@/lib/connections/tautulli-watch-time", () => ({ getAllTimeWatchHours: jest.fn() }))

import { mockReset } from "jest-mock-extended"

import { buildConfig, buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildOverseerrUserIndex, findOverseerrUserId } from "@/lib/connections/overseerr"
import { getOverseerrQuotaMember, setOverseerrUserQuota } from "@/lib/connections/overseerr-quota"
import { getAllTimeWatchHours } from "@/lib/connections/tautulli-watch-time"
import { getActiveService } from "@/lib/data/active-service"
import type { Quota } from "@/lib/request-tiers/quota"

import { applyMemberTier, checkMemberTier } from "../member-check"

const service = { url: "http://x", apiKey: "k" }
/** Tier 2 of the default table: more than 24 hours. */
const TIER_2: Quota = { movieQuotaLimit: 4, movieQuotaDays: 7, tvQuotaLimit: 2, tvQuotaDays: 7 }
const member = (quota: Partial<Quota> = {}, bypassesQuota = false) => ({
  id: 7,
  plexId: 100,
  name: "Sam",
  ...TIER_2,
  ...quota,
  bypassesQuota,
})

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getActiveService).mockResolvedValue(service as never)
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ plexUserId: "100" }))
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ requestTiersEnabled: true }))
  jest.mocked(buildOverseerrUserIndex).mockResolvedValue({ ok: true, data: new Map([[100, 7]]) })
  jest.mocked(findOverseerrUserId).mockReturnValue(7)
  jest.mocked(getAllTimeWatchHours).mockResolvedValue({ ok: true, data: 37 })
  jest.mocked(getOverseerrQuotaMember).mockResolvedValue({ ok: true, data: member() })
  jest.mocked(setOverseerrUserQuota).mockResolvedValue({ ok: true, data: {} })
})

describe("checkMemberTier", () => {
  it("is in sync when Overseerr has the tier's quota", async () => {
    const check = await checkMemberTier("u1")

    expect(check).toMatchObject({ status: "in-sync", enabled: true, hours: 37, tierQuota: TIER_2, problems: [] })
    expect(check?.progress).toMatchObject({ index: 1, hoursToNext: 13 })
    expect(getAllTimeWatchHours).toHaveBeenCalledWith(service, 100, expect.anything())
    expect(getOverseerrQuotaMember).toHaveBeenCalledWith(service, 7, expect.anything())
  })

  it("is out of sync when Overseerr has another quota, or none of its own", async () => {
    jest.mocked(getOverseerrQuotaMember).mockResolvedValue({ ok: true, data: member({ movieQuotaLimit: 2, tvQuotaLimit: 1 }) })
    await expect(checkMemberTier("u1")).resolves.toMatchObject({ status: "out-of-sync" })

    jest.mocked(getOverseerrQuotaMember).mockResolvedValue({
      ok: true,
      data: member({ movieQuotaLimit: null, movieQuotaDays: null, tvQuotaLimit: null, tvQuotaDays: null }),
    })
    await expect(checkMemberTier("u1")).resolves.toMatchObject({ status: "out-of-sync" })
  })

  it("names each step that failed", async () => {
    jest.mocked(getAllTimeWatchHours).mockResolvedValue({ ok: false, code: "TIMEOUT" })
    jest.mocked(buildOverseerrUserIndex).mockResolvedValue({ ok: false, code: "NETWORK" })

    await expect(checkMemberTier("u1")).resolves.toMatchObject({
      status: "unknown",
      hours: null,
      overseerr: null,
      problems: ["Tautulli did not respond in time", "Could not reach Overseerr"],
    })
  })

  it("explains a member Overseerr does not know", async () => {
    jest.mocked(findOverseerrUserId).mockReturnValue(null)

    const check = await checkMemberTier("u1")

    expect(check).toMatchObject({ status: "unknown", hours: 37, overseerr: null })
    expect(check?.problems[0]).toMatch(/no user for this member's Plex account/)
    expect(getOverseerrQuotaMember).not.toHaveBeenCalled()
  })

  it("puts a hand-set member and an Overseerr admin before the comparison", async () => {
    jest.mocked(getOverseerrQuotaMember).mockResolvedValue({ ok: true, data: member({ movieQuotaLimit: 1 }, true) })
    await expect(checkMemberTier("u1")).resolves.toMatchObject({ status: "bypass" })

    prismaMock.user.findUnique.mockResolvedValue(buildUser({ plexUserId: "100", requestTiersExcluded: true }))
    await expect(checkMemberTier("u1")).resolves.toMatchObject({ status: "excluded" })
  })

  it("checks while the daily sync is off", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ requestTiersEnabled: false }))
    await expect(checkMemberTier("u1")).resolves.toMatchObject({ status: "in-sync", enabled: false })
  })

  it("says so without calling anything when a service is not connected", async () => {
    jest.mocked(getActiveService).mockResolvedValueOnce(service as never).mockResolvedValueOnce(null)

    await expect(checkMemberTier("u1")).resolves.toMatchObject({ status: "not-connected", problems: [] })
    expect(getAllTimeWatchHours).not.toHaveBeenCalled()
    expect(buildOverseerrUserIndex).not.toHaveBeenCalled()
  })

  it.each([
    ["has no Plex account", null],
    ["has a Plex id the sync cannot match", "test-plex-user-id"],
  ])("is null when the member %s", async (_name, plexUserId) => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ plexUserId }))
    await expect(checkMemberTier("u1")).resolves.toBeNull()
  })
})

describe("applyMemberTier", () => {
  it("writes the tier's quota to the member's Overseerr user", async () => {
    jest.mocked(getOverseerrQuotaMember).mockResolvedValue({ ok: true, data: member({ movieQuotaLimit: 2, tvQuotaLimit: 1 }) })

    await expect(applyMemberTier("u1")).resolves.toEqual({ ok: true, quota: TIER_2 })
    expect(setOverseerrUserQuota).toHaveBeenCalledWith(service, 7, TIER_2, expect.anything())
  })

  it("writes nothing when Overseerr already has it", async () => {
    await expect(applyMemberTier("u1")).resolves.toEqual({ ok: true, quota: null })
    expect(setOverseerrUserQuota).not.toHaveBeenCalled()
  })

  it("reports a write Overseerr refused", async () => {
    jest.mocked(getOverseerrQuotaMember).mockResolvedValue({ ok: true, data: member({ movieQuotaLimit: 2 }) })
    jest.mocked(setOverseerrUserQuota).mockResolvedValue({ ok: false, code: "HTTP", status: 403 })

    await expect(applyMemberTier("u1")).resolves.toEqual({ ok: false, code: "UPSTREAM_UNAVAILABLE", message: "Overseerr returned HTTP 403" })
  })

  it.each([
    ["a hand-set member", () => prismaMock.user.findUnique.mockResolvedValue(buildUser({ plexUserId: "100", requestTiersExcluded: true }))],
    ["an Overseerr admin", () => jest.mocked(getOverseerrQuotaMember).mockResolvedValue({ ok: true, data: member({ movieQuotaLimit: 1 }, true) })],
  ])("refuses %s", async (_name, arrange) => {
    arrange()
    await expect(applyMemberTier("u1")).resolves.toMatchObject({ ok: false, code: "CONFLICT" })
    expect(setOverseerrUserQuota).not.toHaveBeenCalled()
  })

  it("passes on the first failed step", async () => {
    jest.mocked(getAllTimeWatchHours).mockResolvedValue({ ok: false, code: "NETWORK" })
    await expect(applyMemberTier("u1")).resolves.toEqual({ ok: false, code: "UPSTREAM_UNAVAILABLE", message: "Could not reach Tautulli" })
  })

  it("is not found for a member with no Plex account", async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ plexUserId: null }))
    await expect(applyMemberTier("u1")).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" })
  })
})
