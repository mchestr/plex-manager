/**
 * @jest-environment node
 */

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))

import { renameChannel } from "../rename"

const fetchMock = jest.spyOn(globalThis, "fetch")

const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers }))

afterEach(() => fetchMock.mockReset())

describe("renameChannel", () => {
  it("PATCHes the channel with the bot token", async () => {
    reply(200)
    await expect(renameChannel("tok", "123", "Movies: 5")).resolves.toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe("https://discord.com/api/v10/channels/123")
    expect(init).toMatchObject({ method: "PATCH", body: JSON.stringify({ name: "Movies: 5" }) })
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bot tok")
  })

  it("reports a 429 with its retry time, without waiting", async () => {
    reply(429, { retry_after: 312.5, global: false })
    await expect(renameChannel("tok", "123", "x")).resolves.toEqual({ ok: false, code: "RATE_LIMITED", retryAfterSec: 312.5, global: false })
  })

  it("flags a global 429", async () => {
    reply(429, { retry_after: 2, global: true })
    await expect(renameChannel("tok", "123", "x")).resolves.toMatchObject({ code: "RATE_LIMITED", global: true })
  })

  it("maps the other failures", async () => {
    reply(403)
    reply(404)
    reply(500)
    fetchMock.mockRejectedValueOnce(new Error("boom"))
    await expect(renameChannel("t", "1", "x")).resolves.toEqual({ ok: false, code: "FORBIDDEN" })
    await expect(renameChannel("t", "1", "x")).resolves.toEqual({ ok: false, code: "NOT_FOUND" })
    await expect(renameChannel("t", "1", "x")).resolves.toEqual({ ok: false, code: "FAILED" })
    await expect(renameChannel("t", "1", "x")).resolves.toEqual({ ok: false, code: "FAILED" })
  })
})
