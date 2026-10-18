/**
 * Tests for lib/discord/lock/poller.ts - the BotLockPoller class.
 *
 * A mock DistributedLock (acquire/renew/release/isHeld/getLeaseDurationMs as
 * jest.fns) is injected so we assert *which* lock op each timer invokes. Fake
 * timers drive both loops deterministically. The lease is 30 s, so renewal runs
 * every 10 s, and the poll runs every 60 s: the old default whose coupling to
 * renewal let the lease lapse (BP-12).
 */

import { BotLockPoller, type BotLockPollerOptions } from "@/lib/discord/lock/poller"
import type { DistributedLock } from "@/lib/discord/lock/lease"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  })),
}))

const LEASE_MS = 30_000
const RENEW_MS = 10_000
const POLL_MS = 60_000

function makeMockLock() {
  return {
    acquire: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
    renew: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
    release: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    isHeld: jest.fn<boolean, []>().mockReturnValue(false),
    getLeaseDurationMs: jest.fn<number, []>().mockReturnValue(LEASE_MS),
  }
}

type MockLock = ReturnType<typeof makeMockLock>

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

function makePoller(
  lock: MockLock,
  callbacks: ReturnType<typeof makeCallbacks>,
  options: BotLockPollerOptions = {}
) {
  return new BotLockPoller(lock as unknown as DistributedLock, callbacks, {
    pollIntervalMs: POLL_MS,
    getConfigVersion: makeGetConfigVersion(0),
    ...options,
  })
}

/** A promise plus its resolver, for callbacks that must stay in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/**
 * Advances fake time; the async variant yields to the real event loop after
 * every timer, so the promise chains each timer starts settle in between.
 */
async function advance(ms: number) {
  await jest.advanceTimersByTimeAsync(ms)
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe("BotLockPoller constructor", () => {
  it("throws when the renewal interval is half the lease", () => {
    expect(() => makePoller(makeMockLock(), makeCallbacks(), { renewIntervalMs: 15_000 })).toThrow(
      "renewal interval (15000 ms) must be above 0 and less than half the lease (30000 ms)"
    )
  })

  it.each([0, -1, NaN, Infinity])("throws for a renewal interval of %p", (renewIntervalMs) => {
    expect(() => makePoller(makeMockLock(), makeCallbacks(), { renewIntervalMs })).toThrow(
      "must be above 0 and less than half the lease"
    )
  })

  it("throws when the renewal interval is longer than the lease", () => {
    expect(() => makePoller(makeMockLock(), makeCallbacks(), { renewIntervalMs: 60_000 })).toThrow()
  })

  it("accepts a renewal interval just under half the lease", () => {
    expect(() => makePoller(makeMockLock(), makeCallbacks(), { renewIntervalMs: 14_999 })).not.toThrow()
  })

  it("derives the default renewal interval from the lock's lease", async () => {
    const lock = makeMockLock()
    lock.getLeaseDurationMs.mockReturnValue(9_000)
    const poller = makePoller(lock, makeCallbacks())

    await poller.start()
    await advance(2_999)
    expect(lock.renew).not.toHaveBeenCalled()
    await advance(1)
    expect(lock.renew).toHaveBeenCalledTimes(1)

    await poller.stop()
  })
})

describe("BotLockPoller.start", () => {
  it("acquires immediately and fires onLockAcquired when enabled", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const poller = makePoller(lock, cb)

    await poller.start()

    expect(cb.isEnabled).toHaveBeenCalled()
    expect(lock.acquire).toHaveBeenCalledTimes(1)
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(1)

    await poller.stop()
  })

  it("does not acquire when disabled on startup", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(false)
    const poller = makePoller(lock, cb)

    await poller.start()

    expect(lock.acquire).not.toHaveBeenCalled()
    expect(cb.onLockAcquired).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(1) // the poll only; nothing to renew

    await poller.stop()
  })

  it("keeps polling and acquires on a later tick if the lock was busy at startup", async () => {
    const lock = makeMockLock()
    lock.acquire.mockResolvedValueOnce(false) // busy at startup
    const cb = makeCallbacks(true)
    const poller = makePoller(lock, cb)

    await poller.start()
    expect(cb.onLockAcquired).not.toHaveBeenCalled()
    expect(lock.renew).not.toHaveBeenCalled()

    // Next tick: lock now free -> acquire() resolves true (default).
    await advance(POLL_MS)

    expect(lock.acquire).toHaveBeenCalledTimes(2)
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(1)

    await poller.stop()
  })

  it("is idempotent - second start does nothing", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const poller = makePoller(lock, cb)

    await poller.start()
    await poller.start()

    expect(lock.acquire).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(2) // one poll, one renewal

    await poller.stop()
  })
})

