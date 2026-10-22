/**
 * @jest-environment node
 *
 * ensureWatchlistSchedule: the BullMQ scheduler follows Config, and a Redis
 * that does not answer returns a code instead of throwing.
 */

import { removeScheduledJob, scheduleRepeatingJob } from "@/lib/queue/client"
import { getWatchlistSyncInterval, isWatchlistSyncEnabled } from "@/lib/watchlist/config"
import { ensureWatchlistSchedule } from "@/lib/watchlist/schedule"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))
jest.mock("@/lib/queue/client", () => ({ scheduleRepeatingJob: jest.fn(), removeScheduledJob: jest.fn() }))
jest.mock("@/lib/watchlist/config", () => ({
  isWatchlistSyncEnabled: jest.fn(),
  getWatchlistSyncInterval: jest.fn(),
}))

const originalEnv = process.env

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...originalEnv, REDIS_URL: "redis://localhost:6390" }
  jest.mocked(isWatchlistSyncEnabled).mockResolvedValue(true)
  jest.mocked(getWatchlistSyncInterval).mockResolvedValue(15)
  jest.mocked(scheduleRepeatingJob).mockResolvedValue(undefined)
  jest.mocked(removeScheduledJob).mockResolvedValue(true)
})

afterEach(() => {
  jest.useRealTimers()
})

afterAll(() => {
  process.env = originalEnv
})

describe("ensureWatchlistSchedule", () => {
  it("upserts the scheduler with the interval while sync is on", async () => {
    await expect(ensureWatchlistSchedule()).resolves.toEqual({ ok: true, state: "scheduled", intervalMinutes: 15 })

    expect(scheduleRepeatingJob).toHaveBeenCalledWith(
      "watchlist-sync-scheduled",
      "watchlist:sync:all",
      { triggeredBy: "scheduled" },
      15 * 60 * 1000
    )
    expect(removeScheduledJob).not.toHaveBeenCalled()
  })

  it("removes the scheduler while sync is off", async () => {
    jest.mocked(isWatchlistSyncEnabled).mockResolvedValue(false)

    await expect(ensureWatchlistSchedule()).resolves.toEqual({ ok: true, state: "removed" })

    expect(removeScheduledJob).toHaveBeenCalledWith("watchlist-sync-scheduled")
    expect(scheduleRepeatingJob).not.toHaveBeenCalled()
  })

  it("returns TIMEOUT when Redis does not answer within 5 s", async () => {
    jest.useFakeTimers()
    jest.mocked(scheduleRepeatingJob).mockReturnValue(new Promise(() => {}))

    const result = ensureWatchlistSchedule()
    await jest.advanceTimersByTimeAsync(5000)

    await expect(result).resolves.toEqual({ ok: false, code: "TIMEOUT" })
  })

  it("returns FAILED when the scheduler write throws", async () => {
    jest.mocked(removeScheduledJob).mockRejectedValue(new Error("READONLY"))
    jest.mocked(isWatchlistSyncEnabled).mockResolvedValue(false)

    await expect(ensureWatchlistSchedule()).resolves.toEqual({ ok: false, code: "FAILED" })
  })

  it("touches no queue without REDIS_URL", async () => {
    delete process.env.REDIS_URL

    await expect(ensureWatchlistSchedule()).resolves.toEqual({ ok: true, state: "no-redis" })

    expect(isWatchlistSyncEnabled).not.toHaveBeenCalled()
    expect(scheduleRepeatingJob).not.toHaveBeenCalled()
  })
})
