/**
 * @jest-environment node
 */

/**
 * Closing the queue's connections at shutdown while Redis reconnects, against
 * the server in TEST_REDIS_URL (the image smoke test's stop after its Redis
 * outage). After a restart, each Worker's own blocking connection reconnects
 * on its own schedule, so it can still be reconnecting when the shared
 * connection is back: `closeWorker` must not wait on it. And
 * `closeRedisConnection` must not wait on commands queued for a Redis it
 * cannot reach.
 */

import { randomUUID } from "node:crypto"
import { Queue, Worker } from "bullmq"
import type Redis from "ioredis"

import { describeRedis } from "@/__tests__/helpers/integration"
import { closeWorker } from "@/lib/queue/close-worker"
import { closeRedisConnection, createFailFastRedis, getRedisConnection, readyWithin } from "@/lib/queue/connection"
import { withTimeout } from "@/lib/utils/with-timeout"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

describeRedis("Closing the queue connections while Redis reconnects", (redisUrl) => {
  const originalEnv = process.env
  let admin: Redis

  beforeAll(async () => {
    admin = createFailFastRedis(redisUrl)
    expect(await readyWithin(admin, 2000)).toBe(true)
  })

  afterEach(async () => {
    await closeRedisConnection()
    process.env = originalEnv
  })

  afterAll(async () => {
    await admin.quit()
  })

  /** The id of the server-side connection named `name`, from CLIENT LIST. */
  async function clientId(name: string): Promise<string> {
    const list = String(await admin.call("CLIENT", "LIST"))
    const line = list.split("\n").find((entry) => entry.includes(` name=${name} `))
    const id = line?.match(/^id=(\d+) /)?.[1]
    if (!id) throw new Error(`No connection named ${name}`)
    return id
  }

  it("forces the close of a Worker whose blocking connection reconnects while the shared one is ready", async () => {
    process.env = { ...originalEnv, REDIS_URL: redisUrl }
    const name = `close-worker-test-${randomUUID()}`
    const worker = new Worker(name, async () => undefined, { connection: getRedisConnection() })
    worker.on("error", () => {})
    await worker.waitUntilReady()
    const blocking = await worker.getBackend().blockingClient
    if (!blocking) throw new Error("The Worker has no blocking connection")

    // A Redis restart drops every connection; dropping only BullMQ's blocking
    // duplicate (named after the queue) leaves the shared one ready
    const reconnecting = new Promise((resolve) => blocking.once("reconnecting", resolve))
    await admin.call("CLIENT", "KILL", "ID", await clientId(`bull:${Buffer.from(name).toString("base64")}`))
    await reconnecting
    expect(getRedisConnection().status).toBe("ready")
    expect(blocking.status).toBe("reconnecting")

    await withTimeout(closeWorker(worker), 2000, "closeWorker")

    const queue = new Queue(name, { connection: admin })
    await queue.obliterate({ force: true })
    await queue.close()
  })

  it("disconnects the shared connection while Redis is unreachable, with a command waiting", async () => {
    // Nothing listens on port 1, so every connect is refused and the client retries
    process.env = { ...originalEnv, REDIS_URL: "redis://127.0.0.1:1" }
    const connection = getRedisConnection()
    const reconnecting = new Promise((resolve) => connection.once("reconnecting", resolve))
    // Waits in the offline queue for a reconnect, as a job added during an outage does
    connection.get("queued-while-unreachable").catch(() => {})
    await reconnecting

    await withTimeout(closeRedisConnection(), 2000, "closeRedisConnection")
  })
})