describe("BotLockPoller config-version read failures", () => {
  it("takes nothing when the read fails on startup, then starts the bot on the next tick", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const getConfigVersion = jest
      .fn<Promise<number>, []>()
      .mockRejectedValueOnce(new Error("db blip"))
      .mockResolvedValue(0)
    const poller = makePoller(lock, cb, { getConfigVersion })

    await poller.start()
    // No lease held and nothing renewing without a bot.
    expect(lock.acquire).not.toHaveBeenCalled()
    expect(cb.onLockAcquired).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(1) // the poll only

    await advance(POLL_MS)
    expect(lock.acquire).toHaveBeenCalledTimes(1)
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(2)

    await poller.stop()
  })

  it("takes nothing when the read fails on a tick, then starts the bot on the tick after", async () => {
    const lock = makeMockLock()
    lock.acquire.mockResolvedValueOnce(false) // busy at startup
    const cb = makeCallbacks(true)
    const getConfigVersion = jest
      .fn<Promise<number>, []>()
      .mockResolvedValueOnce(0) // startup
      .mockRejectedValueOnce(new Error("db blip")) // first tick
      .mockResolvedValue(0)
    const poller = makePoller(lock, cb, { getConfigVersion })

    await poller.start()
    await advance(POLL_MS)
    expect(lock.acquire).toHaveBeenCalledTimes(1) // the startup attempt only
    expect(cb.onLockAcquired).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(1)

    await advance(POLL_MS)
    expect(lock.acquire).toHaveBeenCalledTimes(2)
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(2)

    await poller.stop()
  })

  it("starts the bot again after a lost renewal even when the first re-acquire read fails", async () => {
    const lock = makeMockLock()
    lock.renew.mockResolvedValueOnce(false) // the 10 s renewal loses the lease
    const cb = makeCallbacks(true)
    const getConfigVersion = jest
      .fn<Promise<number>, []>()
      .mockResolvedValueOnce(0) // startup
      .mockRejectedValueOnce(new Error("db blip")) // 60 s tick
      .mockResolvedValue(0)
    const poller = makePoller(lock, cb, { getConfigVersion })

    await poller.start()
    await advance(RENEW_MS)
    expect(cb.onLockLost).toHaveBeenCalledTimes(1)

    await advance(POLL_MS - RENEW_MS) // 60 s: the read fails
    expect(lock.acquire).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(1)

    await advance(POLL_MS) // 120 s: back up
    expect(lock.acquire).toHaveBeenCalledTimes(2)
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(2)
    expect(jest.getTimerCount()).toBe(2)

    await poller.stop()
  })
})

