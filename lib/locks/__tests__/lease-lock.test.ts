/**
 * Tests for lib/locks/lease-lock.ts: LeaseLock over PrismaLeaseStore.
 *
 * An in-memory `prisma`-shaped store models the `LeaseLock` rows (one per
 * name) and the two legacy lock rows, with a `$transaction(fn)` that runs the
 * callback against the same store, so acquire()'s cleanup, read and write run
 * for real. The instance id and the clock are injected.
 */

import { LeaseLock, PrismaLeaseStore, type LeaseName, type LeaseStore } from "@/lib/locks/lease-lock"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
}))

interface LeaseRow {
  name: string
  instanceId: string
  acquiredAt: Date
  expiresAt: Date
  lastRenewedAt: Date
}

interface LegacyRow {
  id: string
  instanceId: string
  expiresAt: Date
}

const rows = new Map<string, LeaseRow>()
const legacy = { discordBotLock: new Map<string, LegacyRow>(), watchlistSyncLock: new Map<string, LegacyRow>() }

type Where = { name?: string; instanceId?: string; expiresAt?: { lt?: Date; gt?: Date } }

function matches(row: LeaseRow, where: Where): boolean {
  return (
    (!where.name || row.name === where.name) &&
    (!where.instanceId || row.instanceId === where.instanceId) &&
    (!where.expiresAt?.lt || row.expiresAt < where.expiresAt.lt) &&
    (!where.expiresAt?.gt || row.expiresAt > where.expiresAt.gt)
  )
}

const leaseLock = {
  deleteMany: jest.fn(async ({ where }: { where: Where }) => {
    let count = 0
    for (const row of [...rows.values()]) {
      if (matches(row, where)) {
        rows.delete(row.name)
        count++
      }
    }
    return { count }
  }),
  findUnique: jest.fn(async ({ where }: { where: { name: string } }) => {
    const row = rows.get(where.name)
    return row ? { ...row } : null
  }),
  create: jest.fn(async ({ data }: { data: LeaseRow }) => {
    rows.set(data.name, { ...data })
    return { ...data }
  }),
  update: jest.fn(async ({ where, data }: { where: { name: string }; data: Partial<LeaseRow> }) => {
    const row = rows.get(where.name)
    if (!row) throw new Error("row not found")
    Object.assign(row, data)
    return { ...row }
  }),
  updateMany: jest.fn(async ({ where, data }: { where: Where; data: Partial<LeaseRow> }) => {
    let count = 0
    for (const row of rows.values()) {
      if (matches(row, where)) {
        Object.assign(row, data)
        count++
      }
    }
    return { count }
  }),
}

const legacyModel = (table: Map<string, LegacyRow>) => ({
  findUnique: async ({ where }: { where: { id: string } }) => table.get(where.id) ?? null,
})

const tx = {
  leaseLock,
  discordBotLock: legacyModel(legacy.discordBotLock),
  watchlistSyncLock: legacyModel(legacy.watchlistSyncLock),
}

const store = {
  ...tx,
  $transaction: jest.fn<Promise<unknown>, [(tx: unknown) => Promise<unknown>]>((fn): Promise<unknown> => fn(tx)),
}

const INSTANCE = "instance-A"
const OTHER = "instance-B"
const LEASE_MS = 30_000

let clock: Date
const now = () => clock

function makeLock(name: LeaseName = "discord-bot", instanceId = INSTANCE, leaseStore?: LeaseStore) {
  return new LeaseLock({
    name,
    instanceId,
    leaseDurationMs: LEASE_MS,
    store: leaseStore ?? new PrismaLeaseStore(store as never),
    now,
  })
}

function liveRow(name: string, instanceId: string): LeaseRow {
  return {
    name,
    instanceId,
    acquiredAt: clock,
    expiresAt: new Date(clock.getTime() + LEASE_MS),
    lastRenewedAt: clock,
  }
}

beforeEach(() => {
  rows.clear()
  legacy.discordBotLock.clear()
  legacy.watchlistSyncLock.clear()
  clock = new Date("2027-01-01T00:00:00Z")
  jest.clearAllMocks()
})

describe("LeaseLock.acquire", () => {
  it.each<LeaseName>(["discord-bot", "watchlist-sync"])("acquires a free %s lease by creating its row", async (name) => {
    const lock = makeLock(name)

    await expect(lock.acquire()).resolves.toBe(true)

    expect(lock.isHeld()).toBe(true)
    expect(rows.get(name)).toMatchObject({ instanceId: INSTANCE, expiresAt: new Date(clock.getTime() + LEASE_MS) })
  })

  it("fails to acquire a lease held by another live instance", async () => {
    rows.set("discord-bot", liveRow("discord-bot", OTHER))
    const lock = makeLock()

    await expect(lock.acquire()).resolves.toBe(false)

    expect(lock.isHeld()).toBe(false)
    expect(rows.get("discord-bot")?.instanceId).toBe(OTHER)
  })

  it("takes over an expired lease held by another instance", async () => {
    rows.set("discord-bot", { ...liveRow("discord-bot", OTHER), expiresAt: new Date(clock.getTime() - 1) })
    const lock = makeLock()

    await expect(lock.acquire()).resolves.toBe(true)
    expect(rows.get("discord-bot")?.instanceId).toBe(INSTANCE)
  })

  it("re-acquires a lease this instance still owns by extending it", async () => {
    rows.set("discord-bot", { ...liveRow("discord-bot", INSTANCE), expiresAt: new Date(clock.getTime() + 5_000) })
    const lock = makeLock()

    await expect(lock.acquire()).resolves.toBe(true)

    expect(leaseLock.update).toHaveBeenCalledTimes(1)
    expect(rows.get("discord-bot")?.expiresAt.getTime()).toBe(clock.getTime() + LEASE_MS)
  })

  it("short-circuits when already held (no store call)", async () => {
    const lock = makeLock()
    await lock.acquire()
    jest.clearAllMocks()

    await expect(lock.acquire()).resolves.toBe(true)
    expect(store.$transaction).not.toHaveBeenCalled()
  })

  it("returns false and stays unheld when the transaction throws", async () => {
    store.$transaction.mockRejectedValueOnce(new Error("db down"))
    const lock = makeLock()

    await expect(lock.acquire()).resolves.toBe(false)
    expect(lock.isHeld()).toBe(false)
  })
})

