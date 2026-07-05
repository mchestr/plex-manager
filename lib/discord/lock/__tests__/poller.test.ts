/**
 * Tests for lib/discord/lock/poller.ts - the BotLockPoller class.
 *
 * A mock DistributedLock (acquire/renew/release/isHeld as jest.fns) is injected
 * so we assert *which* lock op each tick invokes. Fake timers drive the single
 * poll loop deterministically; because there is exactly one timer and one lock
 * object, renewal and acquisition can never disagree.
 */

import { BotLockPoller } from "@/lib/discord/lock/poller"
import type { DistributedLock } from "@/lib/discord/lock/lease"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  })),
}))

const POLL_MS = 10_000

function makeMockLock() {
  return {
    acquire: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
    renew: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
    release: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    isHeld: jest.fn<boolean, []>().mockReturnValue(false),
  }
}

function makeCallbacks(enabled = true) {
  return {
    onLockAcquired: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    onLockLost: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    isEnabled: jest.fn<Promise<boolean>, []>().mockResolvedValue(enabled),
  }
}

/**
 * Advances fake timers by one poll interval and flushes microtasks so the
 * async tick body settles before assertions run.
 */
async function advanceOneTick() {
  jest.advanceTimersByTime(POLL_MS)
  // Flush the promise chain started inside the (sync) interval callback.
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe("BotLockPoller.start", () => {
  it("acquires immediately and fires onLockAcquired when enabled", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, { pollIntervalMs: POLL_MS })

    await poller.start()

    expect(cb.isEnabled).toHaveBeenCalled()
    expect(lock.acquire).toHaveBeenCalledTimes(1)
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(1)

    await poller.stop()
  })

  it("does not acquire when disabled on startup", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(false)
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, { pollIntervalMs: POLL_MS })

    await poller.start()

    expect(lock.acquire).not.toHaveBeenCalled()
    expect(cb.onLockAcquired).not.toHaveBeenCalled()

    await poller.stop()
  })

  it("keeps polling and acquires on a later tick if the lock was busy at startup", async () => {
    const lock = makeMockLock()
    lock.acquire.mockResolvedValueOnce(false) // busy at startup
    const cb = makeCallbacks(true)
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, { pollIntervalMs: POLL_MS })

    await poller.start()
    expect(cb.onLockAcquired).not.toHaveBeenCalled()

    // Next tick: lock now free -> acquire() resolves true (default).
    await advanceOneTick()

    expect(lock.acquire).toHaveBeenCalledTimes(2)
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(1)

    await poller.stop()
  })

  it("is idempotent - second start does nothing", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, { pollIntervalMs: POLL_MS })

    await poller.start()
    await poller.start()

    expect(lock.acquire).toHaveBeenCalledTimes(1)

    await poller.stop()
  })
})

describe("BotLockPoller renewal (single source of truth)", () => {
  it("renews the SAME lock object on subsequent ticks while running", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, { pollIntervalMs: POLL_MS })

    await poller.start() // acquires, running = true

    await advanceOneTick()
    await advanceOneTick()

    // Once running, ticks renew rather than re-acquire.
    expect(lock.renew).toHaveBeenCalledTimes(2)
    expect(lock.acquire).toHaveBeenCalledTimes(1) // only the startup acquire
    expect(cb.onLockLost).not.toHaveBeenCalled()

    await poller.stop()
  })

  it("fires onLockLost when a renewal fails (lock lost to another instance)", async () => {
    const lock = makeMockLock()
    lock.renew.mockResolvedValue(false) // renewal fails => lost
    const cb = makeCallbacks(true)
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, { pollIntervalMs: POLL_MS })

    await poller.start()
    await advanceOneTick()

    expect(lock.renew).toHaveBeenCalledTimes(1)
    expect(cb.onLockLost).toHaveBeenCalledTimes(1)

    // After loss it stops renewing and goes back to trying acquire on next tick.
    await advanceOneTick()
    expect(lock.acquire).toHaveBeenCalledTimes(2)

    await poller.stop()
  })
})

describe("BotLockPoller enabled-flag handling", () => {
  it("shuts down the bot when it becomes disabled mid-run", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, { pollIntervalMs: POLL_MS })

    await poller.start() // running

    cb.isEnabled.mockResolvedValue(false)
    await advanceOneTick()

    expect(cb.onLockLost).toHaveBeenCalledTimes(1)
    expect(lock.release).toHaveBeenCalledTimes(1)
    expect(lock.renew).not.toHaveBeenCalled()

    await poller.stop()
  })
})

describe("BotLockPoller.stop", () => {
  it("clears the timer so no further ticks run", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, { pollIntervalMs: POLL_MS })

    await poller.start()
    await poller.stop()

    const renewsBefore = lock.renew.mock.calls.length
    await advanceOneTick()
    expect(lock.renew.mock.calls.length).toBe(renewsBefore)
  })

  it("fires onLockLost and releases when stopped while running", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, { pollIntervalMs: POLL_MS })

    await poller.start()
    await poller.stop()

    expect(cb.onLockLost).toHaveBeenCalledTimes(1)
    expect(lock.release).toHaveBeenCalledTimes(1)
  })

  it("does not fire onLockLost when stopped while never running", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(false) // disabled, never acquires
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, { pollIntervalMs: POLL_MS })

    await poller.start()
    await poller.stop()

    expect(cb.onLockLost).not.toHaveBeenCalled()
    expect(lock.release).not.toHaveBeenCalled()
  })

  it("is a no-op when never started", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, { pollIntervalMs: POLL_MS })

    await poller.stop()

    expect(cb.onLockLost).not.toHaveBeenCalled()
  })
})
