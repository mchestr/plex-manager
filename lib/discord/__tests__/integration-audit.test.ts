/**
 * Step 19 / Part A — audit events emitted from lib/discord/integration.ts.
 *
 * - completeDiscordLink → DISCORD_ACCOUNT_LINKED (actor userId + discordUserId).
 * - clearDiscordRoleForUser → DISCORD_ACCOUNT_UNLINKED, after revoking the
 *   grant at Discord and deleting the chat sessions of that Discord id (GAP-31).
 */

import { logAuditEvent, AuditEventType } from "@/lib/security/audit-log"

jest.mock("@/lib/security/audit-log", () => ({
  AuditEventType: {
    DISCORD_ACCOUNT_LINKED: "DISCORD_ACCOUNT_LINKED",
    DISCORD_ACCOUNT_UNLINKED: "DISCORD_ACCOUNT_UNLINKED",
  },
  logAuditEvent: jest.fn(),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    discordIntegration: { findUnique: jest.fn() },
    discordConnection: {
      upsert: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
    },
    discordOAuthState: {
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    discordChatSession: { deleteMany: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  },
}))

jest.mock("@/lib/discord/api", () => ({
  exchangeDiscordCode: jest.fn(),
  fetchDiscordUserProfile: jest.fn(),
  refreshDiscordToken: jest.fn(),
  revokeDiscordToken: jest.fn(),
  updateDiscordRoleConnection: jest.fn(),
}))

jest.mock("@/lib/discord/config", () => ({ getDiscordBotToken: jest.fn() }))
jest.mock("@/lib/discord/role-metadata", () => ({ computeRoleMetadata: jest.fn().mockResolvedValue({}) }))
jest.mock("@/lib/env", () => ({ getBaseUrl: () => "https://app.example.com" }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

import { completeDiscordLink, clearDiscordRoleForUser } from "@/lib/discord/integration"
import { prisma } from "@/lib/prisma"
import {
  exchangeDiscordCode,
  fetchDiscordUserProfile,
  revokeDiscordToken,
  updateDiscordRoleConnection,
} from "@/lib/discord/api"

const mockLogAuditEvent = logAuditEvent as jest.MockedFunction<typeof logAuditEvent>
const p = prisma as unknown as {
  discordIntegration: { findUnique: jest.Mock }
  discordConnection: { upsert: jest.Mock; update: jest.Mock; deleteMany: jest.Mock; findUnique: jest.Mock }
  discordOAuthState: { updateMany: jest.Mock; findUniqueOrThrow: jest.Mock }
  discordChatSession: { deleteMany: jest.Mock }
  user: { findUnique: jest.Mock }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("completeDiscordLink audit", () => {
  it("emits DISCORD_ACCOUNT_LINKED with actor userId and discordUserId", async () => {
    p.discordOAuthState.updateMany.mockResolvedValue({ count: 1 })
    p.discordOAuthState.findUniqueOrThrow.mockResolvedValue({
      state: "state-1",
      userId: "user-42",
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      redirectTo: "/",
    })
    p.discordIntegration.findUnique.mockResolvedValue({
      id: "discord",
      isEnabled: true,
      clientId: "client-1",
      clientSecret: "secret",
    })
    ;(exchangeDiscordCode as jest.Mock).mockResolvedValue({
      access_token: "at",
      refresh_token: "rt",
      scope: "identify",
      expires_in: 3600,
    })
    ;(fetchDiscordUserProfile as jest.Mock).mockResolvedValue({
      id: "discord-user-99",
      username: "bob",
      discriminator: "0001",
      global_name: "Bob",
      avatar: null,
    })
    p.discordConnection.upsert.mockResolvedValue({})

    const result = await completeDiscordLink("code", "state-1", "user-42")

    expect(result.redirectTo).toBe("/")
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      AuditEventType.DISCORD_ACCOUNT_LINKED,
      "user-42",
      expect.objectContaining({ discordUserId: "discord-user-99" })
    )
  })
})

describe("clearDiscordRoleForUser audit", () => {
  it("emits DISCORD_ACCOUNT_UNLINKED for the user", async () => {
    p.discordIntegration.findUnique.mockResolvedValue({
      id: "discord",
      isEnabled: true,
      clientId: "client-1",
      clientSecret: "secret",
      platformName: "Plex Wrapped",
    })
    p.discordConnection.findUnique.mockResolvedValue({
      userId: "user-7",
      discordUserId: "discord-7",
      accessToken: "at",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 600_000),
      refreshToken: "rt",
    })
    ;(updateDiscordRoleConnection as jest.Mock).mockResolvedValue({})
    p.discordConnection.deleteMany.mockResolvedValue({ count: 1 })

    await expect(clearDiscordRoleForUser("user-7")).resolves.toEqual({ linked: true, roleCleared: true, grantRevoked: true })

    expect(revokeDiscordToken).toHaveBeenCalledWith({
      clientId: "client-1",
      clientSecret: "secret",
      token: "rt",
      tokenTypeHint: "refresh_token",
    })
    expect(p.discordConnection.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-7" } })
    expect(p.discordChatSession.deleteMany).toHaveBeenCalledWith({ where: { discordUserId: "discord-7" } })
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      AuditEventType.DISCORD_ACCOUNT_UNLINKED,
      "user-7",
      expect.any(Object)
    )
  })

  it("still unlinks when Discord refuses the revoke", async () => {
    p.discordIntegration.findUnique.mockResolvedValue({ id: "discord", isEnabled: true, clientId: "client-1", clientSecret: "secret" })
    p.discordConnection.findUnique.mockResolvedValue({
      userId: "user-7",
      discordUserId: "discord-7",
      accessToken: "at",
      refreshToken: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 600_000),
    })
    ;(updateDiscordRoleConnection as jest.Mock).mockResolvedValue({})
    ;(revokeDiscordToken as jest.Mock).mockRejectedValue(new Error("400"))

    await expect(clearDiscordRoleForUser("user-7")).resolves.toEqual({ linked: true, roleCleared: true, grantRevoked: false })

    expect(revokeDiscordToken).toHaveBeenCalledWith(expect.objectContaining({ token: "at", tokenTypeHint: "access_token" }))
    expect(p.discordConnection.deleteMany).toHaveBeenCalled()
  })

  it("still emits DISCORD_ACCOUNT_UNLINKED even if the role clear fails", async () => {
    // ensureValidAccessToken throws (not linked) → we still delete + audit.
    p.discordIntegration.findUnique.mockResolvedValue({
      id: "discord",
      isEnabled: true,
      clientId: "client-1",
      clientSecret: "secret",
    })
    p.discordConnection.findUnique.mockResolvedValue(null)
    p.discordConnection.deleteMany.mockResolvedValue({ count: 1 })

    await clearDiscordRoleForUser("user-7")

    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      AuditEventType.DISCORD_ACCOUNT_UNLINKED,
      "user-7",
      expect.any(Object)
    )
  })
})
