/**
 * @jest-environment node
 */

/**
 * The Discord bot logs through the shared sanitising logger (BP-37), so its
 * metadata is redacted like every other line.
 */

import type { Client } from "discord.js"
import { Events } from "discord.js"

import { captureProductionLogs } from "@/__tests__/helpers/log-capture"

// Importing bot.ts only needs the client factory and its config reads.
jest.mock("../routing/interaction-router", () => ({ routeInteraction: jest.fn() }))
jest.mock("../routing/dm-router", () => ({
  routeDirectMessage: jest.fn(),
  defaultDmRouteDeps: jest.fn(),
}))
jest.mock("../config", () => ({
  getDiscordBotToken: jest.fn().mockResolvedValue("bot-token"),
  getSupportChannelId: jest.fn().mockResolvedValue(undefined),
  getDiscordPortalUrl: jest.fn(() => "https://example.com/discord/link"),
}))

const SECRET = "Sup3rSecretValue"

/** A fake discord.js client that keeps its handlers so a test can fire them. */
function makeFakeClient() {
  const handlers = new Map<string, (...args: unknown[]) => void>()
  const register = (event: string, handler: (...args: unknown[]) => void) => {
    handlers.set(event, handler)
  }
  const client = {
    once: jest.fn(register),
    on: jest.fn(register),
    login: jest.fn().mockResolvedValue("token"),
    destroy: jest.fn().mockResolvedValue(undefined),
  }
  return { client: client as unknown as Client, emit: (event: string, ...args: unknown[]) => handlers.get(event)?.(...args) }
}

describe("DiscordBot logging", () => {
  it("logs through the shared sanitiser by default, redacting a token in its metadata", async () => {
    const { lines, loaded: bot } = captureProductionLogs(() => {
      const { DiscordBot } = require("../bot") as typeof import("../bot")
      const fake = makeFakeClient()
      return { instance: new DiscordBot(() => fake.client), emit: fake.emit }
    })

    await bot.instance.initialize()
    bot.emit(Events.Warn, `Gateway rejected https://discord.com/api/gateway?token=${SECRET}`)
    bot.emit(Events.ShardDisconnect, { code: 4004, reason: `token=${SECRET}` }, 0)

    const text = JSON.stringify(lines)
    expect(text).not.toContain(SECRET)
    expect(lines.every((line) => line.context === "discord-bot")).toBe(true)
    expect(lines.find((line) => line.message === "Discord client warning")?.metadata).toEqual({
      warning: "Gateway rejected https://discord.com/api/gateway?token=[REDACTED]",
    })
    expect(lines.find((line) => line.message === "Discord shard disconnected")?.metadata).toEqual({
      shardId: 0,
      code: 4004,
      reason: "token=[REDACTED]",
    })
  })

  it("takes a replacement logger through its constructor", async () => {
    const { DiscordBot } = require("../bot") as typeof import("../bot")
    const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), child: jest.fn(), time: jest.fn(), timeSync: jest.fn() }
    const fake = makeFakeClient()

    await new DiscordBot(() => fake.client, logger).initialize()

    expect(logger.info).toHaveBeenCalledWith("Discord bot initialized successfully")
  })
})
