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
 * A getConfigVersion stub resolving a fixed version by default; individual tests
 * override return values per tick to simulate a config/token rotation.
 */
function makeGetConfigVersion(version = 0) {
  return jest.fn<Promise<number>, []>().mockResolvedValue(version)
}

/**
 * Advances fake timers by one poll interval and flushes microtasks so the
 * async tick body settles before assertions run.
 */
async function advanceOneTick() {
  jest.advanceTimersByTime(POLL_MS)
  // Flush the promise chain started inside the (sync) interval callback. The
  // running branch awaits isEnabled -> getConfigVersion -> renew (or the
  // bounce's onLockLost -> onLockAcquired), so flush generously.
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
  }
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
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, {
      pollIntervalMs: POLL_MS,
      getConfigVersion: makeGetConfigVersion(0),
    })

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
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, {
      pollIntervalMs: POLL_MS,
      getConfigVersion: makeGetConfigVersion(0),
    })

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
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, {
      pollIntervalMs: POLL_MS,
      getConfigVersion: makeGetConfigVersion(0),
    })

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
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, {
      pollIntervalMs: POLL_MS,
      getConfigVersion: makeGetConfigVersion(0),
    })

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
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, {
      pollIntervalMs: POLL_MS,
      getConfigVersion: makeGetConfigVersion(0),
    })

    await poller.start()
    await advanceOneTick()

    expect(lock.renew).toHaveBeenCalledTimes(1)
    expect(cb.onLockLost).toHaveBeenCalledTimes(1)

    // After loss it stops renewing and goes back to trying acquire on next tick.
    await advanceOneTick()
    expect(lock.acquire).toHaveBeenCalledTimes(2)

    await poller.stop()
  })

  it("skips overlapping ticks when a tick's work outlasts the poll interval", async () => {
    const lock = makeMockLock()
    // First renew never resolves, simulating a tick whose async work outlasts
    // the poll interval; subsequent interval fires must be skipped, not overlap.
    let resolveFirstRenew: (() => void) | undefined
    lock.renew
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            resolveFirstRenew = () => resolve(true)
          })
      )
      .mockResolvedValue(true)
    const cb = makeCallbacks(true)
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, {
      pollIntervalMs: POLL_MS,
      getConfigVersion: makeGetConfigVersion(0),
    })

    await poller.start() // acquires, running = true

    // Tick 1 starts renew (hangs). Two more interval fires happen while it's
    // in flight — the reentrancy guard must skip them.
    await advanceOneTick()
    await advanceOneTick()
    await advanceOneTick()

    expect(lock.renew).toHaveBeenCalledTimes(1)

    // Once the hung renew settles, let the first tick's finally clear the guard
    // (flush microtasks) before the next interval fires.
    resolveFirstRenew?.()
    for (let i = 0; i < 8; i++) {
      await Promise.resolve()
    }
    await advanceOneTick()
    expect(lock.renew).toHaveBeenCalledTimes(2)

    await poller.stop()
  })
})

describe("BotLockPoller enabled-flag handling", () => {
  it("shuts down the bot when it becomes disabled mid-run", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, {
      pollIntervalMs: POLL_MS,
      getConfigVersion: makeGetConfigVersion(0),
    })

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
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, {
      pollIntervalMs: POLL_MS,
      getConfigVersion: makeGetConfigVersion(0),
    })

    await poller.start()
    await poller.stop()

    const renewsBefore = lock.renew.mock.calls.length
    await advanceOneTick()
    expect(lock.renew.mock.calls.length).toBe(renewsBefore)
  })

  it("fires onLockLost and releases when stopped while running", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, {
      pollIntervalMs: POLL_MS,
      getConfigVersion: makeGetConfigVersion(0),
    })

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

describe("BotLockPoller config-change bounce (Step 18)", () => {
  it("bounces (destroy + re-init) when configVersion changes while running", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    // Startup applies version 1; the next tick sees version 2 -> bounce.
    const getConfigVersion = jest
      .fn<Promise<number>, []>()
      .mockResolvedValueOnce(1) // consumed by the immediate startup acquire
      .mockResolvedValue(2) // every subsequent tick sees the new version
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, {
      pollIntervalMs: POLL_MS,
      getConfigVersion,
    })

    await poller.start()
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(1)

    await advanceOneTick()

    // Bounce = lost then re-acquired on the same tick.
    expect(cb.onLockLost).toHaveBeenCalledTimes(1)
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(2)
    // Bounce takes the place of renewal for that tick (no renew when we bounce).
    expect(lock.renew).not.toHaveBeenCalled()

    await poller.stop()
  })

  it("does NOT bounce when configVersion is unchanged - just renews", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const getConfigVersion = makeGetConfigVersion(5)
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, {
      pollIntervalMs: POLL_MS,
      getConfigVersion,
    })

    await poller.start()
    await advanceOneTick()
    await advanceOneTick()

    // No version change -> normal renewal path, no bounce.
    expect(lock.renew).toHaveBeenCalledTimes(2)
    expect(cb.onLockLost).not.toHaveBeenCalled()
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(1)

    await poller.stop()
  })

  it("only bounces once per config change (tracks last-applied version)", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const getConfigVersion = jest
      .fn<Promise<number>, []>()
      .mockResolvedValueOnce(1) // startup applies version 1
      .mockResolvedValue(2) // stays at 2 for all later ticks
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, {
      pollIntervalMs: POLL_MS,
      getConfigVersion,
    })

    await poller.start()

    await advanceOneTick() // sees 2 != 1 -> bounce, applies 2
    await advanceOneTick() // sees 2 == 2 -> no bounce, renew
    await advanceOneTick() // sees 2 == 2 -> no bounce, renew

    expect(cb.onLockLost).toHaveBeenCalledTimes(1) // exactly one bounce
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(2) // startup + one re-init
    expect(lock.renew).toHaveBeenCalledTimes(2) // the two post-bounce ticks

    await poller.stop()
  })

  it("releases the lease and does not crash when re-init fails during a bounce", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    // The bounce's re-init (second onLockAcquired) throws.
    cb.onLockAcquired
      .mockResolvedValueOnce(undefined) // startup init succeeds
      .mockRejectedValueOnce(new Error("login failed")) // bounce re-init fails
    const getConfigVersion = jest
      .fn<Promise<number>, []>()
      .mockResolvedValueOnce(1)
      .mockResolvedValue(2)
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, {
      pollIntervalMs: POLL_MS,
      getConfigVersion,
    })

    await poller.start()

    // Bounce tick: destroy fires, re-init throws -> lease released, no throw.
    await advanceOneTick()
    expect(cb.onLockLost).toHaveBeenCalledTimes(1)
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(2)
    expect(lock.release).toHaveBeenCalledTimes(1)

    // Next tick re-acquires cleanly (poller is no longer running).
    await advanceOneTick()
    expect(lock.acquire).toHaveBeenCalledTimes(2) // startup + post-failure re-acquire

    await poller.stop()
  })

  it("bounces off the SAME lock without re-acquiring (holder-only path)", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const getConfigVersion = jest
      .fn<Promise<number>, []>()
      .mockResolvedValueOnce(0)
      .mockResolvedValue(1)
    const poller = new BotLockPoller(lock as unknown as DistributedLock, cb, {
      pollIntervalMs: POLL_MS,
      getConfigVersion,
    })

    await poller.start()
    await advanceOneTick() // bounce

    // A successful bounce does not release or re-acquire the lock - we keep it.
    expect(lock.release).not.toHaveBeenCalled()
    expect(lock.acquire).toHaveBeenCalledTimes(1) // only the startup acquire

    await poller.stop()
  })
})
