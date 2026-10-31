/**
 * @jest-environment node
 */

/**
 * The queue actions (P10.3, P11.5): admin only through `adminAction`, each
 * one spends the per-admin `admin:queue` limit, and each change revalidates
 * `/admin/queues`, which refreshes the open page in place of the old
 * `window.location.reload()`.
 */

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

import {
  pauseJobQueue,
  removeQueueJob,
  resumeJobQueue,
  retryQueueJob,
  triggerWatchlistSyncJob,
} from "@/actions/admin/queue"
import { pauseQueue, removeJob, resumeQueue, retryJob } from "@/lib/queue/client"
import { enqueueFromRequest } from "@/lib/queue/request-path"
import { JOB_TYPES } from "@/lib/queue/types"
import { isRedisConfigured } from "@/lib/queue/connection"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/queue/client", () => ({
  pauseQueue: jest.fn(),
  resumeQueue: jest.fn(),
  retryJob: jest.fn(),
  removeJob: jest.fn(),
}))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: jest.fn() }))
jest.mock("@/lib/queue/request-path", () => ({ enqueueFromRequest: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: jest.fn(),
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const ADMIN = { user: { id: "admin-1", isAdmin: true }, expires: "" }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue(ADMIN)
  jest.mocked(consume).mockResolvedValue({ ok: true, remaining: 29 } as never)
  jest.mocked(isRedisConfigured).mockReturnValue(true)
})

describe("auth and the rate limit", () => {
  it.each([
    ["pauseJobQueue", () => pauseJobQueue()],
    ["resumeJobQueue", () => resumeJobQueue()],
    ["retryQueueJob", () => retryQueueJob({ jobId: "job-1" })],
    ["removeQueueJob", () => removeQueueJob({ jobId: "job-1" })],
    ["triggerWatchlistSyncJob", () => triggerWatchlistSyncJob({})],
  ])("%s refuses a signed-out caller and a member without a throw", async (_name, call) => {
    jest.mocked(getServerSession).mockResolvedValueOnce(null)
    await expect(call()).resolves.toMatchObject({ success: false, code: "UNAUTHENTICATED" })

    jest.mocked(getServerSession).mockResolvedValueOnce({ user: { id: "member-1", isAdmin: false }, expires: "" })
    await expect(call()).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })

    expect(consume).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    ["pauseJobQueue", () => pauseJobQueue(), pauseQueue],
    ["retryQueueJob", () => retryQueueJob({ jobId: "job-1" }), retryJob],
    ["triggerWatchlistSyncJob", () => triggerWatchlistSyncJob({}), enqueueFromRequest],
  ])("%s spends the admin:queue limit and stops when it runs out", async (_name, call, work) => {
    await call()
    expect(consume).toHaveBeenCalledWith("admin:queue", "admin-1")

    jest.mocked(work).mockClear()
    jest.mocked(consume).mockResolvedValueOnce({ ok: false, retryAfterSec: 42 } as never)
    await expect(call()).resolves.toMatchObject({ success: false, code: "RATE_LIMITED", retryAfterSec: 42 })
    expect(work).not.toHaveBeenCalled()
  })

  it("refuses without Redis", async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(false)

    await expect(pauseJobQueue()).resolves.toMatchObject({ success: false, code: "UPSTREAM_UNAVAILABLE" })
    expect(pauseQueue).not.toHaveBeenCalled()
  })
})

describe("pause and resume", () => {
  it("pauses the queue, audits it and revalidates the page", async () => {
    await expect(pauseJobQueue()).resolves.toEqual({ success: true, data: null })
    expect(pauseQueue).toHaveBeenCalled()
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.QUEUE_PAUSED, "admin-1")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/queues")
  })

  it("resumes the queue and revalidates the page", async () => {
    await expect(resumeJobQueue()).resolves.toEqual({ success: true, data: null })
    expect(resumeQueue).toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith("/admin/queues")
  })

  it("returns fixed copy without revalidating when Redis throws", async () => {
    jest.mocked(pauseQueue).mockRejectedValueOnce(new Error("ECONNREFUSED 10.0.0.1"))

    await expect(pauseJobQueue()).resolves.toEqual({
      success: false,
      code: "INTERNAL",
      error: "Could not pause the queue. Try again.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe("job actions", () => {
  it("retries a job and revalidates", async () => {
    await expect(retryQueueJob({ jobId: "job-1" })).resolves.toEqual({ success: true, data: null })
    expect(retryJob).toHaveBeenCalledWith("job-1")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/queues")
  })

  it("removes a job and revalidates", async () => {
    await expect(removeQueueJob({ jobId: "job-2" })).resolves.toEqual({ success: true, data: null })
    expect(removeJob).toHaveBeenCalledWith("job-2")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/queues")
  })

  it("rejects an empty job id", async () => {
    await expect(retryQueueJob({ jobId: "" })).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(retryJob).not.toHaveBeenCalled()
  })
})

describe("triggerWatchlistSyncJob", () => {
  it("syncs one member", async () => {
    jest.mocked(enqueueFromRequest).mockResolvedValue({ ok: true, jobId: "job-u" })

    await expect(triggerWatchlistSyncJob({ userId: "member-1" })).resolves.toEqual({ success: true, data: { jobId: "job-u" } })
    expect(enqueueFromRequest).toHaveBeenCalledWith(JOB_TYPES.WATCHLIST_SYNC_USER, {
      userId: "member-1",
      triggeredBy: "admin",
      triggeredByUserId: "admin-1",
    })
  })

  it("syncs everyone without a user id", async () => {
    jest.mocked(enqueueFromRequest).mockResolvedValue({ ok: true, jobId: "job-all" })

    await expect(triggerWatchlistSyncJob({})).resolves.toEqual({ success: true, data: { jobId: "job-all" } })
    expect(enqueueFromRequest).toHaveBeenCalledWith(JOB_TYPES.WATCHLIST_SYNC_ALL, { triggeredBy: "admin" })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.QUEUE_SYNC_TRIGGERED, "admin-1", {
      syncType: "all",
      jobId: "job-all",
    })
  })

  it("answers within the request with fixed copy while the queue is unavailable, and audits nothing", async () => {
    jest.mocked(enqueueFromRequest).mockResolvedValue({ ok: false, code: "QUEUE_UNAVAILABLE" })

    const result = await triggerWatchlistSyncJob({})

    expect(result).toEqual({ success: false, code: "UPSTREAM_UNAVAILABLE", error: expect.stringMatching(/queue is unavailable/) })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})
