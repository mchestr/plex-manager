/**
 * @jest-environment node
 */

import { BotLockPoller } from "@/lib/discord/lock/poller"
import { startNodeInstrumentation } from "@/lib/instrumentation/node"

const mockWarn = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    warn: (...args: unknown[]) => mockWarn(...args),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  }),
}))

// The Discord bot wiring, stubbed so the tests can read the poller's options.
jest.mock("@/lib/discord/lock/poller", () => ({
  DEFAULT_POLL_INTERVAL_MS: jest.requireActual("@/lib/discord/lock/poller").DEFAULT_POLL_INTERVAL_MS,
  BotLockPoller: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  })),
}))
jest.mock("@/lib/discord/lock/lease", () => ({ DistributedLock: jest.fn() }))
jest.mock("@/lib/discord/lock", () => ({ isDiscordBotEnabled: jest.fn().mockResolvedValue(true) }))
jest.mock("@/lib/discord/bot", () => ({ DiscordBot: jest.fn() }))
jest.mock("@/lib/prisma", () => ({ prisma: {} }))

const env = process.env as Record<string, string | undefined>
const originalEnv = { ...process.env }

describe("startNodeInstrumentation: E2E test login warning", () => {
  beforeEach(() => {
    mockWarn.mockReset()
    // Keep the background workers out of these tests.
    env.ENABLE_QUEUE_WORKER = "false"
    env.ENABLE_DISCORD_BOT = "false"
    env.NODE_ENV = "development"
    delete env.REDIS_URL
    delete env.E2E_TEST_MODE
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it("logs one warning at startup when E2E_TEST_MODE=true", async () => {
    env.E2E_TEST_MODE = "true"

    await startNodeInstrumentation()

    expect(mockWarn).toHaveBeenCalledTimes(1)
    expect(mockWarn).toHaveBeenCalledWith("E2E test login is enabled")
  })

  it("does not warn when the flag is unset", async () => {
    await startNodeInstrumentation()

    expect(mockWarn).not.toHaveBeenCalledWith("E2E test login is enabled")
  })

  it("does not warn in production, where test login stays off even with the flag", async () => {
    env.NODE_ENV = "production"
    env.E2E_TEST_MODE = "true"

    await startNodeInstrumentation()

    expect(mockWarn).not.toHaveBeenCalledWith("E2E test login is enabled")
  })
})

describe("startNodeInstrumentation: Discord bot lock poller (BP-12)", () => {
  beforeEach(() => {
    jest.mocked(BotLockPoller).mockClear()
    // The bot is on; the queue worker stays off, and "test" skips the
    // SIGINT/SIGTERM handlers.
    process.env = { ...originalEnv, ENABLE_QUEUE_WORKER: "false", NODE_ENV: "test" }
    delete process.env.ENABLE_DISCORD_BOT
    delete process.env.DISCORD_BOT_POLL_INTERVAL_MS
    delete process.env.E2E_TEST_MODE
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it("polls every 10 s by default and leaves renewal at the poller's default", async () => {
    await startNodeInstrumentation()

    expect(BotLockPoller).toHaveBeenCalledTimes(1)
    const options = jest.mocked(BotLockPoller).mock.calls[0][2]
    expect(options?.pollIntervalMs).toBe(10_000)
    expect(options?.renewIntervalMs).toBeUndefined()
  })

  it("uses DISCORD_BOT_POLL_INTERVAL_MS when it is set", async () => {
    process.env.DISCORD_BOT_POLL_INTERVAL_MS = "60000"

    await startNodeInstrumentation()

    expect(jest.mocked(BotLockPoller).mock.calls[0][2]?.pollIntervalMs).toBe(60_000)
  })
})
