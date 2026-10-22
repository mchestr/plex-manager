/**
 * @jest-environment node
 */

/**
 * `revokeDiscordToken` (P11.13, GAP-31): one form-encoded POST to Discord's
 * revoke endpoint with the app's credentials, and a refusal throws without
 * Discord's body.
 */

import { revokeDiscordToken } from "@/lib/discord/api"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const fetchMock = jest.fn()

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock
})

const params = { clientId: "client-1", clientSecret: "secret-1", token: "refresh-1", tokenTypeHint: "refresh_token" as const }

describe("revokeDiscordToken", () => {
  it("posts the token and the app credentials, form encoded", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))

    await expect(revokeDiscordToken(params)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://discord.com/api/oauth2/token/revoke")
    expect(init.method).toBe("POST")
    expect(init.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" })
    const body = new URLSearchParams(init.body as URLSearchParams)
    expect(Object.fromEntries(body)).toEqual({
      client_id: "client-1",
      client_secret: "secret-1",
      token: "refresh-1",
      token_type_hint: "refresh_token",
    })
  })

  it("throws fixed copy when Discord refuses", async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"invalid_client"}', { status: 401 }))

    await expect(revokeDiscordToken(params)).rejects.toThrow("Unable to revoke the Discord grant")
  })
})
