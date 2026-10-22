/**
 * @jest-environment node
 *
 * startWatchlistFallback (SEC-49): without Redis, one process syncs on the
 * configured interval under the `watchlist-sync` lease, whatever the flag was
 * at boot. A real LeasePoller runs over a stub lease, with fake timers.
 */

import { onShutdown } from "@/lib/instrumentation/shutdown"
import { LeaseLock } from "@/lib/locks/lease-lock"
import { getWatchlistSyncInterval, isWatchlistSyncEnabled } from "@/lib/watchlist/config"
import { startWatchlistFallback } from "@/lib/watchlist/fallback"
import { syncAllEnabledUsers } from "@/lib/watchlist/sync-service"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))
jest.mock("@/lib/instrumentation/shutdown", () => ({ onShutdown: jest.fn() }))
jest.mock("@/lib/watchlist/config", () => ({
  isWatchlistSyncEnabled: jest.fn(),
  getWatchlistSyncInterval: jest.fn(),
}))
jest.mock("@/lib/watchlist/sync-service", () => ({ syncAllEnabledUsers: jest.fn() }))

const mockLock = {
  name: "watchlist-sync" as const,
  acquire: jest.fn<Promise<boolean>, []>(),
  renew: jest.fn<Promise<boolean>, []>(),
  release: jest.fn<Promise<void>, []>(),
  isHeld: jest.fn<boolean, []>(),
  getLeaseDurationMs: () => 30_000,
}
jest.mock("@/lib/locks/lease-lock", () => ({ LeaseLock: jest.fn().mockImplementation(() => mockLock) }))

const POLL_MS = 60_000
const MINUTE = 60_000
const SYNC_RESULT = { usersProcessed: 1, usersSucceeded: 1, usersFailed: 0 }

let controller: AbortController
const originalEnv = process.env

async function advance(ms: number) {
  await jest.advanceTimersByTimeAsync(ms)
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  process.env = { ...originalEnv }
  delete process.env.ENABLE_WATCHLIST_SYNC
  delete process.env.WATCHLIST_SYNC_POLL_INTERVAL_MS
  controller = new AbortController()
  mockLock.acquire.mockResolvedValue(true)
  mockLock.renew.mockResolvedValue(true)
  mockLock.release.mockResolvedValue(undefined)
  jest.mocked(isWatchlistSyncEnabled).mockResolvedValue(true)
  jest.mocked(getWatchlistSyncInterval).mockResolvedValue(5)
  jest.mocked(syncAllEnabledUsers).mockResolvedValue(SYNC_RESULT)
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

afterAll(() => {
  process.env = originalEnv
})

async function start() {
  const poller = await startWatchlistFallback({ signal: controller.signal })
  if (!poller) throw new Error("expected a poller")
  return poller
}

describe("startWatchlistFallback", () => {
  it("syncs within one poll when sync is enabled after boot", async () => {
    jest.mocked(isWatchlistSyncEnabled).mockResolvedValue(false)
    const poller = await start()

    await advance(POLL_MS * 3)
    expect(mockLock.acquire).not.toHaveBeenCalled()
    expect(syncAllEnabledUsers).not.toHaveBeenCalled()

    jest.mocked(isWatchlistSyncEnabled).mockResolvedValue(true)
    await advance(POLL_MS)

    expect(LeaseLock).toHaveBeenCalledWith({ name: "watchlist-sync" })
    expect(syncAllEnabledUsers).toHaveBeenCalledTimes(1)
    await poller.stop()
  })

  it("syncs at once when enabled at boot, then every interval", async () => {
    const poller = await start()
    expect(syncAllEnabledUsers).toHaveBeenCalledTimes(1)

    await advance(5 * MINUTE - 1)
    expect(syncAllEnabledUsers).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(syncAllEnabledUsers).toHaveBeenCalledTimes(2)

    await advance(10 * MINUTE)
    expect(syncAllEnabledUsers).toHaveBeenCalledTimes(4)
    await poller.stop()
  })

  it("applies a changed interval at the next poll", async () => {
    const poller = await start()

    jest.mocked(getWatchlistSyncInterval).mockResolvedValue(2)
    await advance(2 * MINUTE)
    expect(syncAllEnabledUsers).toHaveBeenCalledTimes(2)

    jest.mocked(getWatchlistSyncInterval).mockResolvedValue(30)
    await advance(29 * MINUTE)
    expect(syncAllEnabledUsers).toHaveBeenCalledTimes(2)
    await advance(MINUTE)
    expect(syncAllEnabledUsers).toHaveBeenCalledTimes(3)
    await poller.stop()
  })

  it("never doubles a run that lasts three intervals", async () => {
    let finish!: () => void
    jest.mocked(syncAllEnabledUsers).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(SYNC_RESULT)
        })
    )
    const poller = await start()

    await advance(15 * MINUTE)
    expect(syncAllEnabledUsers).toHaveBeenCalledTimes(1)

    finish()
    await advance(POLL_MS)
    expect(syncAllEnabledUsers).toHaveBeenCalledTimes(2)
    await poller.stop()
  })

  it("keeps syncing after a run that throws", async () => {
    jest.mocked(syncAllEnabledUsers).mockRejectedValueOnce(new Error("boom"))
    const poller = await start()

    await advance(5 * MINUTE)
    expect(syncAllEnabledUsers).toHaveBeenCalledTimes(2)
    await poller.stop()
  })

  it("stops further runs once the lease is lost", async () => {
    const poller = await start()
    expect(syncAllEnabledUsers).toHaveBeenCalledTimes(1)

    mockLock.renew.mockResolvedValue(false)
    mockLock.acquire.mockResolvedValue(false) // another process holds it now
    await advance(30 * MINUTE)

    expect(syncAllEnabledUsers).toHaveBeenCalledTimes(1)
    await poller.stop()
  })

  it("never syncs while another process holds the lease", async () => {
    mockLock.acquire.mockResolvedValue(false)
    const poller = await start()

    await advance(30 * MINUTE)

    expect(syncAllEnabledUsers).not.toHaveBeenCalled()
    await poller.stop()
  })

  it("registers the poller's stop with the shutdown drain", async () => {
    const poller = await start()
    const stop = jest.spyOn(poller, "stop")

    expect(onShutdown).toHaveBeenCalledWith("watchlist-fallback", "drain", expect.any(Function))
    await jest.mocked(onShutdown).mock.calls[0][2]()

    expect(stop).toHaveBeenCalledTimes(1)
    expect(mockLock.release).toHaveBeenCalledTimes(1)
    await advance(30 * MINUTE)
    expect(syncAllEnabledUsers).toHaveBeenCalledTimes(1)
  })

  it("builds nothing with ENABLE_WATCHLIST_SYNC=false", async () => {
    process.env.ENABLE_WATCHLIST_SYNC = "false"

    await expect(startWatchlistFallback({ signal: controller.signal })).resolves.toBeNull()

    expect(LeaseLock).not.toHaveBeenCalled()
    expect(onShutdown).not.toHaveBeenCalled()
  })

  it("builds nothing once shutdown has begun", async () => {
    controller.abort()

    await expect(startWatchlistFallback({ signal: controller.signal })).resolves.toBeNull()
    expect(LeaseLock).not.toHaveBeenCalled()
  })
})
