/**
 * @jest-environment node
 */

import { BotLockPoller } from "@/lib/discord/lock/poller"
import { startNodeInstrumentation } from "@/lib/instrumentation/node"
import { getDiscordIntegration } from "@/lib/discord/integration"
import { removeScheduledJob, scheduleCronJob } from "@/lib/queue/client"
import { waitForRedis } from "@/lib/queue/connection"
import { startWorker } from "@/lib/queue/worker"
import { startWatchlistSyncPolling } from "@/lib/watchlist/lock"

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
jest.mock("@/lib/watchlist/lock", () => ({
  isWatchlistSyncEnabled: jest.fn().mockResolvedValue(true),
  getWatchlistSyncInterval: jest.fn().mockResolvedValue(60),
  startWatchlistSyncPolling: jest.fn(),
  stopWatchlistSyncPolling: jest.fn(),
}))
jest.mock("@/lib/discord/lock/poller", () => ({
  DEFAULT_POLL_INTERVAL_MS: 10_000,
  BotLockPoller: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  })),
}))
jest.mock("@/lib/watchlist/sync-service", () => ({ syncAllEnabledUsers: jest.fn() }))
jest.mock("@/lib/discord/lock/lease", () => ({ DistributedLock: jest.fn() }))
jest.mock("@/lib/discord/lock", () => ({ isDiscordBotEnabled: jest.fn().mockResolvedValue(true) }))
jest.mock("@/lib/discord/bot", () => ({ DiscordBot: jest.fn() }))
jest.mock("@/lib/prisma", () => ({ prisma: {} }))

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
  const poller = jest.mocked(BotLockPoller).mock.results[0]?.value as { start: jest.Mock } | undefined
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
    expect(startWatchlistSyncPolling).not.toHaveBeenCalled()
    expect(mockError).toHaveBeenCalledWith(expect.stringMatching(/^queue\.redis_unreachable/))
  })

  it("still starts the bot when the worker throws", async () => {
    jest.mocked(waitForRedis).mockResolvedValue(true)
    jest.mocked(startWorker).mockRejectedValue(new Error("boom"))

    await startNodeInstrumentation()

    expect(botPollerStarted()).toBe(true)
    expect(mockError).toHaveBeenCalledWith("Queue worker start failed", expect.any(Error))
  })

  it("runs the legacy polling sync only without REDIS_URL", async () => {
    delete process.env.REDIS_URL

    await startNodeInstrumentation()

    expect(waitForRedis).not.toHaveBeenCalled()
    expect(startWatchlistSyncPolling).toHaveBeenCalledTimes(1)
    expect(botPollerStarted()).toBe(true)
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
