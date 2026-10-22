/**
 * @jest-environment node
 *
 * updateGlobalWatchlistSyncSettings (P11.2): the save brings the BullMQ
 * schedule in line at once, so no restart is needed.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { updateGlobalWatchlistSyncSettings } from "@/actions/admin/watchlist"
import type { Overseerr } from "@/lib/generated/prisma/client"
import { ensureWatchlistSchedule } from "@/lib/watchlist/schedule"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn(), updateTag: jest.fn(), unstable_cache: (fn: unknown) => fn }))
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: jest.fn(),
}))
jest.mock("@/lib/watchlist/schedule", () => ({ ensureWatchlistSchedule: jest.fn() }))

const ON = { watchlistSyncEnabled: true, watchlistSyncIntervalMinutes: 30 }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true } })
  prismaMock.overseerr.findFirst.mockResolvedValue({ id: "o1" } as Overseerr)
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ watchlistSyncEnabled: false }))
  prismaMock.config.upsert.mockResolvedValue(buildConfig(ON))
  jest.mocked(ensureWatchlistSchedule).mockResolvedValue({ ok: true, state: "scheduled", intervalMinutes: 30 })
})

describe("updateGlobalWatchlistSyncSettings", () => {
  it("saves the settings, then ensures the schedule", async () => {
    await expect(updateGlobalWatchlistSyncSettings(ON)).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.config.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { ...ON, updatedBy: "admin-1" } }))
    expect(ensureWatchlistSchedule).toHaveBeenCalledTimes(1)
    expect(prismaMock.config.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(ensureWatchlistSchedule).mock.invocationCallOrder[0]
    )
  })

  it("ensures the schedule when sync is turned off too", async () => {
    jest.mocked(ensureWatchlistSchedule).mockResolvedValue({ ok: true, state: "removed" })

    await expect(
      updateGlobalWatchlistSyncSettings({ watchlistSyncEnabled: false, watchlistSyncIntervalMinutes: 60 })
    ).resolves.toMatchObject({ success: true })
    expect(ensureWatchlistSchedule).toHaveBeenCalledTimes(1)
  })

  it("reports a queue that did not answer, after saving", async () => {
    jest.mocked(ensureWatchlistSchedule).mockResolvedValue({ ok: false, code: "TIMEOUT" })

    await expect(updateGlobalWatchlistSyncSettings(ON)).resolves.toMatchObject({
      success: false,
      code: "UPSTREAM_UNAVAILABLE",
      error: expect.stringContaining("Settings saved"),
    })
    expect(prismaMock.config.upsert).toHaveBeenCalledTimes(1)
  })

  it("saves nothing and schedules nothing without an active Overseerr", async () => {
    prismaMock.overseerr.findFirst.mockResolvedValue(null)

    await expect(updateGlobalWatchlistSyncSettings(ON)).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
    expect(ensureWatchlistSchedule).not.toHaveBeenCalled()
  })

  it("refuses a member", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "member-1", isAdmin: false } })

    await expect(updateGlobalWatchlistSyncSettings(ON)).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(ensureWatchlistSchedule).not.toHaveBeenCalled()
  })
})
