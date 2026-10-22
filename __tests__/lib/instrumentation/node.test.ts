/**
 * @jest-environment node
 */

import { LeaseLock } from "@/lib/locks/lease-lock"
import { LeasePoller } from "@/lib/locks/lease-poller"
import { startNodeInstrumentation } from "@/lib/instrumentation/node"
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  }),
}))

// The Discord bot wiring, stubbed so the tests can read the poller's options.
jest.mock("@/lib/locks/lease-poller", () => ({
  DEFAULT_POLL_INTERVAL_MS: jest.requireActual("@/lib/locks/lease-poller").DEFAULT_POLL_INTERVAL_MS,
  LeasePoller: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  })),
}))
jest.mock("@/lib/locks/lease-lock", () => ({ LeaseLock: jest.fn() }))
jest.mock("@/lib/discord/config", () => ({ isDiscordBotEnabled: jest.fn().mockResolvedValue(true) }))
jest.mock("@/lib/discord/bot", () => ({ DiscordBot: jest.fn() }))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

const originalEnv = { ...process.env }

describe("startNodeInstrumentation: Discord bot lock poller (BP-12)", () => {
  beforeEach(() => {
    jest.mocked(LeasePoller).mockClear()
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

    expect(LeasePoller).toHaveBeenCalledTimes(1)
    expect(LeaseLock).toHaveBeenCalledWith({ name: "discord-bot" })
    const options = jest.mocked(LeasePoller).mock.calls[0][2]
    expect(options?.pollIntervalMs).toBe(10_000)
    expect(options?.renewIntervalMs).toBeUndefined()
  })

  it("uses DISCORD_BOT_POLL_INTERVAL_MS when it is set", async () => {
    process.env.DISCORD_BOT_POLL_INTERVAL_MS = "60000"

    await startNodeInstrumentation()

    expect(jest.mocked(LeasePoller).mock.calls[0][2]?.pollIntervalMs).toBe(60_000)
  })
})
