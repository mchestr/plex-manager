/**
 * @jest-environment node
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/connections/overseerr-quota", () => ({ listOverseerrQuotaUsers: jest.fn(), setOverseerrUserQuota: jest.fn() }))
jest.mock("@/lib/connections/tautulli-watch-time", () => ({ listTautulliUserIds: jest.fn(), getAllTimeWatchHours: jest.fn() }))

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { listOverseerrQuotaUsers, setOverseerrUserQuota } from "@/lib/connections/overseerr-quota"
import { getAllTimeWatchHours, listTautulliUserIds } from "@/lib/connections/tautulli-watch-time"
import { getActiveService } from "@/lib/data/active-service"
import type { RequestTierEntry } from "@/lib/request-tiers/entries"
import type { OverseerrQuotaUser } from "@/lib/request-tiers/match"

import { runRequestTierSync } from "../run"

const service = { url: "http://x", apiKey: "k" }
const activeService = getActiveService as unknown as jest.Mock
const overseerrUsers = listOverseerrQuotaUsers as jest.Mock
const tautulliUsers = listTautulliUserIds as jest.Mock
const hoursOf = getAllTimeWatchHours as jest.Mock
const writeQuota = setOverseerrUserQuota as jest.Mock

const member = (id: number, plexId: number | null, quota: [number | null, number | null] = [null, null]): OverseerrQuotaUser => ({
  id,
  plexId,
  name: `User ${id}`,
  movieQuotaLimit: quota[0],
  movieQuotaDays: quota[1],
  tvQuotaLimit: quota[0] === null ? null : 1,
  tvQuotaDays: quota[1],
})

function storedEntries(): RequestTierEntry[] {
  const call = prismaMock.requestTierRun.create.mock.calls[0]![0]
  return call.data.entries as unknown as RequestTierEntry[]
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  activeService.mockResolvedValue(service)
  prismaMock.config.findUnique.mockResolvedValue({ requestTiersEnabled: true, requestTiers: null } as never)
  prismaMock.user.findMany.mockResolvedValue([])
  prismaMock.requestTierRun.findMany.mockResolvedValue([])
  prismaMock.requestTierRun.create.mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({ id: "run1", ...data })) as never)
  tautulliUsers.mockResolvedValue({ ok: true, data: [100, 200, 300] })
  writeQuota.mockResolvedValue({ ok: true, data: {} })
})

describe("runRequestTierSync", () => {
  it("does nothing on a schedule while the sync is off", async () => {
    prismaMock.config.findUnique.mockResolvedValue({ requestTiersEnabled: false, requestTiers: null } as never)
    await expect(runRequestTierSync("scheduled")).resolves.toBeNull()
    expect(overseerrUsers).not.toHaveBeenCalled()
  })

  it("runs for an admin even while the sync is off", async () => {
    prismaMock.config.findUnique.mockResolvedValue({ requestTiersEnabled: false, requestTiers: null } as never)
    overseerrUsers.mockResolvedValue({ ok: true, data: [member(1, 100)] })
    hoursOf.mockResolvedValue({ ok: true, data: 10 })
    const result = await runRequestTierSync("admin")
    expect(result).toMatchObject({ updated: 1 })
  })

  it("writes the tier's quota and records old and new", async () => {
    overseerrUsers.mockResolvedValue({ ok: true, data: [member(1, 100)] })
    hoursOf.mockResolvedValue({ ok: true, data: 60 })
    const result = await runRequestTierSync("scheduled")

    expect(writeQuota).toHaveBeenCalledWith(service, 1, { movieQuotaLimit: 6, movieQuotaDays: 7, tvQuotaLimit: 3, tvQuotaDays: 7 }, expect.anything())
    expect(result).toMatchObject({ runId: "run1", updated: 1, unchanged: 0, failed: 0 })
    expect(storedEntries()[0]).toMatchObject({
      overseerrUserId: 1,
      hours: 60,
      tier: 3,
      status: "updated",
      oldQuota: { movieQuotaLimit: null },
      newQuota: { movieQuotaLimit: 6, tvQuotaLimit: 3 },
    })
  })

  it("does not call Overseerr when the quota already matches", async () => {
    overseerrUsers.mockResolvedValue({ ok: true, data: [{ ...member(1, 100, [4, 7]), tvQuotaLimit: 2 }] })
    hoursOf.mockResolvedValue({ ok: true, data: 30 })
    const result = await runRequestTierSync("scheduled")
    expect(writeQuota).not.toHaveBeenCalled()
    expect(result).toMatchObject({ updated: 0, unchanged: 1 })
  })

  it("leaves an excluded member alone and does not read their watch time", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ plexUserId: "100" }] as never)
    overseerrUsers.mockResolvedValue({ ok: true, data: [member(1, 100)] })
    const result = await runRequestTierSync("scheduled")
    expect(hoursOf).not.toHaveBeenCalled()
    expect(writeQuota).not.toHaveBeenCalled()
    expect(result).toMatchObject({ skipped: 1 })
    expect(storedEntries()[0]).toMatchObject({ status: "excluded", newQuota: null })
  })

  it("skips Overseerr users with no Plex id or no Tautulli user", async () => {
    overseerrUsers.mockResolvedValue({ ok: true, data: [member(1, null), member(2, 999)] })
    await runRequestTierSync("scheduled")
    expect(hoursOf).not.toHaveBeenCalled()
    expect(storedEntries()).toEqual([])
  })

  it("carries on when one member fails", async () => {
    overseerrUsers.mockResolvedValue({ ok: true, data: [member(1, 100), member(2, 200)] })
    hoursOf.mockResolvedValueOnce({ ok: false, code: "TIMEOUT" }).mockResolvedValueOnce({ ok: true, data: 120 })
    const result = await runRequestTierSync("scheduled")
    expect(result).toMatchObject({ failed: 1, updated: 1 })
    expect(writeQuota).toHaveBeenCalledTimes(1)
    expect(writeQuota).toHaveBeenCalledWith(service, 2, expect.objectContaining({ movieQuotaLimit: 10 }), expect.anything())
  })

  it("counts a failed Overseerr write as failed", async () => {
    overseerrUsers.mockResolvedValue({ ok: true, data: [member(1, 100)] })
    hoursOf.mockResolvedValue({ ok: true, data: 5 })
    writeQuota.mockResolvedValue({ ok: false, code: "HTTP", status: 500 })
    await expect(runRequestTierSync("scheduled")).resolves.toMatchObject({ failed: 1, updated: 0 })
  })

  it("uses the stored tiers", async () => {
    prismaMock.config.findUnique.mockResolvedValue({
      requestTiersEnabled: true,
      requestTiers: [{ overHours: 0, movieLimit: 9, tvLimit: 8, days: 30 }],
    } as never)
    overseerrUsers.mockResolvedValue({ ok: true, data: [member(1, 100)] })
    hoursOf.mockResolvedValue({ ok: true, data: 1 })
    await runRequestTierSync("scheduled")
    expect(writeQuota).toHaveBeenCalledWith(service, 1, { movieQuotaLimit: 9, movieQuotaDays: 30, tvQuotaLimit: 8, tvQuotaDays: 30 }, expect.anything())
  })

  it("records a run that was stopped early instead of passing it off as complete", async () => {
    const controller = new AbortController()
    overseerrUsers.mockResolvedValue({ ok: true, data: Array.from({ length: 12 }, (_, i) => member(i + 1, 100)) })
    hoursOf.mockImplementation(async () => {
      controller.abort()
      return { ok: true, data: 1 }
    })
    const result = await runRequestTierSync("scheduled", { signal: controller.signal })
    expect(result?.error).toMatch(/Stopped before every member/)
    expect(storedEntries()).toHaveLength(5)
  })

  it("records why a run could not start", async () => {
    activeService.mockResolvedValue(null)
    const result = await runRequestTierSync("scheduled")
    expect(result?.error).toMatch(/Tautulli and Overseerr/)
    expect(overseerrUsers).not.toHaveBeenCalled()
  })

  it("records an Overseerr failure instead of a partial run", async () => {
    overseerrUsers.mockResolvedValue({ ok: false, code: "PAGE_LIMIT" })
    const result = await runRequestTierSync("scheduled")
    expect(result?.error).toBe("Overseerr did not answer")
    expect(writeQuota).not.toHaveBeenCalled()
  })

  it("keeps only the newest runs", async () => {
    overseerrUsers.mockResolvedValue({ ok: true, data: [] })
    prismaMock.requestTierRun.findMany.mockResolvedValue([{ id: "old1" }, { id: "old2" }] as never)
    await runRequestTierSync("scheduled")
    expect(prismaMock.requestTierRun.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["old1", "old2"] } } })
  })
})
