/**
 * @jest-environment node
 */

/**
 * `enqueueFromRequest` with Redis up (P11.22): one request-path queue on the
 * fail-fast client, closed on shutdown; a job goes in under its policy id, a
 * second add with the same deduplication id gets the first job's id, and a
 * failing add answers QUEUE_UNAVAILABLE instead of throwing.
 * `isDeduplicatedJobPending` reads the job holding a deduplication id and its
 * state. `request-path.test.ts` covers Redis down.
 */

import { Queue } from "bullmq"

import { onShutdown } from "@/lib/instrumentation/shutdown"
import { enqueueFromRequest, isDeduplicatedJobPending, withRequestPathQueue } from "@/lib/queue/request-path"
import { JOB_TYPES } from "@/lib/queue/types"

const mockLive = new Map<string, string>()
const mockAdd = jest.fn(async (_name: string, _data: unknown, opts: { jobId?: string; deduplication?: { id: string } }) => {
  const dedupId = opts.deduplication?.id
  if (dedupId && mockLive.has(dedupId)) return { id: mockLive.get(dedupId) }
  const id = opts.jobId ?? `job-${mockLive.size + 1}`
  if (dedupId) mockLive.set(dedupId, id)
  return { id }
})
const mockClose = jest.fn(async () => {})
const mockGetDeduplicationJobId = jest.fn(async (id: string): Promise<string | null> => mockLive.get(id) ?? null)
const mockGetJobState = jest.fn(async (_jobId: string): Promise<string> => "waiting")

jest.mock("bullmq", () => ({
  Queue: jest.fn(() => ({
    add: mockAdd,
    addBulk: jest.fn(),
    close: mockClose,
    getDeduplicationJobId: mockGetDeduplicationJobId,
    getJobState: mockGetJobState,
  })),
}))
jest.mock("@/lib/queue/connection", () => ({
  getRequestPathRedis: jest.fn(() => ({ status: "ready" })),
  readyWithin: jest.fn(async () => true),
}))
jest.mock("@/lib/instrumentation/shutdown", () => ({ onShutdown: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

beforeEach(() => {
  mockLive.clear()
  mockAdd.mockClear()
})

describe("enqueueFromRequest with Redis up", () => {
  it("adds the job under its policy id", async () => {
    await expect(enqueueFromRequest(JOB_TYPES.WATCHLIST_SYNC_ALL, { triggeredBy: "admin" })).resolves.toEqual({ ok: true, jobId: "job-1" })

    expect(mockAdd).toHaveBeenCalledWith(
      JOB_TYPES.WATCHLIST_SYNC_ALL,
      { triggeredBy: "admin" },
      expect.objectContaining({ deduplication: { id: "watchlist:all" } })
    )
  })

  it("gives two adds with one deduplication id one job", async () => {
    const first = await enqueueFromRequest(JOB_TYPES.WATCHLIST_SYNC_ALL, { triggeredBy: "admin" })
    const second = await enqueueFromRequest(JOB_TYPES.WATCHLIST_SYNC_ALL, { triggeredBy: "scheduled" })

    expect(second).toEqual(first)
    expect(mockLive.size).toBe(1)
  })

  it("answers QUEUE_UNAVAILABLE when the add fails", async () => {
    mockAdd.mockRejectedValueOnce(new Error("Command timed out"))

    await expect(enqueueFromRequest(JOB_TYPES.WATCHLIST_SYNC_ALL, { triggeredBy: "admin" })).resolves.toEqual({
      ok: false,
      code: "QUEUE_UNAVAILABLE",
    })
  })

  it("builds one queue on the request-path client and closes it on shutdown", async () => {
    await withRequestPathQueue("a", async () => null)
    await withRequestPathQueue("b", async () => null)

    expect(Queue).toHaveBeenCalledTimes(1)
    const [name, phase, close] = jest.mocked(onShutdown).mock.calls[0]
    expect([name, phase]).toEqual(["request-path-queue", "close"])
    await close()
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it("answers QUEUE_UNAVAILABLE when the work throws a non-Error", async () => {
    await expect(withRequestPathQueue("c", () => Promise.reject("nope"))).resolves.toEqual({ ok: false, code: "QUEUE_UNAVAILABLE" })
  })
})

describe("isDeduplicatedJobPending with Redis up", () => {
  it("is false when no job holds the deduplication id", async () => {
    await expect(isDeduplicatedJobPending("members:activity")).resolves.toEqual({ ok: true, value: false })

    expect(mockGetDeduplicationJobId).toHaveBeenCalledWith("members:activity")
    expect(mockGetJobState).not.toHaveBeenCalled()
  })

  it.each(["waiting", "prioritized", "delayed", "active", "waiting-children"])("is true while the job holding it is %s", async (state) => {
    await enqueueFromRequest(JOB_TYPES.MEMBER_ACTIVITY, { triggeredBy: "admin" })
    mockGetJobState.mockResolvedValueOnce(state)

    await expect(isDeduplicatedJobPending("members:activity")).resolves.toEqual({ ok: true, value: true })
    expect(mockGetJobState).toHaveBeenCalledWith("job-1")
  })

  it.each(["completed", "failed", "unknown"])("is false once the job holding it is %s", async (state) => {
    mockLive.set("members:activity", "job-9")
    mockGetJobState.mockResolvedValueOnce(state)

    await expect(isDeduplicatedJobPending("members:activity")).resolves.toEqual({ ok: true, value: false })
  })

  it("answers QUEUE_UNAVAILABLE when Redis fails the read", async () => {
    mockGetDeduplicationJobId.mockRejectedValueOnce(new Error("Command timed out"))

    await expect(isDeduplicatedJobPending("members:activity")).resolves.toEqual({ ok: false, code: "QUEUE_UNAVAILABLE" })
  })
})
