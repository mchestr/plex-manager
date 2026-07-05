/**
 * Step 19 / Part B — OAuth link rate limiting on the connect route.
 *
 * The connect route (app/(app)/discord/connect/route.ts) must, after the session
 * check and before creating an auth URL/state, enforce a per-user rate limit so a
 * user can't spam link attempts (each of which writes an OAuthState row). On the
 * N+1th attempt it returns a friendly redirect instead of building the URL.
 */

import { GET } from "@/app/(app)/discord/connect/route"
import { getServerSession } from "next-auth"
import { createDiscordAuthorizationUrl } from "@/lib/discord/integration"
import { checkRateLimit } from "@/lib/security/rate-limit"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/discord/integration", () => ({
  createDiscordAuthorizationUrl: jest.fn(),
}))
jest.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: jest.fn(),
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockCreateUrl = createDiscordAuthorizationUrl as jest.MockedFunction<
  typeof createDiscordAuthorizationUrl
>
const mockCheckRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>

function makeRequest(url = "http://localhost:3000/discord/connect") {
  return { url, nextUrl: new URL(url) } as never
}

describe("discord connect route rate limiting", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } } as never)
    mockCreateUrl.mockResolvedValue({ url: "https://discord.com/oauth2/authorize?x=1", state: "s" })
  })

  it("redirects to home when unauthenticated (no rate-limit / URL work)", async () => {
    mockGetServerSession.mockResolvedValue(null)

    const res = await GET(makeRequest())

    expect(res.status).toBe(307)
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(mockCreateUrl).not.toHaveBeenCalled()
  })

  it("checks the per-user rate limit keyed by discord-link:<userId> and proceeds when allowed", async () => {
    mockCheckRateLimit.mockReturnValue(true)

    const res = await GET(makeRequest())

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "discord-link:user-1",
      expect.objectContaining({ windowMs: expect.any(Number), max: expect.any(Number) })
    )
    expect(mockCreateUrl).toHaveBeenCalledTimes(1)
    // Redirect to the Discord authorize URL.
    expect(res.headers.get("location")).toContain("discord.com/oauth2/authorize")
  })

  it("blocks and redirects with an error when the rate limit is exceeded (URL not built)", async () => {
    mockCheckRateLimit.mockReturnValue(false)

    const res = await GET(makeRequest())

    expect(mockCreateUrl).not.toHaveBeenCalled()
    expect(res.status).toBe(307)
    const location = res.headers.get("location") ?? ""
    expect(location).toContain("error=")
    // Points back to the app root, not to Discord.
    expect(location).not.toContain("discord.com")
  })
})
