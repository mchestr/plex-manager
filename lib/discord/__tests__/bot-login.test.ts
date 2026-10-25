/**
 * @jest-environment node
 */

import type { Client } from "discord.js"

import { DiscordBot } from "@/lib/discord/bot"
import { LoginGuard } from "@/lib/discord/login-guard"
import { getDiscordBotToken } from "@/lib/discord/config"

jest.mock("@/lib/discord/config", () => ({
  getDiscordBotToken: jest.fn(),
  getSupportChannelId: jest.fn().mockResolvedValue(undefined),
  getDiscordPortalUrl: jest.fn().mockReturnValue("https://example.test/discord/link"),
}))
jest.mock("@/lib/discord/routing/interaction-router", () => ({ routeInteraction: jest.fn() }))
jest.mock("@/lib/discord/routing/dm-router", () => ({ routeDirectMessage: jest.fn(), defaultDmRouteDeps: jest.fn() }))
const mockHealth = jest.fn()
jest.mock("@/lib/discord/login-ledger", () => ({
  LoginLedger: jest.fn(),
  recordGatewayDisconnect: jest.fn(),
  recordGatewayHealth: (...args: unknown[]) => mockHealth(...args),
}))

const logger = { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() }

interface FakeClient {
  login: jest.Mock
  destroy: jest.Mock
  once: jest.Mock
  on: jest.Mock
}

function setup() {
  let clock = 1_000_000
  const clients: FakeClient[] = []
  const loginResults: Array<Error | null> = []
  const factory = () => {
    const client: FakeClient = {
      login: jest.fn(async () => {
        const failure = loginResults.shift()
        if (failure) throw failure
        return "token"
      }),
      destroy: jest.fn(async () => undefined),
      once: jest.fn(),
      on: jest.fn(),
    }
    clients.push(client)
    return client as unknown as Client
  }
  const ledger = { count: jest.fn(async () => 0), record: jest.fn(async () => undefined) }
  const guard = new LoginGuard(ledger, () => clock, () => 0)
  const bot = new DiscordBot(factory, logger, guard)
  return { bot, clients, loginResults, ledger, advance: (ms: number) => (clock += ms) }
}

const live = (clients: FakeClient[]) => clients.filter((client) => client.destroy.mock.calls.length === 0)

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getDiscordBotToken).mockResolvedValue("token-a")
})

describe("DiscordBot login", () => {
  it("destroys the client when login rejects and keeps no second one alive", async () => {
    const { bot, clients, loginResults } = setup()
    loginResults.push(new Error("gateway timeout"))

    await expect(bot.initialize()).resolves.toBeUndefined()

    expect(clients).toHaveLength(1)
    expect(clients[0].destroy).toHaveBeenCalledTimes(1)
    expect(live(clients)).toHaveLength(0)
    expect(bot.isActive).toBe(false)
  })

  it("waits out the backoff, then logs in once and keeps one live client", async () => {
    const { bot, clients, loginResults, advance } = setup()
    loginResults.push(new Error("gateway timeout"))
    await bot.initialize()

    await bot.initialize()
    expect(clients).toHaveLength(1)

    advance(31_000)
    await bot.initialize()
    expect(clients).toHaveLength(2)
    expect(live(clients)).toEqual([clients[1]])
    expect(bot.isActive).toBe(true)
  })

  it("stops retrying a rejected token and reports it, until the token changes", async () => {
    const { bot, clients, loginResults, advance } = setup()
    loginResults.push(Object.assign(new Error("An invalid token was provided."), { code: "TokenInvalid" }))
    await bot.initialize()
    expect(mockHealth).toHaveBeenCalledWith("fatal", expect.stringContaining("new token"))

    advance(24 * 60 * 60 * 1000)
    await bot.initialize()
    await bot.initialize()
    expect(clients).toHaveLength(1)

    jest.mocked(getDiscordBotToken).mockResolvedValue("token-b")
    await bot.initialize()
    expect(clients).toHaveLength(2)
    expect(bot.isActive).toBe(true)
  })

  it("makes a handful of attempts, not an endless loop, against a dead token", async () => {
    const { bot, clients, loginResults, advance } = setup()
    for (let i = 0; i < 400; i++) loginResults.push(new Error("socket hang up"))

    // An hour of 10 s poll ticks.
    for (let tick = 0; tick < 360; tick++) {
      await bot.initialize()
      advance(10_000)
    }

    expect(clients.length).toBeLessThanOrEqual(8)
    expect(live(clients)).toHaveLength(0)
  })

  it("keeps the session when initialized again with the same token", async () => {
    const { bot, clients } = setup()
    await bot.initialize()
    await bot.initialize()

    expect(clients).toHaveLength(1)
    expect(clients[0].login).toHaveBeenCalledTimes(1)
    expect(clients[0].destroy).not.toHaveBeenCalled()
  })

  it("destroys the old client before logging in with a new token", async () => {
    const { bot, clients } = setup()
    await bot.initialize()
    jest.mocked(getDiscordBotToken).mockResolvedValue("token-b")
    await bot.initialize()

    expect(clients[0].destroy).toHaveBeenCalledTimes(1)
    expect(live(clients)).toEqual([clients[1]])
  })

  it("refuses to log in above the daily cap", async () => {
    const { bot, clients, ledger } = setup()
    ledger.count.mockResolvedValue(100)

    await bot.initialize()

    expect(clients).toHaveLength(0)
    expect(mockHealth).toHaveBeenCalledWith("daily_cap", expect.any(String))
  })

  it("destroys cleanly even when no client exists", async () => {
    const { bot } = setup()
    await expect(bot.destroy()).resolves.toBeUndefined()
  })
})