describe("BotLockPoller renewal timer (BP-12)", () => {
  it("renews at 10 s, 20 s, 30 s and onwards, independent of the 60 s poll", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const poller = makePoller(lock, cb)

    await poller.start()

    await advance(RENEW_MS - 1)
    expect(lock.renew).toHaveBeenCalledTimes(0)
    await advance(1) // 10 s
    expect(lock.renew).toHaveBeenCalledTimes(1)
    await advance(RENEW_MS) // 20 s
    expect(lock.renew).toHaveBeenCalledTimes(2)
    await advance(RENEW_MS) // 30 s
    expect(lock.renew).toHaveBeenCalledTimes(3)
    await advance(3 * RENEW_MS) // 60 s, the first poll tick
    expect(lock.renew).toHaveBeenCalledTimes(6)

    // The poll never re-acquires while running, and nothing was lost.
    expect(lock.acquire).toHaveBeenCalledTimes(1)
    expect(cb.onLockLost).not.toHaveBeenCalled()

    await poller.stop()
  })

  it("never leaves more than 10 s between renewals over one simulated hour", async () => {
    const lock = makeMockLock()
    const renewedAt: number[] = []
    lock.renew.mockImplementation(async () => {
      renewedAt.push(Date.now())
      return true
    })
    const cb = makeCallbacks(true)
    const poller = makePoller(lock, cb)

    const acquiredAt = Date.now()
    await poller.start()
    await advance(60 * 60 * 1000)

    const times = [acquiredAt, ...renewedAt]
    const gaps = times.slice(1).map((t, i) => t - times[i])
    expect(renewedAt).toHaveLength(360)
    expect(Math.max(...gaps)).toBeLessThanOrEqual(RENEW_MS)
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(1)
    expect(cb.onLockLost).not.toHaveBeenCalled()

    await poller.stop()
  })

  it("starts renewing before a slow startup login finishes", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    // Login takes longer than the whole lease.
    cb.onLockAcquired.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 45_000)))
    const poller = makePoller(lock, cb)

    const started = poller.start()
    await advance(45_000)
    await started

    expect(lock.renew).toHaveBeenCalledTimes(4) // 10, 20, 30 and 40 s
    expect(cb.onLockLost).not.toHaveBeenCalled()

    await poller.stop()
  })

  it("starts renewing before a slow login finishes when a later tick acquires", async () => {
    const lock = makeMockLock()
    lock.acquire.mockResolvedValueOnce(false) // busy at startup
    const cb = makeCallbacks(true)
    cb.onLockAcquired.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 45_000)))
    const poller = makePoller(lock, cb)

    await poller.start()
    await advance(POLL_MS) // the tick acquires and starts logging in
    expect(lock.acquire).toHaveBeenCalledTimes(2)
    await advance(3 * RENEW_MS) // still logging in

    expect(lock.renew).toHaveBeenCalledTimes(3)

    await advance(15_000) // login done
    await poller.stop()
  })

  it("fires onLockLost exactly once and stops the timer when a renewal returns false", async () => {
    const lock = makeMockLock()
    lock.renew.mockResolvedValue(false) // renewal fails => lost
    const cb = makeCallbacks(true)
    const poller = makePoller(lock, cb)

    await poller.start()
    await advance(RENEW_MS)

    expect(lock.renew).toHaveBeenCalledTimes(1)
    expect(cb.onLockLost).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(1) // the poll is left; renewal stopped

    // No more renewals and no second onLockLost before the next poll tick.
    await advance(POLL_MS - RENEW_MS - 1)
    expect(lock.renew).toHaveBeenCalledTimes(1)
    expect(cb.onLockLost).toHaveBeenCalledTimes(1)

    // The poll then goes back to trying acquire.
    await advance(1)
    expect(lock.acquire).toHaveBeenCalledTimes(2)

    await poller.stop()
  })

  it("skips a renewal while the previous one is still in flight", async () => {
    const lock = makeMockLock()
    const firstRenew = deferred<boolean>()
    lock.renew.mockReturnValueOnce(firstRenew.promise).mockResolvedValue(true)
    const cb = makeCallbacks(true)
    const poller = makePoller(lock, cb)

    await poller.start()

    // The first renewal hangs; the fires at 20 s and 30 s must not stack on it.
    await advance(3 * RENEW_MS)
    expect(lock.renew).toHaveBeenCalledTimes(1)

    firstRenew.resolve(true)
    await advance(RENEW_MS)
    expect(lock.renew).toHaveBeenCalledTimes(2)

    await poller.stop()
  })

  it("waits for a login in flight before tearing the bot down after a failed renewal", async () => {
    const lock = makeMockLock()
    lock.renew.mockResolvedValue(false)
    const cb = makeCallbacks(true)
    const events: string[] = []
    cb.onLockAcquired.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            events.push("login finished")
            resolve()
          }, 15_000)
        )
    )
    cb.onLockLost.mockImplementation(async () => {
      events.push("destroyed")
    })
    const poller = makePoller(lock, cb)

    const started = poller.start()
    await advance(RENEW_MS) // renewal fails mid-login
    expect(lock.renew).toHaveBeenCalledTimes(1)
    expect(cb.onLockLost).not.toHaveBeenCalled()

    await advance(5_000)
    await started

    expect(events).toEqual(["login finished", "destroyed"])

    await poller.stop()
  })

  it("does not fire onLockLost again when a renewal fails after the bot was disabled", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const poller = makePoller(lock, cb)

    await poller.start()
    await advance(4 * RENEW_MS) // four renewals at 10-40 s

    // The renewal at 50 s hangs, and the 60 s poll sees the bot disabled.
    const lateRenew = deferred<boolean>()
    lock.renew.mockReturnValueOnce(lateRenew.promise)
    await advance(RENEW_MS)
    expect(lock.renew).toHaveBeenCalledTimes(5)
    cb.isEnabled.mockResolvedValue(false)
    await advance(RENEW_MS)
    expect(cb.onLockLost).toHaveBeenCalledTimes(1)
    expect(lock.release).toHaveBeenCalledTimes(1)

    lateRenew.resolve(false)
    await advance(0)
    expect(cb.onLockLost).toHaveBeenCalledTimes(1)

    await poller.stop()
  })
})

