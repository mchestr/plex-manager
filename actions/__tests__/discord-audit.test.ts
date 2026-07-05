/**
 * Step 19 / Part A — Discord audit events (FR-14).
 *
 * Verifies that the Discord server actions and integration helpers emit
 * `logAuditEvent` with the correct type and a REDACTED diff (never the secret
 * values):
 *
 * - updateDiscordIntegrationSettings → DISCORD_INTEGRATION_CONFIG_CHANGED with a
 *   diff of which fields changed and whether secrets were touched, plus
 *   DISCORD_TOKEN_ROTATED when the bot token / configVersion changes.
 * - completeDiscordLink → DISCORD_ACCOUNT_LINKED (actor userId + discordUserId).
 * - disconnectDiscordAccount / clearDiscordRoleForUser → DISCORD_ACCOUNT_UNLINKED.
 */

import { logAuditEvent, AuditEventType } from "@/lib/security/audit-log"

jest.mock("@/lib/security/audit-log", () => ({
  AuditEventType: {
    DISCORD_INTEGRATION_CONFIG_CHANGED: "DISCORD_INTEGRATION_CONFIG_CHANGED",
    DISCORD_TOKEN_ROTATED: "DISCORD_TOKEN_ROTATED",
    DISCORD_ACCOUNT_LINKED: "DISCORD_ACCOUNT_LINKED",
    DISCORD_ACCOUNT_UNLINKED: "DISCORD_ACCOUNT_UNLINKED",
  },
  logAuditEvent: jest.fn(),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    discordIntegration: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    discordConnection: {
      upsert: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}))

jest.mock("@/lib/admin", () => ({
  requireAdmin: jest.fn(),
}))

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("@/lib/auth", () => ({ authOptions: {} }))

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))

jest.mock("@/lib/discord/integration", () => ({
  clearDiscordRoleForUser: jest.fn(),
  syncDiscordRoleConnection: jest.fn(),
}))

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}))

import { updateDiscordIntegrationSettings, disconnectDiscordAccount } from "@/actions/discord"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin"
import { clearDiscordRoleForUser as mockedClearRole } from "@/lib/discord/integration"

const mockLogAuditEvent = logAuditEvent as jest.MockedFunction<typeof logAuditEvent>
const mockPrisma = prisma as unknown as {
  discordIntegration: { findUnique: jest.Mock; upsert: jest.Mock }
  discordConnection: { deleteMany: jest.Mock; findUnique: jest.Mock }
}
const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>

beforeEach(() => {
  jest.clearAllMocks()
  mockRequireAdmin.mockResolvedValue({ user: { id: "admin-1", isAdmin: true } } as never)
  mockPrisma.discordIntegration.upsert.mockResolvedValue({} as never)
})

/** Assert no logged audit detail leaks a secret value anywhere in the payload. */
function assertNoSecretLeak(secretValues: string[]) {
  for (const call of mockLogAuditEvent.mock.calls) {
    const serialized = JSON.stringify(call)
    for (const secret of secretValues) {
      expect(serialized).not.toContain(secret)
    }
  }
}

