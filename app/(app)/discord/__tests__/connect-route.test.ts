/**
 * Step 19 / Part B — OAuth link rate limiting on the connect route.
 *
 * The connect route (app/(app)/discord/connect/route.ts) must, after the session
 * check and before creating an auth URL/state, enforce a per-user rate limit so a
 * user can't spam link attempts (each of which writes an OAuthState row). On the
 * N+1th attempt it returns a friendly redirect instead of building the URL.
 *
 * P4.5 (SEC-28): linking grants the Discord role, so it needs `full`
 * entitlement; anyone else is redirected to /subscribe before any of that.
 */

import { GET } from "@/app/(app)/discord/connect/route"
import { hasEntitlement } from "@/lib/actions/entitlement"
import { getServerSession } from "next-auth"
import { createDiscordAuthorizationUrl } from "@/lib/discord/integration"
import { consume } from "@/lib/security/rate-limit"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/discord/integration", () => ({
  createDiscordAuthorizationUrl: jest.fn(),
}))
jest.mock("@/lib/security/rate-limit", () => ({
  consume: jest.fn(),
}))
jest.mock("@/lib/actions/entitlement", () => ({
  ...jest.requireActual("@/lib/actions/entitlement"),
  hasEntitlement: jest.fn(),
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockCreateUrl = createDiscordAuthorizationUrl as jest.MockedFunction<
  typeof createDiscordAuthorizationUrl
>
const mockConsume = consume as jest.MockedFunction<typeof consume>

function makeRequest(url = "http://localhost:3000/discord/connect") {
  return { url, nextUrl: new URL(url) } as never
}

describe("discord connect route rate limiting", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } } as never)
    mockCreateUrl.mockResolvedValue({ url: "https://discord.com/oauth2/authorize?x=1", state: "s" })
    jest.mocked(hasEntitlement).mockResolvedValue(true)
  })

  it("redirects a member without full entitlement to /subscribe (no rate-limit / URL work)", async () => {
    jest.mocked(hasEntitlement).mockResolvedValue(false)

    const res = await GET(makeRequest())

    expect(hasEntitlement).toHaveBeenCalledWith("user-1", "full")
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://localhost:3000/subscribe")
    expect(mockConsume).not.toHaveBeenCalled()
    expect(mockCreateUrl).not.toHaveBeenCalled()
  })

  it("redirects to home when unauthenticated (no rate-limit / URL work)", async () => {
    mockGetServerSession.mockResolvedValue(null)

    const res = await GET(makeRequest())

    expect(res.status).toBe(307)
    expect(mockConsume).not.toHaveBeenCalled()
    expect(mockCreateUrl).not.toHaveBeenCalled()
  })

  it("spends the per-user discord-link limit for the user id and proceeds when allowed", async () => {
    mockConsume.mockResolvedValue({ ok: true })

    const res = await GET(makeRequest())

    expect(mockConsume).toHaveBeenCalledWith("discord-link", "user-1")
    expect(mockCreateUrl).toHaveBeenCalledTimes(1)
    // Redirect to the Discord authorize URL.
    expect(res.headers.get("location")).toContain("discord.com/oauth2/authorize")
  })

  it("blocks and redirects with an error when the rate limit is exceeded (URL not built)", async () => {
    mockConsume.mockResolvedValue({ ok: false, retryAfterSec: 120 })

    const res = await GET(makeRequest())

    expect(mockCreateUrl).not.toHaveBeenCalled()
    expect(res.status).toBe(307)
    const location = res.headers.get("location") ?? ""
    expect(location).toContain("error=")
    // Points back to the app root, not to Discord.
    expect(location).not.toContain("discord.com")
  })
})