describe("BotLockPoller enabled-flag handling", () => {
  it("shuts down the bot and clears the renewal timer when it becomes disabled mid-run", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const poller = makePoller(lock, cb)

    await poller.start() // running

    cb.isEnabled.mockResolvedValue(false)
    await advance(POLL_MS)

    expect(cb.onLockLost).toHaveBeenCalledTimes(1)
    expect(lock.release).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(1) // the poll only

    const renewsAtDisable = lock.renew.mock.calls.length
    await advance(POLL_MS)
    expect(lock.renew).toHaveBeenCalledTimes(renewsAtDisable)

    await poller.stop()
  })
})

describe("BotLockPoller overlapping ticks", () => {
  it("skips overlapping ticks when a tick's work outlasts the poll interval", async () => {
    const lock = makeMockLock()
    lock.acquire.mockResolvedValueOnce(false) // not running, so ticks try acquire
    const cb = makeCallbacks(true)
    const firstTickEnabled = deferred<boolean>()
    // The startup check resolves; the first tick's check hangs.
    cb.isEnabled.mockResolvedValueOnce(true).mockReturnValueOnce(firstTickEnabled.promise)
    const poller = makePoller(lock, cb)

    await poller.start()

    // Tick 1 hangs in isEnabled. Two more interval fires happen while it's in
    // flight; the reentrancy guard must skip them.
    await advance(3 * POLL_MS)
    expect(cb.isEnabled).toHaveBeenCalledTimes(2)

    firstTickEnabled.resolve(true)
    await advance(POLL_MS)
    expect(cb.isEnabled).toHaveBeenCalledTimes(3)

    await poller.stop()
  })
})

