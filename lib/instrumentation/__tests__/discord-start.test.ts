/**
 * @jest-environment node
 */

import { mockReset } from "jest-mock-extended"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { DiscordBot } from "@/lib/discord/bot"
import { startDiscordBotPolling } from "@/lib/instrumentation/discord-start"
import { onShutdown } from "@/lib/instrumentation/shutdown"
import { LeaseLock } from "@/lib/locks/lease-lock"

// GAP-12: the real LeasePoller and readiness check, with the lease, the bot
// and the database stubbed. The poller is always built, and the bot starts
// within one poll of being turned on with a token, with no restart.

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() }),
}))
jest.mock("@/lib/instrumentation/shutdown", () => ({ onShutdown: jest.fn() }))
jest.mock("@/lib/locks/lease-lock", () => ({
  LeaseLock: jest.fn().mockImplementation(() => ({
    name: "discord-bot",
    getLeaseDurationMs: () => 30_000,
    acquire: jest.fn().mockResolvedValue(true),
    renew: jest.fn().mockResolvedValue(true),
    release: jest.fn().mockResolvedValue(true),
  })),
}))
const mockInitialize = jest.fn()
jest.mock("@/lib/discord/bot", () => ({
  DiscordBot: jest.fn().mockImplementation(() => ({ initialize: mockInitialize, destroy: jest.fn() })),
}))

const POLL_MS = 10_000
const originalEnv = { ...process.env }

function integration(patch: { botEnabled: boolean; botToken: string | null }) {
  const now = new Date("2027-02-04T12:00:00Z")
  return {
    id: "discord",
    isEnabled: false,
    clientId: null,
    clientSecret: null,
    supportChannelId: null,
    supportThreadIds: null,
    configVersion: 1,
    guildId: null,
    serverInviteCode: null,
    platformName: "Plex Wrapped",
    instructions: null,
    createdAt: now,
    updatedAt: now,
    updatedBy: null,
    ...patch,
  }
}

function stored(patch: { botEnabled: boolean; botToken: string | null }) {
  prismaMock.discordIntegration.findUnique.mockResolvedValue(integration(patch))
}

/** Stops the poller the test started, through its registered shutdown hook. */
async function stopPoller() {
  const hook = jest.mocked(onShutdown).mock.calls.find(([name]) => name === "discord-bot")?.[2]
  await hook?.()
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  mockReset(prismaMock)
  process.env = { ...originalEnv, NODE_ENV: "test" }
  delete process.env.ENABLE_DISCORD_BOT
  delete process.env.DISCORD_BOT_TOKEN
  delete process.env.DISCORD_BOT_POLL_INTERVAL_MS
})

afterEach(async () => {
  await stopPoller()
  jest.useRealTimers()
})

afterAll(() => {
  process.env = originalEnv
})

describe("startDiscordBotPolling", () => {
  it("starts the bot within one poll when it is turned on after boot", async () => {
    stored({ botEnabled: false, botToken: "token" })
    await startDiscordBotPolling()
    expect(mockInitialize).not.toHaveBeenCalled()

    stored({ botEnabled: true, botToken: "token" })
    await jest.advanceTimersByTimeAsync(POLL_MS)

    expect(mockInitialize).toHaveBeenCalledTimes(1)
  })

  it("starts the bot within one poll when a token is saved after boot", async () => {
    stored({ botEnabled: true, botToken: null })
    await startDiscordBotPolling()
    await jest.advanceTimersByTimeAsync(POLL_MS)
    expect(mockInitialize).not.toHaveBeenCalled()

    stored({ botEnabled: true, botToken: "token" })
    await jest.advanceTimersByTimeAsync(POLL_MS)

    expect(mockInitialize).toHaveBeenCalledTimes(1)
  })

  it("builds no poller with ENABLE_DISCORD_BOT=false", async () => {
    process.env.ENABLE_DISCORD_BOT = "false"

    await startDiscordBotPolling()

    expect(LeaseLock).not.toHaveBeenCalled()
    expect(DiscordBot).not.toHaveBeenCalled()
    expect(onShutdown).not.toHaveBeenCalled()
  })

  it("still builds the poller when the database is down at boot, and starts once it answers", async () => {
    prismaMock.discordIntegration.findUnique.mockRejectedValue(new Error("connection refused"))
    await startDiscordBotPolling()

    expect(LeaseLock).toHaveBeenCalledWith({ name: "discord-bot" })
    expect(onShutdown).toHaveBeenCalledWith("discord-bot", "drain", expect.any(Function))
    expect(mockInitialize).not.toHaveBeenCalled()

    stored({ botEnabled: true, botToken: "token" })
    await jest.advanceTimersByTimeAsync(POLL_MS)

    expect(mockInitialize).toHaveBeenCalledTimes(1)
  })
})
