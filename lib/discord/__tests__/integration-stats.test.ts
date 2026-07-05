/**
 * Tests for getDiscordStats (lib/discord/integration.ts, FR-11).
 *
 * The Prisma encryption extension DECRYPTS `clientSecret` on read, so returning
 * the DiscordIntegration row verbatim would leak the plaintext client secret to
 * any caller. getDiscordStats MUST strip it and expose only a boolean.
 */

import { getDiscordStats } from "@/lib/discord/integration"
import { prisma } from "@/lib/prisma"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  })),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    discordIntegration: { findUnique: jest.fn() },
    discordConnection: { count: jest.fn() },
  },
}))

const mockFindUnique = prisma.discordIntegration.findUnique as jest.Mock
const mockCount = prisma.discordConnection.count as jest.Mock

const SECRET_VALUE = "super-secret-client-secret"

describe("getDiscordStats - clientSecret leak (FR-11)", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCount.mockResolvedValue(7)
  })

  it("never returns the decrypted clientSecret and exposes hasClientSecret=true instead", async () => {
    mockFindUnique.mockResolvedValue({
      id: "discord",
      isEnabled: true,
      clientId: "client-123",
      clientSecret: SECRET_VALUE,
      guildId: "guild-1",
      platformName: "Plex Wrapped",
    })

    const { integration, linkedCount } = await getDiscordStats()

    expect(integration).not.toBeNull()
    // The raw secret must be gone entirely.
    expect(integration).not.toHaveProperty("clientSecret")
    expect(JSON.stringify(integration)).not.toContain(SECRET_VALUE)
    // Replaced by a boolean presence flag.
    expect(integration).toMatchObject({ hasClientSecret: true, clientId: "client-123" })
    // Non-secret fields are preserved.
    expect(integration).toMatchObject({ id: "discord", isEnabled: true, guildId: "guild-1" })
    expect(linkedCount).toBe(7)
  })

  it("reports hasClientSecret=false when no secret is set", async () => {
    mockFindUnique.mockResolvedValue({
      id: "discord",
      isEnabled: false,
      clientId: null,
      clientSecret: null,
    })

    const { integration } = await getDiscordStats()

    expect(integration).not.toHaveProperty("clientSecret")
    expect(integration).toMatchObject({ hasClientSecret: false })
  })

  it("returns integration=null when no row exists", async () => {
    mockFindUnique.mockResolvedValue(null)

    const { integration, linkedCount } = await getDiscordStats()

    expect(integration).toBeNull()
    expect(linkedCount).toBe(7)
  })
})
