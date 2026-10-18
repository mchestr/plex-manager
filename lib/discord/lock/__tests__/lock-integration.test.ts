/**
 * @jest-environment node
 */

/**
 * Lock integration test for BP-12: a real BotLockPoller drives a real
 * DistributedLock over an in-memory `DiscordBotLock` row (the store pattern from
 * lease.test.ts), with fake timers as the clock. The poller gets the defaults
 * lib/instrumentation/node.ts uses: DEFAULT_POLL_INTERVAL_MS and the default
 * 30 s lease, with renewal at its default of a third of the lease.
 *
 * Every simulated second the test checks that the row is still ours and still
 * live, so a lease that lapses between renewals fails it.
 */

import { DistributedLock, DEFAULT_LOCK_LEASE_DURATION_MS, DISCORD_BOT_LOCK_ID } from "@/lib/discord/lock/lease"
import { BotLockPoller, DEFAULT_POLL_INTERVAL_MS, type BotLockPollerOptions } from "@/lib/discord/lock/poller"

// lease.ts imports the real prisma client at load; every lock here gets the store.
jest.mock("@/lib/prisma", () => ({ prisma: {} }))

jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  })),
}))

interface LockRow {
  id: string
  instanceId: string
  acquiredAt: Date
  expiresAt: Date
  lastRenewedAt: Date
  updatedAt: Date
}

const ONE_HOUR_MS = 60 * 60 * 1000

/** A `prisma`-shaped store over the single lock row, shared by every pod in a test. */
function createLockStore() {
  let row: LockRow | null = null
  let txQueue: Promise<unknown> = Promise.resolve()

  const discordBotLock = {
    deleteMany: async (args: { where: { expiresAt?: { lt: Date }; id?: string; instanceId?: string } }) => {
      const w = args.where
      if (
        row &&
        (!w.expiresAt || row.expiresAt < w.expiresAt.lt) &&
        (!w.id || row.id === w.id) &&
        (!w.instanceId || row.instanceId === w.instanceId)
      ) {
        row = null
        return { count: 1 }
      }
      return { count: 0 }
    },
    findUnique: async (args: { where: { id: string } }) => (row && row.id === args.where.id ? { ...row } : null),
    create: async (args: { data: Omit<LockRow, "updatedAt"> }) => {
      row = { ...args.data, updatedAt: args.data.acquiredAt }
      return { ...row }
    },
    update: async (args: { where: { id: string }; data: Partial<LockRow> }) => {
      if (!row || row.id !== args.where.id) throw new Error("row not found")
      row = { ...row, ...args.data }
      return { ...row }
    },
    updateMany: async (args: {
      where: { id: string; instanceId: string; expiresAt?: { gt: Date } }
      data: Partial<LockRow>
    }) => {
      const w = args.where
      if (row && row.id === w.id && row.instanceId === w.instanceId && (!w.expiresAt || row.expiresAt > w.expiresAt.gt)) {
        row = { ...row, ...args.data }
        return { count: 1 }
      }
      return { count: 0 }
    },
  }

  const tx = { discordBotLock }
  return {
    discordBotLock,
    // One transaction at a time, as Serializable isolation gives two real pods.
    $transaction: <T>(fn: (client: typeof tx) => Promise<T>): Promise<T> => {
      const run = txQueue.then(() => fn(tx))
      txQueue = run.catch(() => undefined)
      return run
    },
    getRow: () => row,
  }
}

type LockStore = ReturnType<typeof createLockStore>

/** One pod: a real lock and poller with node.ts's defaults, plus a slow bot login. */
function createPod(store: LockStore, instanceId: string, loginMs: number, options: BotLockPollerOptions = {}) {
  const lock = new DistributedLock({ instanceId, prisma: store as never })
  const callbacks = {
    onLockAcquired: jest.fn(() => new Promise<void>((resolve) => setTimeout(resolve, loginMs))),
    onLockLost: jest.fn(async () => undefined),
    isEnabled: jest.fn(async () => true),
  }
  const poller = new BotLockPoller(lock, callbacks, {
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    getConfigVersion: async () => 0,
    ...options,
  })
  return { lock, callbacks, poller }
}