describe("LeaseLock names", () => {
  it("never lets two names conflict", async () => {
    const bot = makeLock("discord-bot", INSTANCE)
    const sync = makeLock("watchlist-sync", OTHER)

    await expect(bot.acquire()).resolves.toBe(true)
    await expect(sync.acquire()).resolves.toBe(true)

    await bot.release()
    expect(rows.has("discord-bot")).toBe(false)
    expect(rows.get("watchlist-sync")?.instanceId).toBe(OTHER)
    await expect(sync.renew()).resolves.toBe(true)
  })

  it("leaves another name's expired row alone when acquiring", async () => {
    rows.set("watchlist-sync", { ...liveRow("watchlist-sync", OTHER), expiresAt: new Date(clock.getTime() - 1) })

    await makeLock("discord-bot").acquire()

    expect(rows.has("watchlist-sync")).toBe(true)
  })
})

describe("LeaseLock legacy overlap check (one release)", () => {
  it.each([
    ["discord-bot", legacy.discordBotLock],
    ["watchlist-sync", legacy.watchlistSyncLock],
  ] as const)("refuses %s while its live legacy row belongs to another instance", async (name, table) => {
    table.set(name, { id: name, instanceId: OTHER, expiresAt: new Date(clock.getTime() + LEASE_MS) })
    const lock = makeLock(name)

    await expect(lock.acquire()).resolves.toBe(false)

    expect(rows.has(name)).toBe(false)
  })

  it("acquires once the legacy row has expired", async () => {
    legacy.discordBotLock.set("discord-bot", { id: "discord-bot", instanceId: OTHER, expiresAt: new Date(clock.getTime() - 1) })

    await expect(makeLock().acquire()).resolves.toBe(true)
  })

  it("ignores the other role's legacy row", async () => {
    legacy.watchlistSyncLock.set("watchlist-sync", {
      id: "watchlist-sync",
      instanceId: OTHER,
      expiresAt: new Date(clock.getTime() + LEASE_MS),
    })

    await expect(makeLock("discord-bot").acquire()).resolves.toBe(true)
  })
})

describe("LeaseLock.renew", () => {
  it("extends the lease when still owned", async () => {
    const lock = makeLock()
    await lock.acquire()
    clock = new Date(clock.getTime() + 10_000)

    await expect(lock.renew()).resolves.toBe(true)

    expect(rows.get("discord-bot")).toMatchObject({
      expiresAt: new Date(clock.getTime() + LEASE_MS),
      lastRenewedAt: clock,
    })
  })

  it("returns false without a store call when not held", async () => {
    await expect(makeLock().renew()).resolves.toBe(false)
    expect(leaseLock.updateMany).not.toHaveBeenCalled()
  })

  it("surrenders held state when another instance took the row", async () => {
    const lock = makeLock()
    await lock.acquire()
    rows.set("discord-bot", liveRow("discord-bot", OTHER))

    await expect(lock.renew()).resolves.toBe(false)
    expect(lock.isHeld()).toBe(false)
  })

  it("surrenders held state when the lease already lapsed", async () => {
    const lock = makeLock()
    await lock.acquire()
    clock = new Date(clock.getTime() + LEASE_MS + 1)

    await expect(lock.renew()).resolves.toBe(false)
    expect(lock.isHeld()).toBe(false)
  })

  it("surrenders held state when the store throws", async () => {
    const lock = makeLock()
    await lock.acquire()
    leaseLock.updateMany.mockRejectedValueOnce(new Error("db down"))

    await expect(lock.renew()).resolves.toBe(false)
    expect(lock.isHeld()).toBe(false)
  })
})

describe("LeaseLock.release", () => {
  it("deletes only its own row and clears held state", async () => {
    const lock = makeLock()
    await lock.acquire()

    await lock.release()

    expect(lock.isHeld()).toBe(false)
    expect(rows.has("discord-bot")).toBe(false)
  })

  it("is a no-op when not held", async () => {
    await makeLock().release()
    expect(leaseLock.deleteMany).not.toHaveBeenCalled()
  })

  it("clears held state even if the delete throws", async () => {
    const lock = makeLock()
    await lock.acquire()
    leaseLock.deleteMany.mockRejectedValueOnce(new Error("db down"))

    await lock.release()

    expect(lock.isHeld()).toBe(false)
  })
})

describe("LeaseLock with another store", () => {
  it("delegates every call to the injected LeaseStore", async () => {
    const custom: LeaseStore = {
      acquire: jest.fn().mockResolvedValue(true),
      renew: jest.fn().mockResolvedValue(true),
      release: jest.fn().mockResolvedValue(undefined),
    }
    const lock = makeLock("watchlist-sync", INSTANCE, custom)

    await lock.acquire()
    await lock.renew()
    await lock.release()

    expect(custom.acquire).toHaveBeenCalledWith({
      name: "watchlist-sync",
      instanceId: INSTANCE,
      now: clock,
      expiresAt: new Date(clock.getTime() + LEASE_MS),
    })
    expect(custom.release).toHaveBeenCalledWith("watchlist-sync", INSTANCE)
    expect(lock.getInstanceId()).toBe(INSTANCE)
  })
})
