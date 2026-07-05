/**
 * Tests for lib/discord/lock/lease.ts - the DistributedLock class.
 *
 * A tiny in-memory `prisma`-shaped store models the single `DiscordBotLock` row
 * and a transactional `$transaction(fn)` so acquire()'s cleanup → read → write
 * ordering is exercised for real. INSTANCE_ID and the clock are injected so
 * ownership and expiry are deterministic.
 */

import { DistributedLock, DISCORD_BOT_LOCK_ID } from "@/lib/discord/lock/lease"

// The module imports the real prisma client at load; stub it so module
// evaluation doesn't require DATABASE_URL. Every test injects its own store.
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

let row: LockRow | null

// `prisma`-shaped facade over the single-row store.
const store = {
  discordBotLock: {
    deleteMany: jest.fn((args: { where: { expiresAt?: { lt: Date }; id?: string; instanceId?: string } }) => {
      let count = 0
      if (row) {
        const w = args.where
        const matchesExpiry = w.expiresAt ? row.expiresAt < w.expiresAt.lt : true
        const matchesId = w.id ? row.id === w.id : true
        const matchesInstance = w.instanceId ? row.instanceId === w.instanceId : true
        if (matchesExpiry && matchesId && matchesInstance) {
          row = null
          count = 1
        }
      }
      return Promise.resolve({ count })
    }),
    findUnique: jest.fn((args: { where: { id: string } }) =>
      Promise.resolve(row && row.id === args.where.id ? { ...row } : null)
    ),
    create: jest.fn((args: { data: Omit<LockRow, "updatedAt"> }) => {
      row = { ...args.data, updatedAt: args.data.acquiredAt }
      return Promise.resolve({ ...row })
    }),
    update: jest.fn((args: { where: { id: string }; data: Partial<LockRow> }) => {
      if (!row || row.id !== args.where.id) throw new Error("row not found")
      row = { ...row, ...args.data }
      return Promise.resolve({ ...row })
    }),
    updateMany: jest.fn(
      (args: {
        where: { id: string; instanceId: string; expiresAt?: { gt: Date } }
        data: Partial<LockRow>
      }) => {
        if (
          row &&
          row.id === args.where.id &&
          row.instanceId === args.where.instanceId &&
          (!args.where.expiresAt || row.expiresAt > args.where.expiresAt.gt)
        ) {
          row = { ...row, ...args.data }
          return Promise.resolve({ count: 1 })
        }
        return Promise.resolve({ count: 0 })
      }
    ),
  },
  $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(store)),
}

const INSTANCE = "instance-A"
const OTHER = "instance-B"
const LEASE_MS = 30_000

let clock: Date
const now = () => clock

function makeLock(instanceId = INSTANCE) {
  return new DistributedLock({
    instanceId,
    leaseDurationMs: LEASE_MS,
    prisma: store as never,
    now,
  })
}

beforeEach(() => {
  row = null
  clock = new Date("2026-01-01T00:00:00Z")
  jest.clearAllMocks()
})

