/**
 * @jest-environment node
 */

/**
 * `validatePlexToken` (GAP-05): only a 401 says the member's token is
 * invalid. A 503, a 429 or a network error is "unreachable", which the sync
 * records as a retry, never as "token expired".
 */

import { validatePlexToken } from "@/lib/watchlist/plex-watchlist"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

const originalEnv = process.env

beforeEach(() => {
  process.env = { ...originalEnv, PLEX_CLIENT_IDENTIFIER: "plex-manager-test" }
})

afterEach(() => {
  process.env = originalEnv
  jest.restoreAllMocks()
})

function respondWith(status: number, headers: Record<string, string> = {}) {
  return jest.spyOn(global, "fetch").mockResolvedValue(new Response(status === 204 ? null : "{}", { status, headers }))
}

describe("validatePlexToken", () => {
  it("is valid on a 200, sending the token as a header", async () => {
    const fetchSpy = respondWith(200)

    await expect(validatePlexToken("member-token")).resolves.toBe("valid")
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toBe("https://plex.tv/api/v2/user")
    expect((init?.headers as Record<string, string>)["X-Plex-Token"]).toBe("member-token")
  })

  it("is invalid only on a 401", async () => {
    respondWith(401)

    await expect(validatePlexToken("member-token")).resolves.toBe("invalid")
  })

  it.each([
    ["a 503", 503],
    ["a 429", 429],
    ["a 500", 500],
  ])("is unreachable on %s, never invalid", async (_label, status) => {
    respondWith(status, status === 429 ? { "Retry-After": "30" } : {})

    await expect(validatePlexToken("member-token")).resolves.toBe("unreachable")
  })

  it("is unreachable when the request fails", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new TypeError("fetch failed"))

    await expect(validatePlexToken("member-token")).resolves.toBe("unreachable")
  })
})
