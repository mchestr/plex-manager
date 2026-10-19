/**
 * @jest-environment node
 */

import { isConnectionTestBypassed } from "@/lib/connections/connection-test"
import { createPin, readPin } from "@/lib/connections/plex-pin"

jest.mock("@/lib/connections/connection-test", () => ({ isConnectionTestBypassed: jest.fn(() => false) }))

const mockFetch = jest.fn()
const BROWSER_ID = "6f1c2a7e-3b4d-4c5e-8f90-1a2b3c4d5e6f"

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function sentRequest(): { url: URL; init: RequestInit; headers: Record<string, string> } {
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  return { url: new URL(url), init, headers: init.headers as Record<string, string> }
}

describe("plex.tv PIN calls", () => {
  const originalFetch = global.fetch

  beforeAll(() => {
    global.fetch = mockFetch as unknown as typeof fetch
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  beforeEach(() => {
    mockFetch.mockReset()
    jest.mocked(isConnectionTestBypassed).mockReturnValue(false)
  })

  describe("createPin", () => {
    it("creates a strong PIN with the browser's client identifier", async () => {
      mockFetch.mockResolvedValue(json({ id: 42, code: "abcd1234", authToken: null }))

      await expect(createPin(BROWSER_ID)).resolves.toEqual({ ok: true, data: { id: 42, code: "abcd1234" } })

      const { url, init, headers } = sentRequest()
      expect(init.method).toBe("POST")
      expect(`${url.origin}${url.pathname}`).toBe("https://plex.tv/api/v2/pins")
      expect(url.searchParams.get("strong")).toBe("true")
      expect(headers["X-Plex-Client-Identifier"]).toBe(BROWSER_ID)
      expect(headers["X-Plex-Product"]).toBe("Plex Manager")
    })

    it("returns the failure when plex.tv refuses", async () => {
      mockFetch.mockResolvedValue(json({}, 503))

      await expect(createPin(BROWSER_ID)).resolves.toEqual({ ok: false, code: "HTTP", status: 503 })
    })

    it("sends nothing under the connection test bypass", async () => {
      jest.mocked(isConnectionTestBypassed).mockReturnValue(true)

      const pin = await createPin(BROWSER_ID)

      expect(pin.ok).toBe(true)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe("readPin", () => {
    it("sends the PIN's code with the browser's identifier", async () => {
      mockFetch.mockResolvedValue(json({ id: 42, code: "abcd1234", authToken: null }))

      await expect(readPin(42, "abcd1234", BROWSER_ID)).resolves.toEqual({ status: "waiting" })

      const { url, headers } = sentRequest()
      expect(`${url.origin}${url.pathname}`).toBe("https://plex.tv/api/v2/pins/42")
      expect(url.searchParams.get("code")).toBe("abcd1234")
      expect(headers["X-Plex-Client-Identifier"]).toBe(BROWSER_ID)
    })

    it("is ready once plex.tv has issued the token", async () => {
      mockFetch.mockResolvedValue(json({ id: 42, code: "abcd1234", authToken: "account-token" }))

      await expect(readPin(42, "abcd1234", BROWSER_ID)).resolves.toEqual({
        status: "ready",
        authToken: "account-token",
      })
    })

    it("maps plex.tv's 404 for an expired PIN to expired", async () => {
      mockFetch.mockResolvedValue(json({ errors: [{ code: 1020 }] }, 404))

      await expect(readPin(42, "abcd1234", BROWSER_ID)).resolves.toEqual({ status: "expired" })
    })

    it.each([500, 429])("maps HTTP %d to unavailable", async (status) => {
      mockFetch.mockResolvedValue(json({}, status))

      await expect(readPin(42, "abcd1234", BROWSER_ID)).resolves.toEqual({ status: "unavailable" })
    })

    it("maps a network error to unavailable", async () => {
      mockFetch.mockRejectedValue(new TypeError("fetch failed"))

      await expect(readPin(42, "abcd1234", BROWSER_ID)).resolves.toEqual({ status: "unavailable" })
    })

    it("never becomes ready under the connection test bypass", async () => {
      jest.mocked(isConnectionTestBypassed).mockReturnValue(true)

      await expect(readPin(42, "abcd1234", BROWSER_ID)).resolves.toEqual({ status: "waiting" })
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
