/**
 * @jest-environment node
 */

import { mockReset } from "jest-mock-extended"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { isDiscordBotReady } from "@/lib/discord/config"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const mockInfo = jest.fn()
const mockWarn = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    info: (...args: unknown[]) => mockInfo(...args),
    warn: (...args: unknown[]) => mockWarn(...args),
    debug: jest.fn(),
    error: jest.fn(),
  }),
}))

// The readiness rule the bot's poller checks on every tick (GAP-12): "Bot
// enabled" on and a token, stored or in the environment.

type Row = { botEnabled: boolean; botToken: string | null }
const row = (patch: Partial<Row>) => ({ botEnabled: true, botToken: "stored-token", ...patch })

const originalToken = process.env.DISCORD_BOT_TOKEN
let clock = new Date("2027-02-04T12:00:00Z").getTime()

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  delete process.env.DISCORD_BOT_TOKEN
  // Each test starts well clear of the previous one's warning window.
  clock += 60 * 60 * 1000
  jest.useFakeTimers({ now: clock })
})

afterEach(() => {
  jest.useRealTimers()
  process.env.DISCORD_BOT_TOKEN = originalToken
  if (originalToken === undefined) delete process.env.DISCORD_BOT_TOKEN
})

function stored(value: Row | null) {
  prismaMock.discordIntegration.findUnique.mockResolvedValue(value === null ? null : { ...buildIntegration(), ...value })
}

function buildIntegration() {
  return {
    id: "discord",
    isEnabled: false,
    botEnabled: false,
    clientId: null,
    clientSecret: null,
    botToken: null,
    supportChannelId: null,
    supportThreadIds: null,
    configVersion: 0,
    guildId: null,
    serverInviteCode: null,
    platformName: "Plex Wrapped",
    instructions: null,
    createdAt: new Date(clock),
    updatedAt: new Date(clock),
    updatedBy: null,
  }
}

describe("isDiscordBotReady", () => {
  it.each([
    ["no integration row", null, undefined, false],
    ["turned off, with a token", row({ botEnabled: false }), undefined, false],
    ["turned off, with an environment token", row({ botEnabled: false, botToken: null }), "env-token", false],
    ["on, with no token anywhere", row({ botToken: null }), undefined, false],
    ["on, with a stored token", row({}), undefined, true],
    ["on, with only the environment token", row({ botToken: null }), "env-token", true],
  ])("%s: %s", async (_case, value, envToken, expected) => {
    stored(value)
    if (envToken) process.env.DISCORD_BOT_TOKEN = envToken

    await expect(isDiscordBotReady()).resolves.toBe(expected)
  })

  it("logs each change of state once, at info", async () => {
    stored(row({ botEnabled: false }))
    await isDiscordBotReady()
    await isDiscordBotReady()
    stored(row({ botToken: null }))
    await isDiscordBotReady()
    stored(row({}))
    await isDiscordBotReady()
    await isDiscordBotReady()

    const messages = mockInfo.mock.calls.map(([message]) => message)
    expect(messages.slice(-3)).toEqual(["discord.waiting_for_enable", "discord.waiting_for_token", "discord.ready"])
    expect(messages.filter((message) => message === "discord.ready")).toHaveLength(1)
  })

  it("answers false on a database error for that tick only, warning at most once a minute", async () => {
    prismaMock.discordIntegration.findUnique.mockRejectedValue(new Error("connection refused"))

    await expect(isDiscordBotReady()).resolves.toBe(false)
    jest.advanceTimersByTime(30_000)
    await expect(isDiscordBotReady()).resolves.toBe(false)
    expect(mockWarn).toHaveBeenCalledTimes(1)
    expect(mockWarn).toHaveBeenCalledWith("discord.readiness_check_failed", expect.anything())

    jest.advanceTimersByTime(30_000)
    await isDiscordBotReady()
    expect(mockWarn).toHaveBeenCalledTimes(2)

    stored(row({}))
    await expect(isDiscordBotReady()).resolves.toBe(true)
  })
})
