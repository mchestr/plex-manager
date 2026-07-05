/**
 * Step 19 / Part B — pending OAuth state cap.
 *
 * createDiscordAuthorizationUrl must, inside its transaction, delete prior
 * un-consumed states for the SAME user before creating the new one, so pending
 * states can't accumulate (a fresh link attempt supersedes any dangling one).
 */

jest.mock("@/lib/prisma", () => {
  const tx = {
    discordOAuthState: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    },
  }
  return {
    prisma: {
      discordIntegration: { findUnique: jest.fn() },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      // Expose the tx mocks for assertions.
      __tx: tx,
    },
  }
})

jest.mock("@/lib/discord/api", () => ({
  exchangeDiscordCode: jest.fn(),
  fetchDiscordUserProfile: jest.fn(),
  refreshDiscordToken: jest.fn(),
  updateDiscordRoleConnection: jest.fn(),
}))
jest.mock("@/lib/discord/config", () => ({ getDiscordBotToken: jest.fn() }))
jest.mock("@/lib/discord/role-metadata", () => ({ computeRoleMetadata: jest.fn() }))
jest.mock("@/lib/utils", () => ({ getBaseUrl: () => "https://app.example.com" }))
jest.mock("@/lib/security/audit-log", () => ({ AuditEventType: {}, logAuditEvent: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

import { createDiscordAuthorizationUrl } from "@/lib/discord/integration"
import { prisma } from "@/lib/prisma"

const p = prisma as unknown as {
  discordIntegration: { findUnique: jest.Mock }
  __tx: {
    discordOAuthState: { deleteMany: jest.Mock; create: jest.Mock }
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  p.discordIntegration.findUnique.mockResolvedValue({
    id: "discord",
    isEnabled: true,
    clientId: "client-1",
    clientSecret: "secret",
  })
})

describe("createDiscordAuthorizationUrl - pending state cap", () => {
  it("deletes the user's prior un-consumed states before creating the new one", async () => {
    const result = await createDiscordAuthorizationUrl("user-1", "/wrapped")

    expect(result.url).toContain("discord.com/oauth2/authorize")
    expect(result.state).toBeTruthy()

    // A deleteMany targeting the user's un-consumed states must have run.
    const deleteCalls = p.__tx.discordOAuthState.deleteMany.mock.calls
    const userScopedDelete = deleteCalls.find((call) => {
      const where = call[0]?.where
      return where && where.userId === "user-1" && where.consumedAt === null
    })
    expect(userScopedDelete).toBeDefined()

    // And the new state is created for that user.
    expect(p.__tx.discordOAuthState.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-1" }) })
    )
  })
})