describe("updateDiscordIntegrationSettings audit", () => {
  it("emits DISCORD_INTEGRATION_CONFIG_CHANGED with a redacted diff (no secret values)", async () => {
    mockPrisma.discordIntegration.findUnique.mockResolvedValue({
      id: "discord",
      isEnabled: false,
      botEnabled: false,
      clientId: "old-client",
      clientSecret: "OLD_SECRET_VALUE",
      botToken: "OLD_BOT_TOKEN",
      supportChannelId: null,
      supportThreadIds: [],
      configVersion: 3,
      guildId: null,
      serverInviteCode: null,
      platformName: "Plex Wrapped",
      instructions: null,
    } as never)

    const result = await updateDiscordIntegrationSettings({
      isEnabled: true,
      clientId: "new-client",
      clientSecret: "SUPER_SECRET_CLIENT",
      botToken: "SUPER_SECRET_BOT_TOKEN",
      guildId: "guild-123",
    })

    expect(result.success).toBe(true)

    const configCall = mockLogAuditEvent.mock.calls.find(
      (c) => c[0] === AuditEventType.DISCORD_INTEGRATION_CONFIG_CHANGED
    )
    expect(configCall).toBeDefined()
    expect(configCall?.[1]).toBe("admin-1")

    const details = configCall?.[2] as Record<string, unknown>
    // Diff records which fields changed, including the secret field NAMES.
    expect(details.changedFields).toEqual(
      expect.arrayContaining(["isEnabled", "clientId", "clientSecret", "botToken", "guildId"])
    )
    // Secret touch flags are present and true.
    expect(details.secretsChanged).toEqual(
      expect.objectContaining({ clientSecret: true, botToken: true })
    )

    // The secret VALUES must never appear anywhere in the audit payload.
    assertNoSecretLeak(["SUPER_SECRET_CLIENT", "SUPER_SECRET_BOT_TOKEN", "OLD_SECRET_VALUE", "OLD_BOT_TOKEN"])
  })

  it("emits DISCORD_TOKEN_ROTATED when the bot token / configVersion changes", async () => {
    mockPrisma.discordIntegration.findUnique.mockResolvedValue({
      id: "discord",
      isEnabled: true,
      botEnabled: true,
      clientId: "client",
      clientSecret: "SECRET",
      botToken: "OLD_BOT_TOKEN",
      supportChannelId: null,
      supportThreadIds: [],
      configVersion: 5,
      guildId: "guild-123",
      serverInviteCode: null,
      platformName: "Plex Wrapped",
      instructions: null,
    } as never)

    await updateDiscordIntegrationSettings({
      isEnabled: true,
      clientId: "client",
      botToken: "ROTATED_BOT_TOKEN",
      guildId: "guild-123",
    })

    const rotationCall = mockLogAuditEvent.mock.calls.find(
      (c) => c[0] === AuditEventType.DISCORD_TOKEN_ROTATED
    )
    expect(rotationCall).toBeDefined()
    expect(rotationCall?.[1]).toBe("admin-1")
    const details = rotationCall?.[2] as Record<string, unknown>
    // configVersion is bumped every write; rotation flags the new version.
    expect(details.configVersion).toBe(6)
    expect(details.botTokenChanged).toBe(true)

    assertNoSecretLeak(["ROTATED_BOT_TOKEN", "OLD_BOT_TOKEN", "SECRET"])
  })

  it("does NOT flag botToken as changed when the token is left blank (kept)", async () => {
    mockPrisma.discordIntegration.findUnique.mockResolvedValue({
      id: "discord",
      isEnabled: true,
      botEnabled: true,
      clientId: "client",
      clientSecret: "SECRET",
      botToken: "KEPT_BOT_TOKEN",
      supportChannelId: null,
      supportThreadIds: [],
      configVersion: 2,
      guildId: "guild-123",
      serverInviteCode: null,
      platformName: "Plex Wrapped",
      instructions: null,
    } as never)

    // Blank secret fields → "keep the stored secret", so they are NOT changes.
    await updateDiscordIntegrationSettings({
      isEnabled: true,
      clientId: "client",
      guildId: "guild-123",
    })

    const configCall = mockLogAuditEvent.mock.calls.find(
      (c) => c[0] === AuditEventType.DISCORD_INTEGRATION_CONFIG_CHANGED
    )
    const details = configCall?.[2] as Record<string, unknown>
    expect(details.secretsChanged).toEqual(
      expect.objectContaining({ clientSecret: false, botToken: false })
    )
    expect(details.changedFields).not.toContain("clientSecret")
    expect(details.changedFields).not.toContain("botToken")
  })
})

describe("disconnectDiscordAccount", () => {
  it("delegates unlink to clearDiscordRoleForUser (which owns the UNLINKED audit)", async () => {
    const { getServerSession } = require("next-auth")
    ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: "user-9" } })
    ;(mockedClearRole as jest.Mock).mockResolvedValue(undefined)

    const result = await disconnectDiscordAccount()

    expect(result.success).toBe(true)
    // The audit lives in clearDiscordRoleForUser (see integration-audit.test.ts)
    // so the action does not double-log it.
    expect(mockedClearRole).toHaveBeenCalledWith("user-9")
  })
})
