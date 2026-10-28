/**
 * @jest-environment node
 */

import { startNodeInstrumentation } from "@/lib/instrumentation/node"
import { LeasePoller } from "@/lib/locks/lease-poller"
import { waitForRedis } from "@/lib/queue/connection"
import { reencryptSecretsWithoutQueue } from "@/lib/queue/jobs/secrets"
import { startWorker } from "@/lib/queue/worker"
import { startRetentionFallback } from "@/lib/retention/fallback"
import { ensureRetentionSchedule } from "@/lib/retention/schedule"
import { issueSetupCode } from "@/lib/setup/claim"
import { startWatchlistFallback } from "@/lib/watchlist/fallback"
import { ensureWatchlistSchedule } from "@/lib/watchlist/schedule"

// PROCESS_ROLE (P11.3): a web container starts only the setup code; worker
// and all start the Workers, the schedulers, the bot poller and the fallbacks.

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }),
}))
jest.mock("@/lib/queue/connection", () => ({
  createFailFastRedis: () => ({ disconnect: jest.fn() }),
  waitForRedis: jest.fn(),
  closeRedisConnection: jest.fn(),
}))
jest.mock("@/lib/queue/worker", () => ({ startWorker: jest.fn(), stopWorker: jest.fn() }))
jest.mock("@/lib/queue/client", () => ({
  scheduleCronJob: jest.fn(),
  removeScheduledJob: jest.fn(),
  closeQueue: jest.fn(),
}))
jest.mock("@/lib/discord/integration", () => ({ getDiscordIntegration: jest.fn().mockResolvedValue(null) }))
jest.mock("@/lib/queue/jobs/discord-role", () => ({
  ROLE_RECONCILE_PATTERN: "0 4 * * *",
  ROLE_RECONCILE_SCHEDULER_ID: "discord-role-reconcile",
  reconcileTimeZone: jest.fn().mockResolvedValue("UTC"),
}))
jest.mock("@/lib/watchlist/fallback", () => ({ startWatchlistFallback: jest.fn() }))
jest.mock("@/lib/watchlist/schedule", () => ({ ensureWatchlistSchedule: jest.fn() }))
jest.mock("@/lib/retention/fallback", () => ({ startRetentionFallback: jest.fn().mockResolvedValue(null) }))
jest.mock("@/lib/retention/schedule", () => ({ ensureRetentionSchedule: jest.fn().mockResolvedValue(undefined) }))
jest.mock("@/lib/queue/jobs/secrets", () => ({
  enqueueSecretsReencrypt: jest.fn().mockResolvedValue("current"),
  reencryptSecretsWithoutQueue: jest.fn().mockResolvedValue("current"),
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

const originalEnv = process.env

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...originalEnv, NODE_ENV: "test", REDIS_URL: "redis://localhost:6390" }
  delete process.env.ENABLE_QUEUE_WORKER
  delete process.env.ENABLE_DISCORD_BOT
  jest.mocked(waitForRedis).mockResolvedValue(true)
})

afterAll(() => {
  process.env = originalEnv
})

describe("startNodeInstrumentation() by PROCESS_ROLE", () => {
  it("starts no worker, scheduler or poller in the web role, only the setup code", async () => {
    process.env.PROCESS_ROLE = "web"

    await startNodeInstrumentation()

    expect(issueSetupCode).toHaveBeenCalledTimes(1)
    expect(waitForRedis).not.toHaveBeenCalled()
    expect(startWorker).not.toHaveBeenCalled()
    expect(ensureWatchlistSchedule).not.toHaveBeenCalled()
    expect(ensureRetentionSchedule).not.toHaveBeenCalled()
    expect(LeasePoller).not.toHaveBeenCalled()
  })

  it("starts no fallback in the web role without Redis", async () => {
    process.env.PROCESS_ROLE = "web"
    delete process.env.REDIS_URL

    await startNodeInstrumentation()

    expect(startWatchlistFallback).not.toHaveBeenCalled()
    expect(startRetentionFallback).not.toHaveBeenCalled()
    expect(reencryptSecretsWithoutQueue).not.toHaveBeenCalled()
  })

  it.each(["worker", "all", undefined])("starts everything in the %s role", async (role) => {
    if (role) process.env.PROCESS_ROLE = role
    else delete process.env.PROCESS_ROLE

    await startNodeInstrumentation()

    expect(startWorker).toHaveBeenCalledTimes(1)
    expect(ensureWatchlistSchedule).toHaveBeenCalledTimes(1)
    expect(ensureRetentionSchedule).toHaveBeenCalledTimes(1)
    expect(LeasePoller).toHaveBeenCalledTimes(1)
    expect(issueSetupCode).toHaveBeenCalledTimes(1)
  })

  it("starts the fallbacks in the worker role without Redis", async () => {
    process.env.PROCESS_ROLE = "worker"
    delete process.env.REDIS_URL

    await startNodeInstrumentation()

    expect(startWatchlistFallback).toHaveBeenCalledTimes(1)
    expect(startRetentionFallback).toHaveBeenCalledTimes(1)
    expect(reencryptSecretsWithoutQueue).toHaveBeenCalledTimes(1)
    expect(startWorker).not.toHaveBeenCalled()
  })
})
