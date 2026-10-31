/**
 * @jest-environment node
 */

import { startNodeInstrumentation } from "@/lib/instrumentation/node"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { LeasePoller } from "@/lib/locks/lease-poller"
import { getDiscordIntegration } from "@/lib/discord/integration"
import { removeScheduledJob, scheduleCronJob } from "@/lib/queue/client"
import { waitForRedis } from "@/lib/queue/connection"
import { startWorker } from "@/lib/queue/worker"
import { startWatchlistFallback } from "@/lib/watchlist/fallback"
import { ensureWatchlistSchedule } from "@/lib/watchlist/schedule"
import { issueSetupCode } from "@/lib/setup/claim"
import { startRetentionFallback } from "@/lib/retention/fallback"
import { ensureRetentionSchedule } from "@/lib/retention/schedule"
import { ensureMemberActivitySchedule } from "@/lib/inactivity/schedule"
import { assertEncryptionKey } from "@/lib/instrumentation/encryption-canary"
import { enqueueSecretsReencrypt, reencryptSecretsWithoutQueue } from "@/lib/queue/jobs/secrets"

// The queue worker and the bot poller start side by side, so a Redis that is
// down at boot never stops the Discord bot (BP-13).

const mockError = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: (...args: unknown[]) => mockError(...args), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }),
}))
jest.mock("@/lib/queue/connection", () => ({
  createFailFastRedis: () => ({ disconnect: jest.fn() }),
  waitForRedis: jest.fn(),
  closeRedisConnection: jest.fn(),
}))
jest.mock("@/lib/queue/worker", () => ({ startWorker: jest.fn(), stopWorker: jest.fn() }))
jest.mock("@/lib/queue/client", () => ({
  scheduleRepeatingJob: jest.fn(),
  scheduleCronJob: jest.fn(),
  removeScheduledJob: jest.fn(),
  closeQueue: jest.fn(),
}))
jest.mock("@/lib/discord/integration", () => ({ getDiscordIntegration: jest.fn() }))
jest.mock("@/lib/queue/jobs/discord-role", () => ({
  ROLE_RECONCILE_PATTERN: "0 4 * * *",
  ROLE_RECONCILE_SCHEDULER_ID: "discord-role-reconcile",
  reconcileTimeZone: jest.fn().mockResolvedValue("UTC"),
}))
jest.mock("@/lib/watchlist/fallback", () => ({ startWatchlistFallback: jest.fn() }))
jest.mock("@/lib/watchlist/schedule", () => ({ ensureWatchlistSchedule: jest.fn() }))
jest.mock("@/lib/retention/fallback", () => ({ startRetentionFallback: jest.fn().mockResolvedValue(null) }))
jest.mock("@/lib/retention/schedule", () => ({ ensureRetentionSchedule: jest.fn().mockResolvedValue(undefined) }))
jest.mock("@/lib/inactivity/schedule", () => ({
  ensureMemberActivitySchedule: jest.fn().mockResolvedValue({ ok: true, state: "scheduled" }),
}))
jest.mock("@/lib/locks/lease-poller", () => ({
  DEFAULT_POLL_INTERVAL_MS: 10_000,
  LeasePoller: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  })),
}))
jest.mock("@/lib/locks/lease-lock", () => ({ LeaseLock: jest.fn() }))
jest.mock("@/lib/discord/config", () => ({ isDiscordBotEnabled: jest.fn().mockResolvedValue(true) }))
jest.mock("@/lib/discord/bot", () => ({ DiscordBot: jest.fn() }))
jest.mock("@/lib/prisma", () => ({ prisma: {} }))
jest.mock("@/lib/setup/claim", () => ({ issueSetupCode: jest.fn() }))
jest.mock("@/lib/instrumentation/encryption-canary", () => ({ assertEncryptionKey: jest.fn().mockResolvedValue(undefined) }))
jest.mock("@/lib/queue/jobs/secrets", () => ({
  enqueueSecretsReencrypt: jest.fn().mockResolvedValue("current"),
  reencryptSecretsWithoutQueue: jest.fn().mockResolvedValue("current"),
}))

