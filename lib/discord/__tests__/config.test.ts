/**
 * Tests for the Discord runtime-config resolver (lib/discord/config.ts).
 *
 * Each getter prefers the DB `DiscordIntegration` row and falls back to the
 * historical `process.env` variable so existing deployments keep working after
 * the botToken/support-channel migration (NFR-5). Prisma is mocked.
 */

import { getDiscordBotToken, getSupportChannelId, getSupportThreadIds } from "@/lib/discord/config"
import { prisma } from "@/lib/prisma"

jest.mock("@/lib/prisma", () => ({
  prisma: {
    discordIntegration: { findUnique: jest.fn() },
  },
}))

const mockPrisma = prisma as unknown as {
  discordIntegration: { findUnique: jest.Mock }
}

const ENV_KEYS = [
  "DISCORD_BOT_TOKEN",
  "DISCORD_SUPPORT_CHANNEL_ID",
  "DISCORD_SUPPORT_THREAD_IDS",
] as const

const originalEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = originalEnv[key]
    }
  }
})

describe("getDiscordBotToken", () => {
  it("prefers the DB botToken over env", async () => {
    process.env.DISCORD_BOT_TOKEN = "env-token"
    mockPrisma.discordIntegration.findUnique.mockResolvedValue({ botToken: "db-token" })

    await expect(getDiscordBotToken()).resolves.toBe("db-token")
  })

  it("falls back to env when the DB value is null", async () => {
    process.env.DISCORD_BOT_TOKEN = "env-token"
    mockPrisma.discordIntegration.findUnique.mockResolvedValue({ botToken: null })

    await expect(getDiscordBotToken()).resolves.toBe("env-token")
  })

  it("falls back to env when there is no DB row", async () => {
    process.env.DISCORD_BOT_TOKEN = "env-token"
    mockPrisma.discordIntegration.findUnique.mockResolvedValue(null)

    await expect(getDiscordBotToken()).resolves.toBe("env-token")
  })

  it("returns undefined when neither DB nor env is set", async () => {
    mockPrisma.discordIntegration.findUnique.mockResolvedValue({ botToken: null })

    await expect(getDiscordBotToken()).resolves.toBeUndefined()
  })
})

describe("getSupportChannelId", () => {
  it("prefers the DB supportChannelId over env", async () => {
    process.env.DISCORD_SUPPORT_CHANNEL_ID = "env-channel"
    mockPrisma.discordIntegration.findUnique.mockResolvedValue({ supportChannelId: "db-channel" })

    await expect(getSupportChannelId()).resolves.toBe("db-channel")
  })

  it("falls back to env when the DB value is null", async () => {
    process.env.DISCORD_SUPPORT_CHANNEL_ID = "env-channel"
    mockPrisma.discordIntegration.findUnique.mockResolvedValue({ supportChannelId: null })

    await expect(getSupportChannelId()).resolves.toBe("env-channel")
  })

  it("returns undefined when neither DB nor env is set", async () => {
    mockPrisma.discordIntegration.findUnique.mockResolvedValue(null)

    await expect(getSupportChannelId()).resolves.toBeUndefined()
  })
})

describe("getSupportThreadIds", () => {
  it("prefers the DB supportThreadIds JSON array over env", async () => {
    process.env.DISCORD_SUPPORT_THREAD_IDS = "env-1,env-2"
    mockPrisma.discordIntegration.findUnique.mockResolvedValue({ supportThreadIds: ["db-1", "db-2"] })

    await expect(getSupportThreadIds()).resolves.toEqual(["db-1", "db-2"])
  })

  it("falls back to the comma-separated env when DB is null", async () => {
    process.env.DISCORD_SUPPORT_THREAD_IDS = "env-1, env-2 ,, env-3"
    mockPrisma.discordIntegration.findUnique.mockResolvedValue({ supportThreadIds: null })

    await expect(getSupportThreadIds()).resolves.toEqual(["env-1", "env-2", "env-3"])
  })

  it("falls back to env when the DB array is empty", async () => {
    process.env.DISCORD_SUPPORT_THREAD_IDS = "env-1"
    mockPrisma.discordIntegration.findUnique.mockResolvedValue({ supportThreadIds: [] })

    await expect(getSupportThreadIds()).resolves.toEqual(["env-1"])
  })

  it("returns an empty array when neither DB nor env is set", async () => {
    mockPrisma.discordIntegration.findUnique.mockResolvedValue(null)

    await expect(getSupportThreadIds()).resolves.toEqual([])
  })
})
