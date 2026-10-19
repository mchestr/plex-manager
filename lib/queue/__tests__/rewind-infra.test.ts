/**
 * @jest-environment node
 */

import { EventEmitter } from "node:events"

type InfraModule = typeof import("@/lib/queue/rewind-infra")

/** Stands in for an ioredis client; each test sets how it behaves. */
class FakeRedis extends EventEmitter {
  static instances: FakeRedis[] = []
  static initialStatus = "connecting"
  status = FakeRedis.initialStatus
  options: unknown
  ping = jest.fn(async () => "PONG")
  connect = jest.fn(async () => {})
  disconnect = jest.fn()

  constructor(_url: string, options: unknown) {
    super()
    this.options = options
    FakeRedis.instances.push(this)
  }
}

jest.mock("ioredis", () => ({ __esModule: true, default: FakeRedis }))

async function loadModule(): Promise<InfraModule> {
  jest.resetModules()
  return import("@/lib/queue/rewind-infra")
}

describe("checkRewindInfra", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    FakeRedis.instances = []
    FakeRedis.initialStatus = "connecting"
    process.env.REDIS_URL = "redis://localhost:6379/8"
  })

  afterEach(() => {
    jest.useRealTimers()
    delete process.env.REDIS_URL
  })

  it("returns REDIS_NOT_CONFIGURED without REDIS_URL, and opens no connection", async () => {
    delete process.env.REDIS_URL
    const { checkRewindInfra } = await loadModule()

    expect(await checkRewindInfra()).toEqual({ ok: false, code: "REDIS_NOT_CONFIGURED" })
    expect(FakeRedis.instances).toHaveLength(0)
  })

  it("uses the fail-fast client settings and connects it at once", async () => {
    FakeRedis.initialStatus = "ready"
    const { checkRewindInfra } = await loadModule()

    expect(await checkRewindInfra()).toEqual({ ok: true })
    const [client] = FakeRedis.instances
    expect(client.options).toMatchObject({
      enableOfflineQueue: false,
      connectTimeout: 2000,
      commandTimeout: 2000,
      maxRetriesPerRequest: 1,
    })
    expect(client.connect).toHaveBeenCalledTimes(1)
  })

  it("waits for a connecting client, then pings it", async () => {
    const { checkRewindInfra } = await loadModule()
    const result = checkRewindInfra()
    const [client] = FakeRedis.instances

    await jest.advanceTimersByTimeAsync(300)
    client.status = "ready"
    client.emit("ready")

    expect(await result).toEqual({ ok: true })
    expect(client.ping).toHaveBeenCalledTimes(1)
  })

  it("returns REDIS_UNAVAILABLE within 2.5 s when the connection is closed", async () => {
    FakeRedis.initialStatus = "reconnecting"
    const { checkRewindInfra } = await loadModule()
    let settled: unknown
    void checkRewindInfra().then((value) => {
      settled = value
    })

    await jest.advanceTimersByTimeAsync(1999)
    expect(settled).toBeUndefined()
    await jest.advanceTimersByTimeAsync(1)
    expect(settled).toEqual({ ok: false, code: "REDIS_UNAVAILABLE" })
  })

  it("returns REDIS_UNAVAILABLE when the ping fails", async () => {
    FakeRedis.initialStatus = "ready"
    const { checkRewindInfra } = await loadModule()
    const result = checkRewindInfra()
    // The ping is sent on a later tick, after this rejection is set up.
    FakeRedis.instances[0].ping.mockRejectedValueOnce(new Error("Connection is closed."))

    expect(await result).toEqual({ ok: false, code: "REDIS_UNAVAILABLE" })
  })

  it("caches the result for 10 s", async () => {
    FakeRedis.initialStatus = "ready"
    const { checkRewindInfra } = await loadModule()
    expect(await checkRewindInfra()).toEqual({ ok: true })
    const client = FakeRedis.instances[0]
    client.ping.mockRejectedValue(new Error("down"))

    await jest.advanceTimersByTimeAsync(9_999)
    expect(await checkRewindInfra()).toEqual({ ok: true })
    expect(client.ping).toHaveBeenCalledTimes(1)

    await jest.advanceTimersByTimeAsync(1)
    expect(await checkRewindInfra()).toEqual({ ok: false, code: "REDIS_UNAVAILABLE" })
    expect(client.ping).toHaveBeenCalledTimes(2)
  })
})
