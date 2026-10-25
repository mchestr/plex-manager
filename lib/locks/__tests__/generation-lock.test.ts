/**
 * @jest-environment node
 */

/**
 * The per-member Rewind generation lock (design 9.1) without Redis
 * (P11.22): a fake Redis keeps owners in a Map and answers the lease store's
 * acquire, renew and release scripts. `generation-lock.redis.test.ts` runs the
 * same lock against a real Redis.
 */

import { acquireGenerationLock } from "@/lib/locks/generation-lock"
import { createLogger } from "@/lib/utils/logger"

jest.mock("@/lib/utils/logger", () => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { createLogger: () => logger }
})

const logger = createLogger("GENERATION_LOCK")
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
const KEY = "rw:lock:gen:2026:u1"

beforeEach(() => {
  jest.useFakeTimers()
  owners.clear()
  jest.clearAllMocks()
})

afterEach(() => jest.useRealTimers())

describe("acquireGenerationLock", () => {
  it("takes rw:lock:gen:{year}:{userId} for the job and releases it", async () => {
    const lock = await acquireGenerationLock(redis, { year: 2026, userId: "u1", owner: "job-1" })

    expect(lock).not.toBeNull()
    expect(owners.get(KEY)).toBe("job-1")
    await expect(lock!.release()).resolves.toBe(true)
    expect(owners.has(KEY)).toBe(false)
  })

  it("answers null while another job holds it, and lets the same job take it back", async () => {
    owners.set(KEY, "job-1")

    await expect(acquireGenerationLock(redis, { year: 2026, userId: "u1", owner: "job-2" })).resolves.toBeNull()
    await expect(acquireGenerationLock(redis, { year: 2026, userId: "u1", owner: "job-1" })).resolves.not.toBeNull()
  })

  it("renews every minute until released", async () => {
    const lock = await acquireGenerationLock(redis, { year: 2026, userId: "u1", owner: "job-1" })
    redisMock.eval.mockClear()

    await jest.advanceTimersByTimeAsync(120_000)
    expect(redisMock.eval).toHaveBeenCalledTimes(2)

    await lock!.release()
    redisMock.eval.mockClear()
    await jest.advanceTimersByTimeAsync(120_000)
    expect(redisMock.eval).not.toHaveBeenCalled()
  })

  it("stops renewing and logs once the lease is lost", async () => {
    await acquireGenerationLock(redis, { year: 2026, userId: "u1", owner: "job-1" })
    owners.set(KEY, "job-2")
    redisMock.eval.mockClear()

    await jest.advanceTimersByTimeAsync(180_000)

    expect(redisMock.eval).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith("Generation lock lost before renewal", { key: KEY })
  })

  it("lets a Redis error on acquire propagate", async () => {
    redisMock.eval.mockRejectedValueOnce(new Error("ECONNREFUSED"))

    await expect(acquireGenerationLock(redis, { year: 2026, userId: "u1", owner: "job-1" })).rejects.toThrow("ECONNREFUSED")
  })
})