const originalEnv = process.env

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...originalEnv, NODE_ENV: "test", REDIS_URL: "redis://localhost:6390" }
  delete process.env.ENABLE_QUEUE_WORKER
  delete process.env.ENABLE_DISCORD_BOT
})

afterAll(() => {
  process.env = originalEnv
})

function botPollerStarted(): boolean {
  const poller = jest.mocked(LeasePoller).mock.results[0]?.value as { start: jest.Mock } | undefined
  return poller?.start.mock.calls.length === 1
}

describe("startNodeInstrumentation() with Redis unreachable", () => {
  it("starts the bot poller while the Redis wait is still pending", async () => {
    jest.mocked(waitForRedis).mockReturnValue(new Promise(() => {}))

    void startNodeInstrumentation()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(botPollerStarted()).toBe(true)
    expect(startWorker).not.toHaveBeenCalled()
  })

  it("logs queue.redis_unreachable, starts no worker and no polling fallback, and still starts the bot", async () => {
    jest.mocked(waitForRedis).mockResolvedValue(false)

    await startNodeInstrumentation()

    expect(botPollerStarted()).toBe(true)
    expect(startWorker).not.toHaveBeenCalled()
    expect(startWatchlistFallback).not.toHaveBeenCalled()
    expect(mockError).toHaveBeenCalledWith(expect.stringMatching(/^queue\.redis_unreachable/))
  })

  it("still starts the bot when the worker throws", async () => {
    jest.mocked(waitForRedis).mockResolvedValue(true)
    jest.mocked(startWorker).mockRejectedValue(new Error("boom"))

    await startNodeInstrumentation()

    expect(botPollerStarted()).toBe(true)
    expect(mockError).toHaveBeenCalledWith("Queue worker start failed", expect.any(Error))
  })

  it("starts the watchlist fallback without REDIS_URL", async () => {
    delete process.env.REDIS_URL

    await startNodeInstrumentation()

    expect(waitForRedis).not.toHaveBeenCalled()
    expect(startWatchlistFallback).toHaveBeenCalledTimes(1)
    expect(startWatchlistFallback).toHaveBeenCalledWith({ signal: shutdownSignal })
    expect(startRetentionFallback).toHaveBeenCalledWith({ signal: shutdownSignal })
    expect(ensureWatchlistSchedule).not.toHaveBeenCalled()
    expect(ensureRetentionSchedule).not.toHaveBeenCalled()
    expect(ensureMemberActivitySchedule).not.toHaveBeenCalled()
    expect(botPollerStarted()).toBe(true)
  })

  it("does not start the fallback with REDIS_URL, and ensures the schedule instead", async () => {
    jest.mocked(waitForRedis).mockResolvedValue(true)
    jest.mocked(startWorker).mockResolvedValue(undefined)

    await startNodeInstrumentation()

    expect(startWatchlistFallback).not.toHaveBeenCalled()
    expect(startRetentionFallback).not.toHaveBeenCalled()
    expect(ensureWatchlistSchedule).toHaveBeenCalledTimes(1)
    expect(ensureRetentionSchedule).toHaveBeenCalledTimes(1)
    expect(ensureMemberActivitySchedule).toHaveBeenCalledTimes(1)
  })
})

