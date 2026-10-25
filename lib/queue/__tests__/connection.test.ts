/**
 * @jest-environment node
 */

/**
 * The shared Redis connections (P11.22): the BullMQ connection is built on
 * first use and never at import, needs REDIS_URL, and closes with a forced
 * disconnect when QUIT fails; the request-path client starts connecting when
 * first asked for and registers its close; `readyWithin` settles on ready or
 * on its deadline.
 */

import { EventEmitter } from "node:events"

import Redis from "ioredis"

import { onShutdown } from "@/lib/instrumentation/shutdown"
import {
  closeRedisConnection,
  getRedisConnection,
  getRequestPathRedis,
  isRedisConfigured,
  readyWithin,
} from "@/lib/queue/connection"

/** An ioredis stand-in: events, a status and the calls the module makes. */
class FakeRedis extends EventEmitter {
  status = "wait"
  quit = jest.fn(async () => "OK")
  disconnect = jest.fn()
  connect = jest.fn(async () => {})
  constructor(
    readonly url: string,
    readonly options: Record<string, unknown>
  ) {
    super()
  }
}

jest.mock("ioredis", () => ({ __esModule: true, default: jest.fn() }))
jest.mock("@/lib/instrumentation/shutdown", () => ({ onShutdown: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const RedisMock = jest.mocked(Redis)
const originalEnv = process.env

beforeEach(async () => {
  process.env = { ...originalEnv, REDIS_URL: "redis://localhost:6390/3" }
  RedisMock.mockReset().mockImplementation(((url: string, options: Record<string, unknown>) => new FakeRedis(url, options)) as never)
  await closeRedisConnection()
  RedisMock.mockClear()
})

afterAll(() => {
  process.env = originalEnv
})

function created(index = 0): FakeRedis {
  return RedisMock.mock.results[index].value as FakeRedis
}

describe("getRedisConnection", () => {
  it("connects lazily: nothing at import, one client on first use", () => {
    expect(RedisMock).not.toHaveBeenCalled()

    const first = getRedisConnection()

    expect(getRedisConnection()).toBe(first)
    expect(RedisMock).toHaveBeenCalledTimes(1)
    expect(RedisMock).toHaveBeenCalledWith("redis://localhost:6390/3", {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    })
  })

  it("needs REDIS_URL", () => {
    delete process.env.REDIS_URL

    expect(isRedisConfigured()).toBe(false)
    expect(() => getRedisConnection()).toThrow("REDIS_URL environment variable is required")
  })

  it("survives its connection events", () => {
    const client = getRedisConnection() as unknown as FakeRedis

    for (const event of ["connect", "close", "reconnecting"]) client.emit(event)
    client.emit("error", new Error("refused"))

    expect(isRedisConfigured()).toBe(true)
  })
})

describe("closeRedisConnection", () => {
  it("quits, and the next use builds a new client", async () => {
    getRedisConnection()

    await closeRedisConnection()
    getRedisConnection()

    expect(created(0).quit).toHaveBeenCalledTimes(1)
    expect(RedisMock).toHaveBeenCalledTimes(2)
  })

  it("disconnects when QUIT fails", async () => {
    getRedisConnection()
    created(0).quit.mockRejectedValueOnce(new Error("closed"))

    await closeRedisConnection()

    expect(created(0).disconnect).toHaveBeenCalledTimes(1)
  })

  it("does nothing before first use", async () => {
    await closeRedisConnection()

    expect(RedisMock).not.toHaveBeenCalled()
  })
})

describe("getRequestPathRedis", () => {
  it("builds one fail-fast client that starts connecting, and closes it on shutdown", async () => {
    const client = getRequestPathRedis() as unknown as FakeRedis

    expect(getRequestPathRedis()).toBe(client)
    expect(client.options).toEqual(expect.objectContaining({ enableOfflineQueue: false, commandTimeout: 2000, lazyConnect: true }))
    expect(client.connect).toHaveBeenCalledTimes(1)
    client.emit("error", new Error("refused"))

    const [name, phase, close] = jest.mocked(onShutdown).mock.calls[0]
    expect([name, phase]).toEqual(["request-path-redis", "close"])
    await close()
    expect(client.disconnect).toHaveBeenCalledTimes(1)
  })
})

describe("readyWithin", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("answers true at once for a ready client", async () => {
    const client = new FakeRedis("", {})
    client.status = "ready"

    await expect(readyWithin(client as unknown as Redis, 100)).resolves.toBe(true)
    expect(client.connect).not.toHaveBeenCalled()
  })

  it("connects a waiting client and answers true when it becomes ready", async () => {
    const client = new FakeRedis("", {})
    const ready = readyWithin(client as unknown as Redis, 1000)

    expect(client.connect).toHaveBeenCalledTimes(1)
    client.emit("ready")

    await expect(ready).resolves.toBe(true)
    expect(client.listenerCount("ready")).toBe(0)
  })

  it("answers false at the deadline, without connecting a client that is already connecting", async () => {
    const client = new FakeRedis("", {})
    client.status = "connecting"
    const ready = readyWithin(client as unknown as Redis, 1000)

    jest.advanceTimersByTime(1000)

    await expect(ready).resolves.toBe(false)
    expect(client.connect).not.toHaveBeenCalled()
    expect(client.listenerCount("ready")).toBe(0)
  })
})