describe("DistributedLock.acquire", () => {
  it("acquires a free lock by creating the row", async () => {
    const lock = makeLock()
    const acquired = await lock.acquire()

    expect(acquired).toBe(true)
    expect(lock.isHeld()).toBe(true)
    expect(row).not.toBeNull()
    expect(row?.instanceId).toBe(INSTANCE)
    expect(row?.id).toBe(DISCORD_BOT_LOCK_ID)
    expect(store.discordBotLock.create).toHaveBeenCalledTimes(1)
  })

  it("fails to acquire a lock held by another live instance", async () => {
    row = {
      id: DISCORD_BOT_LOCK_ID,
      instanceId: OTHER,
      acquiredAt: clock,
      expiresAt: new Date(clock.getTime() + LEASE_MS),
      lastRenewedAt: clock,
      updatedAt: clock,
    }

    const lock = makeLock()
    const acquired = await lock.acquire()

    expect(acquired).toBe(false)
    expect(lock.isHeld()).toBe(false)
    expect(row?.instanceId).toBe(OTHER) // untouched
  })

  it("takes over an expired lock held by another instance", async () => {
    row = {
      id: DISCORD_BOT_LOCK_ID,
      instanceId: OTHER,
      acquiredAt: new Date(clock.getTime() - 2 * LEASE_MS),
      expiresAt: new Date(clock.getTime() - LEASE_MS), // expired
      lastRenewedAt: new Date(clock.getTime() - 2 * LEASE_MS),
      updatedAt: new Date(clock.getTime() - 2 * LEASE_MS),
    }

    const lock = makeLock()
    const acquired = await lock.acquire()

    expect(acquired).toBe(true)
    expect(lock.isHeld()).toBe(true)
    // Expired row is deleted then re-created for us.
    expect(row?.instanceId).toBe(INSTANCE)
  })

  it("re-acquires (updates) a lock already owned by this instance", async () => {
    row = {
      id: DISCORD_BOT_LOCK_ID,
      instanceId: INSTANCE,
      acquiredAt: clock,
      expiresAt: new Date(clock.getTime() + 5_000),
      lastRenewedAt: clock,
      updatedAt: clock,
    }

    const lock = makeLock()
    const acquired = await lock.acquire()

    expect(acquired).toBe(true)
    expect(lock.isHeld()).toBe(true)
    expect(store.discordBotLock.update).toHaveBeenCalledTimes(1)
    expect(row?.expiresAt.getTime()).toBe(clock.getTime() + LEASE_MS)
  })

  it("short-circuits when already held (no DB call)", async () => {
    const lock = makeLock()
    await lock.acquire()
    jest.clearAllMocks()

    const again = await lock.acquire()

    expect(again).toBe(true)
    expect(store.$transaction).not.toHaveBeenCalled()
  })

  it("returns false and stays unheld when the transaction throws", async () => {
    store.$transaction.mockRejectedValueOnce(new Error("db down"))
    const lock = makeLock()

    const acquired = await lock.acquire()

    expect(acquired).toBe(false)
    expect(lock.isHeld()).toBe(false)
  })
})

describe("DistributedLock.renew", () => {
  it("extends the lease when still owned", async () => {
    const lock = makeLock()
    await lock.acquire()

    // advance the clock; renewal should push expiry forward from new "now"
    clock = new Date(clock.getTime() + 10_000)
    const renewed = await lock.renew()

    expect(renewed).toBe(true)
    expect(lock.isHeld()).toBe(true)
    expect(row?.expiresAt.getTime()).toBe(clock.getTime() + LEASE_MS)
  })

  it("returns false without a DB call when not held", async () => {
    const lock = makeLock()
    const renewed = await lock.renew()

    expect(renewed).toBe(false)
    expect(store.discordBotLock.updateMany).not.toHaveBeenCalled()
  })

  it("surrenders held state when the row was taken by another instance", async () => {
    const lock = makeLock()
    await lock.acquire()

    // Another instance stole the row.
    row = { ...row!, instanceId: OTHER }

    const renewed = await lock.renew()

    expect(renewed).toBe(false)
    expect(lock.isHeld()).toBe(false)
  })
})

describe("DistributedLock.release", () => {
  it("deletes the row and clears held state when owned", async () => {
    const lock = makeLock()
    await lock.acquire()

    await lock.release()

    expect(lock.isHeld()).toBe(false)
    expect(row).toBeNull()
  })

  it("is a no-op when not held", async () => {
    const lock = makeLock()
    await lock.release()

    expect(store.discordBotLock.deleteMany).not.toHaveBeenCalled()
  })

  it("clears held state even if the delete throws", async () => {
    const lock = makeLock()
    await lock.acquire()
    store.discordBotLock.deleteMany.mockRejectedValueOnce(new Error("db down"))

    await lock.release()

    expect(lock.isHeld()).toBe(false)
  })
})

describe("DistributedLock.isHeld / getInstanceId", () => {
  it("reflects lifecycle transitions", async () => {
    const lock = makeLock()
    expect(lock.isHeld()).toBe(false)
    await lock.acquire()
    expect(lock.isHeld()).toBe(true)
    await lock.release()
    expect(lock.isHeld()).toBe(false)
  })

  it("exposes the injected instance id", () => {
    expect(makeLock("custom").getInstanceId()).toBe("custom")
  })
})