describe("startNodeInstrumentation() and the Discord role reconcile", () => {
  beforeEach(() => {
    jest.mocked(waitForRedis).mockResolvedValue(true)
    jest.mocked(startWorker).mockResolvedValue(undefined)
  })

  it("schedules the daily reconcile while the integration is on", async () => {
    jest.mocked(getDiscordIntegration).mockResolvedValue(
      {} as Awaited<ReturnType<typeof getDiscordIntegration>>
    )

    await startNodeInstrumentation()

    expect(scheduleCronJob).toHaveBeenCalledWith(
      "discord-role-reconcile",
      "discord:role:reconcile",
      {},
      { pattern: "0 4 * * *", tz: "UTC" },
      { attempts: 1 }
    )
    expect(removeScheduledJob).not.toHaveBeenCalledWith("discord-role-reconcile")
  })

  it("removes the schedule, and schedules nothing, while the integration is off", async () => {
    jest.mocked(getDiscordIntegration).mockResolvedValue(null)

    await startNodeInstrumentation()

    expect(scheduleCronJob).not.toHaveBeenCalled()
    expect(removeScheduledJob).toHaveBeenCalledWith("discord-role-reconcile")
  })
})

describe("startNodeInstrumentation() and the setup code (P11.32)", () => {
  it("issues the setup code while Redis is still unanswered", async () => {
    jest.mocked(waitForRedis).mockReturnValue(new Promise(() => {}))

    void startNodeInstrumentation()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(issueSetupCode).toHaveBeenCalledTimes(1)
  })

  it("logs a failure to issue it without stopping the rest", async () => {
    jest.mocked(waitForRedis).mockResolvedValue(true)
    jest.mocked(issueSetupCode).mockRejectedValueOnce(new Error("database down"))

    await startNodeInstrumentation()

    expect(mockError).toHaveBeenCalledWith("Could not issue the setup code", expect.any(Error))
    expect(startWorker).toHaveBeenCalled()
  })
})

describe("startNodeInstrumentation() and the encryption key (P11.1)", () => {
  it("checks the key before anything else starts", async () => {
    jest.mocked(waitForRedis).mockResolvedValue(true)
    let startedBeforeCheck = false
    jest.mocked(assertEncryptionKey).mockImplementationOnce(async () => {
      startedBeforeCheck = jest.mocked(issueSetupCode).mock.calls.length > 0 || botPollerStarted()
    })

    await startNodeInstrumentation()

    expect(assertEncryptionKey).toHaveBeenCalledWith({ signal: shutdownSignal })
    expect(startedBeforeCheck).toBe(false)
    expect(issueSetupCode).toHaveBeenCalled()
  })

  it("queues the re-encryption once the worker runs with Redis, and runs it in the process without", async () => {
    jest.mocked(waitForRedis).mockResolvedValue(true)
    jest.mocked(startWorker).mockResolvedValue(undefined)
    await startNodeInstrumentation()
    expect(enqueueSecretsReencrypt).toHaveBeenCalledTimes(1)
    expect(reencryptSecretsWithoutQueue).not.toHaveBeenCalled()

    jest.clearAllMocks()
    delete process.env.REDIS_URL
    await startNodeInstrumentation()
    expect(enqueueSecretsReencrypt).not.toHaveBeenCalled()
    expect(reencryptSecretsWithoutQueue).toHaveBeenCalledTimes(1)
  })

  it("logs a failed re-encryption without Redis and still starts the fallbacks", async () => {
    delete process.env.REDIS_URL
    jest.mocked(reencryptSecretsWithoutQueue).mockRejectedValueOnce(new Error("database down"))

    await startNodeInstrumentation()

    expect(mockError).toHaveBeenCalledWith("Secret re-encryption failed", expect.any(Error))
    expect(startWatchlistFallback).toHaveBeenCalledTimes(1)
    expect(startRetentionFallback).toHaveBeenCalledTimes(1)
  })

  it("logs a failure to queue it without stopping the rest", async () => {
    jest.mocked(waitForRedis).mockResolvedValue(true)
    jest.mocked(enqueueSecretsReencrypt).mockRejectedValueOnce(new Error("redis down"))

    await startNodeInstrumentation()

    expect(mockError).toHaveBeenCalledWith("Could not queue the secret re-encryption", expect.any(Error))
    expect(ensureWatchlistSchedule).toHaveBeenCalled()
  })
})
