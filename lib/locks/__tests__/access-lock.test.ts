/**
 * @jest-environment node
 */

/**
 * The per-member access lock (P11.3): a grant and a revoke for one member
 * never run at once. A fake Redis keeps owners in a Map and answers the
 * store's three scripts; `redis-lease-store.redis.test.ts` runs them for real.
 */

import { AccessLockBusyError, withAccessLock } from "@/lib/locks/access-lock"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const owners = new Map<string, string>()

/** Answers the acquire (SET), renew (PEXPIRE) and release (DEL) scripts. */
const redisMock = {
  eval: jest.fn(async (script: string, _keys: number, key: string, owner: string) => {
    const holder = owners.get(key)
    if (script.includes("'SET'")) {
      if (holder && holder !== owner) return 0
      owners.set(key, owner)
      return 1
    }
    if (holder !== owner) return 0
    if (script.includes("'DEL'")) owners.delete(key)
    return 1
  }),
}
const redis = redisMock as never

beforeEach(() => {
  owners.clear()
  redisMock.eval.mockClear()
})

describe("withAccessLock", () => {
  it("runs the work under access:<userId> and releases it afterwards", async () => {
    const result = await withAccessLock(
      "u1",
      "job-1",
      async () => {
        expect(owners.get("access:u1")).toBe("job-1")
        return "done"
      },
      { redis }
    )

    expect(result).toBe("done")
    expect(owners.has("access:u1")).toBe(false)
  })

  it("releases the lock when the work throws", async () => {
    await expect(
      withAccessLock("u1", "job-1", () => Promise.reject(new Error("plex down")), { redis })
    ).rejects.toThrow("plex down")

    expect(owners.has("access:u1")).toBe(false)
  })

  it("waits for a grant to finish before a revoke for the same member runs", async () => {
    const order: string[] = []
    let finishGrant: () => void = () => {}
    const grant = withAccessLock(
      "u1",
      "grant-1",
      async () => {
        order.push("grant start")
        await new Promise<void>((resolve) => (finishGrant = resolve))
        order.push("grant end")
      },
      { redis, pollMs: 5 }
    )
    await new Promise((resolve) => setTimeout(resolve, 10))

    const revoke = withAccessLock("u1", "revoke-1", async () => void order.push("revoke"), { redis, pollMs: 5 })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(order).toEqual(["grant start"])

    finishGrant()
    await Promise.all([grant, revoke])
    expect(order).toEqual(["grant start", "grant end", "revoke"])
  })

  it("never blocks another member", async () => {
    owners.set("access:u1", "grant-1")

    await expect(withAccessLock("u2", "revoke-2", async () => "ok", { redis, waitMs: 0 })).resolves.toBe("ok")
  })

  it("gives up with AccessLockBusyError after the wait, so BullMQ retries the job", async () => {
    owners.set("access:u1", "grant-1")
    const work = jest.fn()

    await expect(withAccessLock("u1", "revoke-1", work, { redis, waitMs: 20, pollMs: 5 })).rejects.toBeInstanceOf(
      AccessLockBusyError
    )
    expect(work).not.toHaveBeenCalled()
    expect(owners.get("access:u1")).toBe("grant-1")
  })

  it("renews every minute while the work runs, and stops once the lease is lost", async () => {
    jest.useFakeTimers()
    try {
      let finish: () => void = () => {}
      const run = withAccessLock("u1", "job-1", () => new Promise<void>((resolve) => (finish = resolve)), { redis })
      await jest.advanceTimersByTimeAsync(0)
      redisMock.eval.mockClear()

      await jest.advanceTimersByTimeAsync(60_000)
      expect(redisMock.eval).toHaveBeenCalledTimes(1)

      owners.set("access:u1", "job-2")
      await jest.advanceTimersByTimeAsync(180_000)
      expect(redisMock.eval).toHaveBeenCalledTimes(2)

      finish()
      await run
      expect(owners.get("access:u1")).toBe("job-2")
    } finally {
      jest.useRealTimers()
    }
  })
})
