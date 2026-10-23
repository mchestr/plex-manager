/**
 * @jest-environment node
 *
 * startRetentionFallback (P11.14): without Redis, the sweep runs once per 24
 * hours under the `retention` lease. A real LeasePoller runs over a stub
 * lease, with fake timers; the last run lives in a stubbed `Config` row.
 */

import { onShutdown } from "@/lib/instrumentation/shutdown"
import { LeaseLock } from "@/lib/locks/lease-lock"
import { runRetentionSweep } from "@/lib/queue/jobs/retention"
import { RETENTION_POLL_INTERVAL_MS, startRetentionFallback } from "@/lib/retention/fallback"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))
jest.mock("@/lib/instrumentation/shutdown", () => ({ onShutdown: jest.fn() }))
jest.mock("@/lib/queue/jobs/retention", () => ({ runRetentionSweep: jest.fn() }))

let lastRunAt: Date | null = null
jest.mock("@/lib/prisma", () => ({
  prisma: { config: { findUnique: jest.fn(async () => ({ lastRetentionRunAt: lastRunAt })) } },
}))

const mockLock = {
  name: "retention" as const,
  acquire: jest.fn<Promise<boolean>, []>(),
  renew: jest.fn<Promise<boolean>, []>(),
  release: jest.fn<Promise<void>, []>(),
  isHeld: jest.fn<boolean, []>(),
  getLeaseDurationMs: () => 30_000,
}
jest.mock("@/lib/locks/lease-lock", () => ({ LeaseLock: jest.fn().mockImplementation(() => mockLock) }))

const HOUR = 60 * 60 * 1000
const SWEEP = { counts: {} as Awaited<ReturnType<typeof runRetentionSweep>>["counts"], aborted: false, finishedAt: "" }

let controller: AbortController

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2027-03-01T12:00:00Z") })
  jest.clearAllMocks()
  controller = new AbortController()
  lastRunAt = null
  mockLock.acquire.mockResolvedValue(true)
  mockLock.renew.mockResolvedValue(true)
  mockLock.release.mockResolvedValue(undefined)
  // A finished sweep records its time, as the real one does on Config
  jest.mocked(runRetentionSweep).mockImplementation(async () => {
    lastRunAt = new Date()
    return SWEEP
  })
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

async function start() {
  const poller = await startRetentionFallback({ signal: controller.signal })
  if (!poller) throw new Error("expected a poller")
  return poller
}

describe("startRetentionFallback", () => {
  it("sweeps at once under the retention lease when no run is recorded", async () => {
    const poller = await start()

    expect(LeaseLock).toHaveBeenCalledWith({ name: "retention" })
    expect(runRetentionSweep).toHaveBeenCalledTimes(1)
    expect(onShutdown).toHaveBeenCalledWith("retention-fallback", "drain", expect.any(Function))
    await poller.stop()
  })

  it("runs once per 24 hours", async () => {
    const poller = await start()

    await jest.advanceTimersByTimeAsync(24 * HOUR - RETENTION_POLL_INTERVAL_MS)
    expect(runRetentionSweep).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(RETENTION_POLL_INTERVAL_MS)
    expect(runRetentionSweep).toHaveBeenCalledTimes(2)
    await jest.advanceTimersByTimeAsync(24 * HOUR)
    expect(runRetentionSweep).toHaveBeenCalledTimes(3)
    await poller.stop()
  })

  it("waits for a run recorded elsewhere, such as Run now", async () => {
    lastRunAt = new Date(Date.now() - 2 * HOUR)
    const poller = await start()

    expect(runRetentionSweep).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(22 * HOUR)
    expect(runRetentionSweep).toHaveBeenCalledTimes(1)
    await poller.stop()
  })

  it("retries a failed sweep after an hour, not every poll", async () => {
    jest.mocked(runRetentionSweep).mockRejectedValueOnce(new Error("db down"))
    const poller = await start()
    expect(runRetentionSweep).toHaveBeenCalledTimes(1)

    await jest.advanceTimersByTimeAsync(HOUR - RETENTION_POLL_INTERVAL_MS)
    expect(runRetentionSweep).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(RETENTION_POLL_INTERVAL_MS)
    expect(runRetentionSweep).toHaveBeenCalledTimes(2)
    await poller.stop()
  })

  it("does not sweep without the lease", async () => {
    mockLock.acquire.mockResolvedValue(false)
    const poller = await start()

    await jest.advanceTimersByTimeAsync(2 * HOUR)
    expect(runRetentionSweep).not.toHaveBeenCalled()
    await poller.stop()
  })

  it("builds nothing once shutdown has begun", async () => {
    controller.abort()

    await expect(startRetentionFallback({ signal: controller.signal })).resolves.toBeNull()
    expect(LeaseLock).not.toHaveBeenCalled()
  })
})
