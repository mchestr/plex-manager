/**
 * @jest-environment node
 */

/**
 * Request ids across the queue (BP-17, P11.4): a job added in a request
 * carries `_meta.requestId`, its processor's log lines carry that id, and the
 * jobs it fans out inherit it.
 */

import type { Queue } from "bullmq"

import { captureProductionLogs } from "@/__tests__/helpers/log-capture"

type JobMetaModule = typeof import("@/lib/queue/job-meta")
type LogContextModule = typeof import("@/lib/utils/log-context")

// The logger, the context and job-meta from one module registry, so they share the store
const { createLogger, lines, loaded } = captureProductionLogs(() => ({
  jobMeta: require("@/lib/queue/job-meta") as JobMetaModule,
  logContext: require("@/lib/utils/log-context") as LogContextModule,
}))
const { jobRequestId, runJobInContext, traceQueue } = loaded.jobMeta
const { runWithRequestContext } = loaded.logContext
const logger = createLogger("job-test")

function fakeQueue() {
  const add = jest.fn(async (name: string, data: unknown) => ({ id: "1", name, data }))
  const addBulk = jest.fn(async (jobs: Array<{ name: string; data: unknown }>) => jobs)
  return { queue: traceQueue<Queue>({ add, addBulk } as never), add, addBulk }
}

beforeEach(() => {
  lines.length = 0
})

describe("enqueueing", () => {
  it("stamps the request id on add and addBulk inside a request", async () => {
    const { queue, add, addBulk } = fakeQueue()

    await runWithRequestContext("demo-1234abcd", "user-1", async () => {
      await queue.add("watchlist:sync:user", { userId: "user-1" }, { attempts: 3 })
      await queue.addBulk([{ name: "rewind:notify", data: { year: 2026 } }])
    })

    expect(add).toHaveBeenCalledWith(
      "watchlist:sync:user",
      { userId: "user-1", _meta: { requestId: "demo-1234abcd" } },
      { attempts: 3 }
    )
    expect(addBulk).toHaveBeenCalledWith([{ name: "rewind:notify", data: { year: 2026, _meta: { requestId: "demo-1234abcd" } } }])
  })

  it("leaves the payload alone outside a request", async () => {
    const { queue, add } = fakeQueue()

    await queue.add("watchlist:sync:all", { triggeredBy: "scheduled" })

    expect(add).toHaveBeenCalledWith("watchlist:sync:all", { triggeredBy: "scheduled" }, undefined)
  })
})

describe("processing", () => {
  it("runs the processor with the payload's request id on its log lines", async () => {
    const job = { id: "42", data: { userId: "user-1", _meta: { requestId: "demo-1234abcd" } } }

    await runJobInContext(job, async () => {
      logger.error("Sync failed", new Error("Plex said no"))
    })

    expect(lines).toHaveLength(1)
    expect(lines[0].metadata?.requestId).toBe("demo-1234abcd")
  })

  it("uses job:<id> for a job without _meta, or with a malformed one", () => {
    expect(jobRequestId({ id: "7", data: {} })).toBe("job:7")
    expect(jobRequestId({ id: "8", data: { _meta: { requestId: 12 } } })).toBe("job:8")
  })

  it("passes the id on to the jobs a job fans out", async () => {
    const { queue, addBulk } = fakeQueue()
    const batch = { id: "batch-1", data: { year: 2026, _meta: { requestId: "demo-1234abcd" } } }

    await runJobInContext(batch, () => queue.addBulk([{ name: "rewind:generate:user", data: { userId: "u" } }]))

    expect(addBulk).toHaveBeenCalledWith([
      { name: "rewind:generate:user", data: { userId: "u", _meta: { requestId: "demo-1234abcd" } } },
    ])
  })
})
