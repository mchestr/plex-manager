/**
 * @jest-environment node
 */

/**
 * P4.9 (SEC-13): the Discord callback links only for the browser and member
 * that started the authorization, consumes the state once, and redirects with
 * a fixed flash code on the app's origin.
 *
 * The real route, `completeDiscordLink` and signed cookie run; the session,
 * Prisma and Discord's API are mocked.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"
import { NextRequest } from "next/server"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { GET } from "@/app/api/discord/callback/route"
import { exchangeDiscordCode, fetchDiscordUserProfile } from "@/lib/discord/api"
import { DISCORD_OAUTH_COOKIE, discordOAuthCookie } from "@/lib/discord/oauth-cookie"
import type { DiscordIntegration, DiscordOAuthState } from "@/lib/generated/prisma/client"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/env", () => ({
  ...jest.requireActual("@/lib/env"),
  getBaseUrl: () => "https://app.example.com",
}))
jest.mock("@/lib/discord/api", () => ({
  exchangeDiscordCode: jest.fn(),
  fetchDiscordUserProfile: jest.fn(),
  refreshDiscordToken: jest.fn(),
  updateDiscordRoleConnection: jest.fn(),
}))
jest.mock("@/lib/security/audit-log", () => ({
  AuditEventType: { DISCORD_ACCOUNT_LINKED: "DISCORD_ACCOUNT_LINKED" },
  logAuditEvent: jest.fn(),
}))

const ORIGIN = "https://app.example.com"
const STATE = "A".repeat(32)
const OTHER_STATE = "B".repeat(32)

const mockSession = jest.mocked(getServerSession)

function stateRow(overrides: Partial<DiscordOAuthState> = {}): DiscordOAuthState {
  return {
    id: "state-row",
    userId: "user-1",
    state: STATE,
    codeVerifier: "",
    redirectTo: "/discord/link",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    ...overrides,
  }
}

function callback(query: string, cookie?: string): NextRequest {
  const headers = new Headers()
  if (cookie !== undefined) headers.set("cookie", `${DISCORD_OAUTH_COOKIE}=${cookie}`)
  return new NextRequest(`${ORIGIN}/api/discord/callback?${query}`, { headers })
}

function cookieFor(state: string, userId: string): string {
  return discordOAuthCookie(state, userId).value
}

function flashOf(response: Response): { location: URL; flash: string | null } {
  const location = new URL(response.headers.get("location") ?? "")
  return { location, flash: location.searchParams.get("flash") }
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  mockSession.mockResolvedValue({ user: { id: "user-1" } } as never)
  prismaMock.discordIntegration.findUnique.mockResolvedValue({
    id: "discord",
    isEnabled: true,
    clientId: "client-1",
    clientSecret: "secret",
  } as DiscordIntegration)
  prismaMock.discordOAuthState.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.discordOAuthState.findUniqueOrThrow.mockResolvedValue(stateRow())
  jest.mocked(exchangeDiscordCode).mockResolvedValue({
    access_token: "at",
    refresh_token: "rt",
    scope: "identify",
    expires_in: 3600,
    token_type: "Bearer",
  })
  jest.mocked(fetchDiscordUserProfile).mockResolvedValue({
    id: "discord-1",
    username: "member",
    discriminator: "0",
    global_name: "Member",
    avatar: null,
  })
})

describe("GET /api/discord/callback", () => {
  it("links the member and lands on the stored page", async () => {
    const response = await GET(callback(`code=abc&state=${STATE}`, cookieFor(STATE, "user-1")))

    const { location, flash } = flashOf(response)
    expect(location.pathname).toBe("/discord/link")
    expect(flash).toBe("discord_linked")
    expect(prismaMock.discordOAuthState.updateMany).toHaveBeenCalledWith({
      where: { state: STATE, userId: "user-1", consumedAt: null, expiresAt: { gt: expect.any(Date) } },
      data: { consumedAt: expect.any(Date) },
    })
    expect(prismaMock.discordConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } })
    )
  })

  it("clears the binding cookie on its own path", async () => {
    const response = await GET(callback(`code=abc&state=${STATE}`, cookieFor(STATE, "user-1")))

    const setCookie = response.headers.get("set-cookie") ?? ""
    expect(setCookie).toContain(`${DISCORD_OAUTH_COOKIE}=;`)
    expect(setCookie).toContain("Path=/api/discord/callback")
    expect(setCookie).toMatch(/Max-Age=0/)
  })

  it.each([
    ["no session", null, cookieFor(STATE, "user-1")],
    ["another member's session", { user: { id: "user-2" } }, cookieFor(STATE, "user-1")],
    ["no cookie", { user: { id: "user-1" } }, undefined],
    ["a cookie for another state", { user: { id: "user-1" } }, cookieFor(OTHER_STATE, "user-1")],
    ["a tampered cookie", { user: { id: "user-1" } }, `${cookieFor(STATE, "user-1")}x`],
    ["a cookie for another member", { user: { id: "user-1" } }, cookieFor(STATE, "user-2")],
  ])("refuses %s and links nothing", async (_label, session, cookie) => {
    mockSession.mockResolvedValue(session as never)

    const response = await GET(callback(`code=abc&state=${STATE}`, cookie))

    const { location, flash } = flashOf(response)
    expect(location.pathname).toBe("/")
    expect(flash).toBe("discord_session_mismatch")
    expect(prismaMock.discordOAuthState.updateMany).not.toHaveBeenCalled()
    expect(exchangeDiscordCode).not.toHaveBeenCalled()
    expect(prismaMock.discordConnection.upsert).not.toHaveBeenCalled()
  })

  it("refuses a state that was already consumed", async () => {
    prismaMock.discordOAuthState.updateMany.mockResolvedValue({ count: 0 })

    const response = await GET(callback(`code=abc&state=${STATE}`, cookieFor(STATE, "user-1")))

    expect(flashOf(response).flash).toBe("discord_expired")
    expect(exchangeDiscordCode).not.toHaveBeenCalled()
    expect(prismaMock.discordConnection.upsert).not.toHaveBeenCalled()
  })

  it("sends a stored off-list redirect to the link page", async () => {
    prismaMock.discordOAuthState.findUniqueOrThrow.mockResolvedValue(stateRow({ redirectTo: "/\\evil.com" }))

    const response = await GET(callback(`code=abc&state=${STATE}`, cookieFor(STATE, "user-1")))

    const { location } = flashOf(response)
    expect(location.origin).toBe(ORIGIN)
    expect(location.pathname).toBe("/discord/link")
  })

  it("maps a failed token exchange to a fixed code", async () => {
    jest.mocked(exchangeDiscordCode).mockRejectedValue(new Error("Discord said: invalid_grant at db:5432"))

    const response = await GET(callback(`code=abc&state=${STATE}`, cookieFor(STATE, "user-1")))

    expect(flashOf(response).flash).toBe("discord_failed")
    expect(response.headers.get("location")).not.toContain("invalid_grant")
  })

  it("never forwards Discord's error or its description", async () => {
    const response = await GET(
      callback("error=access_denied&error_description=Call+555+to+unlock", cookieFor(STATE, "user-1"))
    )

    const location = response.headers.get("location") ?? ""
    expect(flashOf(response).flash).toBe("discord_failed")
    expect(location).not.toContain("555")
    expect(location).not.toContain("access_denied")
    expect(location).not.toContain("error")
  })

  it.each(["code=abc", `state=${STATE}`, "code=abc&state=short", "code=a%20b&state=" + STATE])(
    "refuses a malformed query %j",
    async (query) => {
      const response = await GET(callback(query, cookieFor(STATE, "user-1")))

      expect(flashOf(response).flash).toBe("discord_failed")
      expect(prismaMock.discordConnection.upsert).not.toHaveBeenCalled()
    }
  )

  it("redirects every outcome to the app's origin", async () => {
    const outcomes = [
      await GET(callback(`code=abc&state=${STATE}`, cookieFor(STATE, "user-1"))),
      await GET(callback(`code=abc&state=${STATE}`)),
      await GET(callback("error=access_denied")),
    ]

    for (const response of outcomes) {
      expect(response.status).toBe(307)
      expect(flashOf(response).location.origin).toBe(ORIGIN)
    }
  })
})
