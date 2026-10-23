/**
 * Tests for the Discord role jobs (P4.18): `enqueueRoleSync`
 * (lib/discord/role-sync.ts) and the `DISCORD_ROLE_SYNC` and
 * `DISCORD_ROLE_RECONCILE` processors (lib/queue/jobs/discord-role.ts).
 */

import type { Job } from "bullmq"
import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getDiscordIntegration, syncDiscordRoleConnection } from "@/lib/discord/integration"
import { enqueueRoleSync, roleSyncJobOptions, runRoleSync } from "@/lib/discord/role-sync"
import { addJob } from "@/lib/queue/client"
import { getJobProcessor } from "@/lib/queue/jobs"
import {
  processDiscordRoleReconcile,
  processDiscordRoleSync,
  RECONCILE_BATCH_SIZE,
  ROLE_STALE_AFTER_MS,
} from "@/lib/queue/jobs/discord-role"
import { redisLimiter } from "@/lib/queue/redis-semaphore"
import { enqueueFromRequest } from "@/lib/queue/request-path"
import { JOB_TYPES } from "@/lib/queue/types"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/discord/integration", () => ({
  getDiscordIntegration: jest.fn(),
  syncDiscordRoleConnection: jest.fn(),
}))
jest.mock("@/lib/queue/client", () => ({ addJob: jest.fn() }))
// Requests call enqueueRoleSync, so it enqueues on the fail-fast producer (P11.3)
jest.mock("@/lib/queue/request-path", () => ({ enqueueFromRequest: jest.fn() }))
jest.mock("@/lib/queue/redis-semaphore", () => ({ redisLimiter: { run: jest.fn() } }))
jest.mock("@/lib/queue/jobs/watchlist-sync", () => ({ getWatchlistProcessor: jest.fn(() => null) }))
jest.mock("@/lib/queue/jobs/stripe", () => ({ getStripeProcessor: jest.fn(() => null) }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

const mockIntegration = jest.mocked(getDiscordIntegration)
const mockSync = jest.mocked(syncDiscordRoleConnection)
const mockAddJob = jest.mocked(addJob)
const mockEnqueue = jest.mocked(enqueueFromRequest)

const INTEGRATION = { id: "discord", isEnabled: true, clientId: "client", clientSecret: "secret" }
const job = (data: unknown) => ({ id: "job-1", data, attemptsMade: 0 }) as Job

let previousRedisUrl: string | undefined

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  previousRedisUrl = process.env.REDIS_URL
  process.env.REDIS_URL = "redis://localhost:6379/15"
  mockIntegration.mockResolvedValue(INTEGRATION as Awaited<ReturnType<typeof getDiscordIntegration>>)
  prismaMock.discordConnection.findUnique.mockResolvedValue({ revokedAt: null } as never)
  mockAddJob.mockResolvedValue("job-id")
  mockEnqueue.mockResolvedValue({ ok: true, jobId: "job-id" })
  mockSync.mockResolvedValue(undefined)
})

afterEach(() => {
  if (previousRedisUrl === undefined) delete process.env.REDIS_URL
  else process.env.REDIS_URL = previousRedisUrl
  jest.useRealTimers()
})