/**
 * Advances one simulated hour a second at a time and returns every second at
 * which the row was missing, owned by someone else, or past its expiry.
 */
async function runOneHourAndFindLapses(store: LockStore, ownerId: string): Promise<number[]> {
  const lapses: number[] = []
  for (let second = 1; second <= ONE_HOUR_MS / 1000; second++) {
    await jest.advanceTimersByTimeAsync(1000)
    const row = store.getRow()
    if (!row || row.instanceId !== ownerId || row.expiresAt.getTime() <= Date.now()) {
      lapses.push(second)
    }
  }
  return lapses
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe("BotLockPoller with a real DistributedLock (BP-12)", () => {
  it("uses a 10 s poll and a 30 s lease by default", () => {
    expect(DEFAULT_POLL_INTERVAL_MS).toBe(10_000)
    expect(DEFAULT_LOCK_LEASE_DURATION_MS).toBe(30_000)
  })

  it("keeps the lease alive for an hour with the node.ts defaults and logs in once", async () => {
    const store = createLockStore()
    const pod = createPod(store, "pod-a", 2_000)

    const started = pod.poller.start()
    const lapses = runOneHourAndFindLapses(store, "pod-a")
    await started

    expect(await lapses).toEqual([])
    expect(pod.callbacks.onLockAcquired).toHaveBeenCalledTimes(1)
    expect(pod.callbacks.onLockLost).not.toHaveBeenCalled()
    expect(store.getRow()?.id).toBe(DISCORD_BOT_LOCK_ID)

    await pod.poller.stop()
    expect(store.getRow()).toBeNull()
  })

  it("keeps the lease alive with a 60 s poll and a login longer than the lease", async () => {
    const store = createLockStore()
    // The old default poll, which operators may still set, and a 45 s login.
    const pod = createPod(store, "pod-a", 45_000, { pollIntervalMs: 60_000 })

    const started = pod.poller.start()
    const lapses = runOneHourAndFindLapses(store, "pod-a")
    await started

    expect(await lapses).toEqual([])
    expect(pod.callbacks.onLockAcquired).toHaveBeenCalledTimes(1)
    expect(pod.callbacks.onLockLost).not.toHaveBeenCalled()

    await pod.poller.stop()
  })

  it("logs in at the next poll when the config-version read fails on startup", async () => {
    const store = createLockStore()
    const getConfigVersion = jest
      .fn<Promise<number>, []>()
      .mockRejectedValueOnce(new Error("db blip"))
      .mockResolvedValue(0)
    const pod = createPod(store, "pod-a", 2_000, { pollIntervalMs: 60_000, getConfigVersion })

    await pod.poller.start()
    // Nothing was taken, so another pod is free to run the bot meanwhile.
    expect(store.getRow()).toBeNull()

    const lapses = await runOneHourAndFindLapses(store, "pod-a")

    // The first poll, at 60 s, takes the lock; from then on it never lapses.
    expect(lapses).toEqual(Array.from({ length: 59 }, (_, i) => i + 1))
    expect(pod.callbacks.onLockAcquired).toHaveBeenCalledTimes(1)
    expect(pod.callbacks.onLockLost).not.toHaveBeenCalled()

    await pod.poller.stop()
  })

  it("never lets a second pod take the lease while the holder runs", async () => {
    const store = createLockStore()
    const podA = createPod(store, "pod-a", 2_000, { pollIntervalMs: 60_000 })
    const podB = createPod(store, "pod-b", 2_000, { pollIntervalMs: 60_000 })

    const startedA = podA.poller.start()
    await jest.advanceTimersByTimeAsync(0) // pod A takes the lock first
    await podB.poller.start()
    const lapses = runOneHourAndFindLapses(store, "pod-a")
    await startedA

    expect(await lapses).toEqual([])
    expect(podA.callbacks.onLockAcquired).toHaveBeenCalledTimes(1)
    expect(podB.callbacks.onLockAcquired).not.toHaveBeenCalled()
    expect(podB.lock.isHeld()).toBe(false)

    await podB.poller.stop()
    await podA.poller.stop()
  })
})
