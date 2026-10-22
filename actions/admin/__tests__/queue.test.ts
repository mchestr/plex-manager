/**
 * @jest-environment node
 */

/**
 * The queue actions (P10.3): each change revalidates `/admin/queues`, which
 * refreshes the open page in place of the old `window.location.reload()`.
 */

import { revalidatePath } from "next/cache"

import { pauseJobQueue, removeQueueJob, resumeJobQueue, retryQueueJob } from "@/actions/admin/queue"
import { requireAdmin } from "@/lib/admin"
import { pauseQueue, removeJob, resumeQueue, retryJob } from "@/lib/queue/client"

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/admin", () => ({ requireAdmin: jest.fn() }))
jest.mock("@/lib/queue/client", () => ({
  addJob: jest.fn(),
  addWatchlistSyncUserJob: jest.fn(),
  pauseQueue: jest.fn(),
  resumeQueue: jest.fn(),
  retryJob: jest.fn(),
  removeJob: jest.fn(),
}))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: () => true }))
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: jest.fn(),
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

let adminSeq = 0

beforeEach(() => {
  jest.clearAllMocks()
  // A fresh admin each test, so the in-memory rate limit never trips.
  adminSeq += 1
  jest.mocked(requireAdmin).mockResolvedValue({ user: { id: `admin-${adminSeq}` } } as Awaited<ReturnType<typeof requireAdmin>>)
})

describe("pause and resume", () => {
  it("pauses the queue and revalidates the page", async () => {
    await expect(pauseJobQueue()).resolves.toEqual({ success: true })
    expect(pauseQueue).toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith("/admin/queues")
  })

  it("resumes the queue and revalidates the page", async () => {
    await expect(resumeJobQueue()).resolves.toEqual({ success: true })
    expect(resumeQueue).toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith("/admin/queues")
  })

  it("returns a failure without revalidating when Redis throws", async () => {
    jest.mocked(pauseQueue).mockRejectedValueOnce(new Error("ECONNREFUSED 10.0.0.1"))
    const result = await pauseJobQueue()
    expect(result).toEqual({ success: false, error: "Failed to pause queue. Please try again." })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("refuses a non-admin", async () => {
    jest.mocked(requireAdmin).mockRejectedValueOnce(new Error("Forbidden"))
    await expect(pauseJobQueue()).resolves.toEqual({ success: false, error: "Unauthorized" })
    expect(pauseQueue).not.toHaveBeenCalled()
  })
})

describe("job actions", () => {
  it("retries a job and revalidates", async () => {
    await expect(retryQueueJob({ jobId: "job-1" })).resolves.toEqual({ success: true })
    expect(retryJob).toHaveBeenCalledWith("job-1")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/queues")
  })

  it("removes a job and revalidates", async () => {
    await expect(removeQueueJob({ jobId: "job-2" })).resolves.toEqual({ success: true })
    expect(removeJob).toHaveBeenCalledWith("job-2")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/queues")
  })

  it("rejects an empty job id", async () => {
    await expect(retryQueueJob({ jobId: "" })).resolves.toEqual({ success: false, error: "Invalid job ID" })
    expect(retryJob).not.toHaveBeenCalled()
  })
})