describe("enqueueRoleSync", () => {
  it("queues a deduplicated sync that reuses the stored hours", async () => {
    await enqueueRoleSync("user-1", "unshared")
    await enqueueRoleSync("user-1", "subscription_changed")

    expect(mockEnqueue).toHaveBeenCalledTimes(2)
    for (const [type, , options] of mockEnqueue.mock.calls) {
      expect(type).toBe(JOB_TYPES.DISCORD_ROLE_SYNC)
      expect(options).toEqual({ attempts: 3, deduplication: { id: "discord:role:user-1" } })
    }
    expect(mockEnqueue.mock.calls[0][1]).toEqual({ userId: "user-1", reason: "unshared", refreshHours: false })
    expect(mockSync).not.toHaveBeenCalled()
  })

  it("does nothing when the integration is off", async () => {
    mockIntegration.mockResolvedValue(null)

    await enqueueRoleSync("user-1", "unshared")

    expect(mockEnqueue).not.toHaveBeenCalled()
    expect(mockSync).not.toHaveBeenCalled()
    expect(prismaMock.discordConnection.findUnique).not.toHaveBeenCalled()
  })

  it("does nothing for a member who is not linked, or whose link was revoked", async () => {
    prismaMock.discordConnection.findUnique.mockResolvedValueOnce(null)
    await enqueueRoleSync("user-1", "unshared")
    prismaMock.discordConnection.findUnique.mockResolvedValueOnce({ revokedAt: new Date() } as never)
    await enqueueRoleSync("user-1", "unshared")

    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it("runs the sync inline without Redis", async () => {
    delete process.env.REDIS_URL

    await enqueueRoleSync("user-1", "disabled")

    expect(mockEnqueue).not.toHaveBeenCalled()
    expect(mockSync).toHaveBeenCalledWith("user-1", { refreshHours: false })
  })

  it("never throws, even when the queue or the inline sync fails", async () => {
    mockEnqueue.mockRejectedValueOnce(new Error("redis down"))
    await expect(enqueueRoleSync("user-1", "unshared")).resolves.toBeUndefined()
    mockEnqueue.mockResolvedValueOnce({ ok: false, code: "QUEUE_UNAVAILABLE" })
    await expect(enqueueRoleSync("user-1", "unshared")).resolves.toBeUndefined()

    delete process.env.REDIS_URL
    mockSync.mockRejectedValueOnce(new Error("discord down"))
    await expect(enqueueRoleSync("user-1", "unshared")).resolves.toBeUndefined()
  })
})

describe("DISCORD_ROLE_SYNC", () => {
  it("is registered", () => {
    expect(getJobProcessor(JOB_TYPES.DISCORD_ROLE_SYNC)).toBe(processDiscordRoleSync)
    expect(getJobProcessor(JOB_TYPES.DISCORD_ROLE_RECONCILE)).not.toBeNull()
  })

  it("runs a refresh through the Tautulli semaphore", async () => {
    const result = await processDiscordRoleSync(job({ userId: "user-1", reason: "reconcile", refreshHours: true }))

    expect(result).toEqual({ userId: "user-1", synced: true })
    expect(mockSync).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ refreshHours: true, limiter: redisLimiter, signal: expect.any(AbortSignal) })
    )
  })

  it("skips when the integration was turned off after the job was queued", async () => {
    mockIntegration.mockResolvedValue(null)

    const result = await processDiscordRoleSync(job({ userId: "user-1", reason: "unshared", refreshHours: false }))

    expect(result).toEqual({ userId: "user-1", synced: false, skipped: "DISCORD_DISABLED" })
    expect(mockSync).not.toHaveBeenCalled()
  })

  it("records fixed copy and rethrows a failure, so BullMQ retries", async () => {
    mockSync.mockRejectedValue(new Error("https://discord.com/api secret detail"))

    await expect(runRoleSync({ userId: "user-1", reason: "unshared", refreshHours: false })).rejects.toThrow()

    expect(prismaMock.discordConnection.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { lastError: expect.not.stringContaining("discord.com") },
    })
  })

  it("job options keep one pending sync per member", () => {
    expect(roleSyncJobOptions("a").deduplication).toEqual({ id: "discord:role:a" })
    expect(roleSyncJobOptions("b").deduplication).toEqual({ id: "discord:role:b" })
  })
})

describe("DISCORD_ROLE_RECONCILE", () => {
  const stale = (count: number) => Array.from({ length: count }, (_, i) => ({ userId: `user-${i}` }))

  it("does nothing when the integration is off", async () => {
    mockIntegration.mockResolvedValue(null)

    const result = await processDiscordRoleReconcile(job({}), new AbortController().signal)

    expect(result).toEqual({ enqueued: 0, stale: 0, skipped: "DISCORD_DISABLED" })
    expect(prismaMock.discordConnection.findMany).not.toHaveBeenCalled()
    expect(mockAddJob).not.toHaveBeenCalled()
  })

  it("picks only live links synced more than 20 hours ago, or never", async () => {
    jest.useFakeTimers({ now: new Date("2026-11-24T04:00:00Z") })
    prismaMock.discordConnection.findMany.mockResolvedValue(stale(2) as never)

    const result = await processDiscordRoleReconcile(job({}), new AbortController().signal)

    expect(prismaMock.discordConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          revokedAt: null,
          OR: [
            { metadataSyncedAt: null },
            { metadataSyncedAt: { lt: new Date(Date.now() - ROLE_STALE_AFTER_MS) } },
          ],
        },
      })
    )
    expect(ROLE_STALE_AFTER_MS).toBe(20 * 60 * 60 * 1000)
    expect(result).toEqual({ enqueued: 2, stale: 2 })
    expect(mockAddJob).toHaveBeenCalledWith(
      JOB_TYPES.DISCORD_ROLE_SYNC,
      { userId: "user-0", reason: "reconcile", refreshHours: true },
      roleSyncJobOptions("user-0")
    )
  })

  it("queues at most 25 syncs a minute", async () => {
    jest.useFakeTimers()
    prismaMock.discordConnection.findMany.mockResolvedValue(stale(RECONCILE_BATCH_SIZE + 5) as never)

    const run = processDiscordRoleReconcile(job({}), new AbortController().signal)
    await jest.advanceTimersByTimeAsync(0)
    expect(mockAddJob).toHaveBeenCalledTimes(RECONCILE_BATCH_SIZE)

    await jest.advanceTimersByTimeAsync(59_000)
    expect(mockAddJob).toHaveBeenCalledTimes(RECONCILE_BATCH_SIZE)

    await jest.advanceTimersByTimeAsync(1_000)
    await expect(run).resolves.toEqual({ enqueued: RECONCILE_BATCH_SIZE + 5, stale: RECONCILE_BATCH_SIZE + 5 })
  })

  it("stops at shutdown and leaves the rest stale for the next run", async () => {
    jest.useFakeTimers()
    prismaMock.discordConnection.findMany.mockResolvedValue(stale(RECONCILE_BATCH_SIZE + 5) as never)
    const shutdown = new AbortController()

    const run = processDiscordRoleReconcile(job({}), shutdown.signal)
    await jest.advanceTimersByTimeAsync(0)
    shutdown.abort()

    await expect(run).resolves.toEqual({ enqueued: RECONCILE_BATCH_SIZE, stale: RECONCILE_BATCH_SIZE + 5 })
  })
})