describe("BotLockPoller.stop", () => {
  it("releases and leaves no timers when stopped while the startup acquire is in flight", async () => {
    const lock = makeMockLock()
    const pending = deferred<boolean>()
    lock.acquire.mockReturnValueOnce(pending.promise)
    const cb = makeCallbacks(true)
    const poller = makePoller(lock, cb)

    const started = poller.start()
    await advance(0)
    expect(lock.acquire).toHaveBeenCalledTimes(1)
    await poller.stop()

    pending.resolve(true)
    await started

    expect(cb.onLockAcquired).not.toHaveBeenCalled()
    expect(lock.release).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it("releases and leaves no timers when stopped while a tick's acquire is in flight", async () => {
    const lock = makeMockLock()
    const pending = deferred<boolean>()
    lock.acquire.mockResolvedValueOnce(false).mockReturnValueOnce(pending.promise)
    const cb = makeCallbacks(true)
    const poller = makePoller(lock, cb)

    await poller.start()
    await advance(POLL_MS) // the tick waits on acquire
    expect(lock.acquire).toHaveBeenCalledTimes(2)
    await poller.stop()

    pending.resolve(true)
    await advance(0)

    expect(cb.onLockAcquired).not.toHaveBeenCalled()
    expect(lock.release).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)

    await advance(5 * POLL_MS)
    expect(lock.renew).not.toHaveBeenCalled()
  })

  it("skips a login that was queued behind a slow teardown when stopped", async () => {
    const lock = makeMockLock()
    lock.renew.mockResolvedValueOnce(false) // the 10 s renewal loses the lease
    const cb = makeCallbacks(true)
    const slowTeardown = deferred<void>()
    cb.onLockLost.mockReturnValueOnce(slowTeardown.promise)
    const poller = makePoller(lock, cb)

    await poller.start()
    await advance(RENEW_MS) // the teardown hangs
    await advance(POLL_MS - RENEW_MS) // 60 s: re-acquired; the login waits behind the teardown
    expect(lock.acquire).toHaveBeenCalledTimes(2)
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(1)

    await poller.stop()
    slowTeardown.resolve()
    await advance(0)

    // The bot must not log in after stop(), with no lease.
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it("clears both timers so no further ticks or renewals run", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const poller = makePoller(lock, cb)

    await poller.start()
    expect(jest.getTimerCount()).toBe(2)

    await poller.stop()
    expect(jest.getTimerCount()).toBe(0)

    await advance(2 * POLL_MS)
    expect(lock.renew).not.toHaveBeenCalled()
    expect(cb.isEnabled).toHaveBeenCalledTimes(1) // the startup check only
  })

  it("fires onLockLost and releases when stopped while running", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const poller = makePoller(lock, cb)

    await poller.start()
    await poller.stop()

    expect(cb.onLockLost).toHaveBeenCalledTimes(1)
    expect(lock.release).toHaveBeenCalledTimes(1)
  })

  it("does not fire onLockLost again when a renewal in flight fails after stop", async () => {
    const lock = makeMockLock()
    const inFlight = deferred<boolean>()
    lock.renew.mockReturnValueOnce(inFlight.promise)
    const cb = makeCallbacks(true)
    const poller = makePoller(lock, cb)

    await poller.start()
    await advance(RENEW_MS)
    await poller.stop()
    expect(cb.onLockLost).toHaveBeenCalledTimes(1)

    inFlight.resolve(false)
    await advance(0)
    expect(cb.onLockLost).toHaveBeenCalledTimes(1)
  })

  it("does not fire onLockLost when stopped while never running", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(false) // disabled, never acquires
    const poller = makePoller(lock, cb)

    await poller.start()
    await poller.stop()

    expect(cb.onLockLost).not.toHaveBeenCalled()
    expect(lock.release).not.toHaveBeenCalled()
  })

  it("is a no-op when never started", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const poller = makePoller(lock, cb)

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
    const poller = makePoller(lock, cb, { getConfigVersion })

    await poller.start()
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(1)

    await advance(POLL_MS)

    // Bounce = lost then re-acquired on the same tick.
    expect(cb.onLockLost).toHaveBeenCalledTimes(1)
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(2)

    await poller.stop()
  })

  it("keeps renewing the lease while the bounce logs in again", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const relogin = deferred<void>()
    cb.onLockAcquired.mockResolvedValueOnce(undefined).mockReturnValueOnce(relogin.promise)
    const getConfigVersion = jest.fn<Promise<number>, []>().mockResolvedValueOnce(1).mockResolvedValue(2)
    const poller = makePoller(lock, cb, { getConfigVersion })

    await poller.start()
    await advance(POLL_MS) // bounce starts; the re-login hangs
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(2)
    const renewsAtBounce = lock.renew.mock.calls.length

    await advance(3 * RENEW_MS)
    expect(lock.renew).toHaveBeenCalledTimes(renewsAtBounce + 3)

    relogin.resolve()
    await advance(0)
    expect(lock.release).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(2) // still polling and renewing

    await poller.stop()
  })

  it("does NOT bounce when configVersion is unchanged", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const poller = makePoller(lock, cb, { getConfigVersion: makeGetConfigVersion(5) })

    await poller.start()
    await advance(2 * POLL_MS)

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
    const poller = makePoller(lock, cb, { getConfigVersion })

    await poller.start()

    await advance(POLL_MS) // sees 2 != 1 -> bounce, applies 2
    await advance(POLL_MS) // sees 2 == 2 -> no bounce
    await advance(POLL_MS) // sees 2 == 2 -> no bounce

    expect(cb.onLockLost).toHaveBeenCalledTimes(1) // exactly one bounce
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(2) // startup + one re-init

    await poller.stop()
  })

  it("releases the lease, stops renewing and does not crash when re-init fails during a bounce", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    // The bounce's re-init (second onLockAcquired) throws.
    cb.onLockAcquired
      .mockResolvedValueOnce(undefined) // startup init succeeds
      .mockRejectedValueOnce(new Error("login failed")) // bounce re-init fails
    const getConfigVersion = jest.fn<Promise<number>, []>().mockResolvedValueOnce(1).mockResolvedValue(2)
    // Busy after the failure, so the renewal timer stays off until the next acquire.
    lock.acquire.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const poller = makePoller(lock, cb, { getConfigVersion })

    await poller.start()

    // Bounce tick: destroy fires, re-init throws -> lease released, no throw.
    await advance(POLL_MS)
    expect(cb.onLockLost).toHaveBeenCalledTimes(1)
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(2)
    expect(lock.release).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(1) // the poll only

    // Next tick tries to re-acquire (poller is no longer running).
    await advance(POLL_MS)
    expect(lock.acquire).toHaveBeenCalledTimes(2) // startup + post-failure re-acquire

    await poller.stop()
  })

  it("does not re-init when a renewal loses the lease while the tick reads the version", async () => {
    const lock = makeMockLock()
    const events: string[] = []
    const cb = makeCallbacks(true)
    cb.onLockAcquired.mockImplementation(async () => {
      events.push("init")
    })
    cb.onLockLost.mockImplementation(async () => {
      events.push("destroy")
    })
    const versionRead = deferred<number>()
    const getConfigVersion = jest
      .fn<Promise<number>, []>()
      .mockResolvedValueOnce(1) // startup
      .mockReturnValueOnce(versionRead.promise) // the 60 s tick's read hangs
      .mockResolvedValue(2)
    const poller = makePoller(lock, cb, { getConfigVersion })

    await poller.start()
    await advance(POLL_MS) // the tick waits on the read
    expect(getConfigVersion).toHaveBeenCalledTimes(2)

    // Another pod takes the lease: the 70 s renewal fails, and this pod can no
    // longer acquire.
    lock.renew.mockResolvedValue(false)
    lock.acquire.mockResolvedValue(false)
    await advance(RENEW_MS)
    expect(events).toEqual(["init", "destroy"])

    // An admin saved settings: the read now returns a new version.
    versionRead.resolve(2)
    await advance(2 * POLL_MS)

    expect(cb.onLockAcquired).toHaveBeenCalledTimes(1)
    expect(events).toEqual(["init", "destroy"])

    await poller.stop()
    expect(events).toEqual(["init", "destroy"])
  })

  it("skips the re-init when a renewal loses the lease during the bounce's teardown", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const teardown = deferred<void>()
    cb.onLockLost.mockReturnValueOnce(teardown.promise)
    const getConfigVersion = jest.fn<Promise<number>, []>().mockResolvedValueOnce(1).mockResolvedValue(2)
    const poller = makePoller(lock, cb, { getConfigVersion })

    await poller.start()
    await advance(POLL_MS) // the bounce starts; its teardown hangs
    expect(cb.onLockLost).toHaveBeenCalledTimes(1)

    lock.renew.mockResolvedValue(false)
    lock.acquire.mockResolvedValue(false)
    await advance(RENEW_MS) // the 70 s renewal fails and queues its teardown
    teardown.resolve()
    await advance(0)

    expect(cb.onLockAcquired).toHaveBeenCalledTimes(1) // startup only
    expect(cb.onLockLost).toHaveBeenCalledTimes(2) // the bounce's, then the lost renewal's
    expect(jest.getTimerCount()).toBe(1) // the poll only

    await poller.stop()
  })

  it("skips the re-init when stop() runs during the bounce's teardown", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const teardown = deferred<void>()
    cb.onLockLost.mockReturnValueOnce(teardown.promise)
    const getConfigVersion = jest.fn<Promise<number>, []>().mockResolvedValueOnce(1).mockResolvedValue(2)
    const poller = makePoller(lock, cb, { getConfigVersion })

    await poller.start()
    await advance(POLL_MS) // the bounce starts; its teardown hangs
    await poller.stop()
    teardown.resolve()
    await advance(0)

    // The bot must not log in again after stop(), with no lease.
    expect(cb.onLockAcquired).toHaveBeenCalledTimes(1)
    expect(lock.release).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it("bounces off the SAME lock without re-acquiring (holder-only path)", async () => {
    const lock = makeMockLock()
    const cb = makeCallbacks(true)
    const getConfigVersion = jest.fn<Promise<number>, []>().mockResolvedValueOnce(0).mockResolvedValue(1)
    const poller = makePoller(lock, cb, { getConfigVersion })

    await poller.start()
    await advance(POLL_MS) // bounce

    // A successful bounce does not release or re-acquire the lock - we keep it.
    expect(lock.release).not.toHaveBeenCalled()
    expect(lock.acquire).toHaveBeenCalledTimes(1) // only the startup acquire

    await poller.stop()
  })
})
