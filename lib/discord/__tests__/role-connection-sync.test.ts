/**
 * `syncDiscordRoleConnection` (lib/discord/integration.ts), P4.18: what it
 * pushes to Discord and what it stores. No email ever reaches Discord as the
 * `platform_username` (SEC-47), and the hours it pushed are stored back as
 * `lastWatchedHours` for the next event-driven sync.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { updateDiscordRoleConnection } from "@/lib/discord/api"
import { syncDiscordRoleConnection } from "@/lib/discord/integration"
import { computeRoleMetadata } from "@/lib/discord/role-metadata"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/discord/api", () => ({
  exchangeDiscordCode: jest.fn(),
  fetchDiscordUserProfile: jest.fn(),
  refreshDiscordToken: jest.fn(),
  updateDiscordRoleConnection: jest.fn(),
}))
jest.mock("@/lib/discord/config", () => ({ getDiscordBotToken: jest.fn() }))
jest.mock("@/lib/discord/role-metadata", () => ({ computeRoleMetadata: jest.fn() }))
jest.mock("@/lib/env", () => ({ getBaseUrl: () => "https://app.example.com" }))
jest.mock("@/lib/security/audit-log", () => ({ AuditEventType: {}, logAuditEvent: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

const mockPush = jest.mocked(updateDiscordRoleConnection)
const mockCompute = jest.mocked(computeRoleMetadata)

function given(user: { name: string | null; email: string | null }) {
  prismaMock.discordIntegration.findUnique.mockResolvedValue({
    id: "discord",
    isEnabled: true,
    clientId: "client",
    clientSecret: "secret",
    platformName: "Plex Manager",
  } as never)
  prismaMock.discordConnection.findUnique.mockResolvedValue({
    userId: "user-1",
    accessToken: "discord-access",
    refreshToken: null,
    expiresAt: new Date(Date.now() + 3_600_000),
    revokedAt: null,
    lastWatchedHours: 12,
  } as never)
  // The select leaves the email out; return it anyway to prove it is never used.
  prismaMock.user.findUnique.mockResolvedValue({ id: "user-1", plexUserId: "plex-1", ...user } as never)
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  mockPush.mockResolvedValue(undefined)
  mockCompute.mockResolvedValue({ metadata: { is_subscribed: true, watched_hours: 12 }, watchedHours: 12 })
})

describe("syncDiscordRoleConnection", () => {
  it("never pushes an email as platform_username", async () => {
    given({ name: null, email: "member@example.com" })

    await syncDiscordRoleConnection("user-1", { refreshHours: false })

    const pushed = mockPush.mock.calls[0][0]
    expect(pushed.platform_username).toBe("Plex member")
    expect(JSON.stringify(pushed)).not.toContain("@example.com")
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true, name: true, plexUserId: true } })
    )
  })

  it("uses the member's display name when there is one", async () => {
    given({ name: "Sam", email: "sam@example.com" })

    await syncDiscordRoleConnection("user-1", { refreshHours: false })

    expect(mockPush.mock.calls[0][0].platform_username).toBe("Sam")
  })

  it("passes the stored hours in and stores the pushed hours back", async () => {
    given({ name: "Sam", email: null })
    mockCompute.mockResolvedValue({ metadata: { is_subscribed: false, watched_hours: 30 }, watchedHours: 30 })

    await syncDiscordRoleConnection("user-1", { refreshHours: true })

    expect(mockCompute).toHaveBeenCalledWith(
      { id: "user-1", plexUserId: "plex-1", lastWatchedHours: 12 },
      { refreshHours: true }
    )
    expect(prismaMock.discordConnection.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { metadataSyncedAt: expect.any(Date), lastWatchedHours: 30, lastError: null },
    })
  })

  it("pushes nothing and stores nothing when Plex access is unknown, so the role is kept", async () => {
    given({ name: "Sam", email: null })
    mockCompute.mockResolvedValue({ metadata: null, watchedHours: 12 })

    await syncDiscordRoleConnection("user-1", { refreshHours: false })

    expect(mockPush).not.toHaveBeenCalled()
    expect(prismaMock.discordConnection.update).not.toHaveBeenCalled()
  })

  it("refreshes the hours by default (a fresh link or a manual resync)", async () => {
    given({ name: "Sam", email: null })

    await syncDiscordRoleConnection("user-1")

    expect(mockCompute).toHaveBeenCalledWith(expect.anything(), { refreshHours: true })
  })
})
