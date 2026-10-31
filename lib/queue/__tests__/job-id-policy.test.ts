/**
 * @jest-environment node
 */

/**
 * Every job type has an id rule (BP-20, P11.3), and `addJob` reads it, so a
 * repeated trigger joins the job already waiting or running instead of adding
 * a second one under a clock-based id. BullMQ is replaced by an in-memory
 * queue that honours `deduplication` the way BullMQ does
 * (`rewind-dedup.redis.test.ts` checks the real behaviour against Redis).
 */

import { addJob } from "@/lib/queue/client"
import { jobIdOptions } from "@/lib/queue/job-id"
import { JOB_ID_POLICY, JOB_TYPES, type JobType } from "@/lib/queue/types"

const mockJobs = new Map<string, { name: string; data: unknown }>()
const mockDeduplication = new Map<string, string>()
const mockAdd = jest.fn(async (name: string, data: unknown, opts: { jobId?: string; deduplication?: { id: string } }) => {
  const live = opts.deduplication && mockDeduplication.get(opts.deduplication.id)
  if (live) return { id: live }
  const id = opts.jobId ?? String(mockJobs.size + 1)
  if (!mockJobs.has(id)) mockJobs.set(id, { name, data })
  if (opts.deduplication) mockDeduplication.set(opts.deduplication.id, id)
  return { id }
})

jest.mock("bullmq", () => ({ Queue: jest.fn(() => ({ add: mockAdd })), QueueEvents: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ getRedisConnection: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

beforeEach(() => {
  mockJobs.clear()
  mockDeduplication.clear()
  mockAdd.mockClear()
})

describe("JOB_ID_POLICY", () => {
  it("has an entry for every job type", () => {
    const types = Object.values(JOB_TYPES) as JobType[]

    expect(Object.keys(JOB_ID_POLICY).sort()).toEqual([...types].sort())
    for (const type of types) {
      const policy = JOB_ID_POLICY[type]
      expect("deduplication" in policy || "jobId" in policy || "fromCaller" in policy).toBe(true)
    }
  })

  it("matches the jobIdOptions JSDoc example", () => {
    expect(jobIdOptions(JOB_TYPES.WATCHLIST_SYNC_ALL, { triggeredBy: "admin" })).toEqual({
      deduplication: { id: "watchlist:all" },
    })
    expect(jobIdOptions(JOB_TYPES.STRIPE_WEBHOOK, { eventId: "evt_1" }, { jobId: "evt_1" })).toEqual({ jobId: "evt_1" })
  })

  it("keeps a caller's id, sanitised, over the policy's", () => {
    expect(jobIdOptions(JOB_TYPES.DISCORD_ROLE_SYNC, { userId: "u1", reason: "reconcile", refreshHours: true })).toEqual({
      deduplication: { id: "discord:role:u1" },
    })
    expect(jobIdOptions(JOB_TYPES.PLEX_ACCESS_GRANT, { userId: "u1" }, { jobId: "plex:access:grant:u1:evt_2" })).toEqual({
      jobId: "plex-access-grant-u1-evt_2",
    })
    expect(jobIdOptions(JOB_TYPES.REWIND_DRY_RUN, { previewId: "p1", adminId: "a", input: {} as never })).toEqual({
      jobId: "p1",
    })
  })

  it("refuses a caller-named type without an id", () => {
    expect(() => jobIdOptions(JOB_TYPES.STRIPE_WEBHOOK, { eventId: "evt_1" })).toThrow(/needs a job id from its caller/)
  })
})

describe("addJob", () => {
  it("yields one job when the same manual sync is enqueued twice", async () => {
    const first = await addJob(JOB_TYPES.WATCHLIST_SYNC_USER, { userId: "u1", triggeredBy: "manual" })
    const second = await addJob(JOB_TYPES.WATCHLIST_SYNC_USER, { userId: "u1", triggeredBy: "admin" })

    expect(second).toBe(first)
    expect(mockJobs.size).toBe(1)
    expect(mockAdd).toHaveBeenLastCalledWith(JOB_TYPES.WATCHLIST_SYNC_USER, expect.anything(), {
      deduplication: { id: "watchlist:user:u1" },
    })
  })

  it("collapses two admin syncs of everyone into one", async () => {
    await addJob(JOB_TYPES.WATCHLIST_SYNC_ALL, { triggeredBy: "admin" })
    await addJob(JOB_TYPES.WATCHLIST_SYNC_ALL, { triggeredBy: "admin" })

    expect(mockJobs.size).toBe(1)
  })

  it.each([
    [JOB_TYPES.DISCORD_CHANNEL_STATS, "discord:channel-stats"],
    [JOB_TYPES.REQUEST_TIER_SYNC, "request-tiers:sync"],
    [JOB_TYPES.MEMBER_ACTIVITY, "members:activity"],
  ] as const)("collapses repeated admin runs of %s into one", async (type, id) => {
    await addJob(type, { triggeredBy: "admin" })
    await addJob(type, { triggeredBy: "admin" })

    expect(mockJobs.size).toBe(1)
    expect(jobIdOptions(type, { triggeredBy: "admin" })).toEqual({ deduplication: { id } })
  })

  it("never falls back to a clock-based id", async () => {
    await expect(addJob(JOB_TYPES.PLEX_ACCESS_REVOKE, { userId: "u1" })).rejects.toThrow(/needs a job id/)
    expect(mockAdd).not.toHaveBeenCalled()
  })
})
