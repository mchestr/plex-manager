/**
 * @jest-environment node
 */

/**
 * Requests are filed as the member's own Overseerr user (P4.13, SEC-27): the
 * POST carries `X-Api-User` beside the API key, so Overseerr applies that
 * user's permissions and quotas and lists them as the requester. The user id
 * is required by the type, so there is no fallback to the API key's admin.
 * The responses are recorded Overseerr replies (trimmed).
 */

import { submitOverseerrRequest } from "@/lib/connections/overseerr"

import movieUnrequested from "./fixtures/overseerr-movie-603-unrequested.json"
import requestCreated from "./fixtures/overseerr-request-created.json"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const config = { url: "http://overseerr.local:5055", apiKey: "overseerr-key" }
const payload = { mediaType: "movie" as const, mediaId: 603 }
const mockFetch = jest.fn()

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockImplementation(async (_url: string, init: RequestInit) =>
    init.method === "POST" ? json(requestCreated, 201) : json(movieUnrequested)
  )
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("submitOverseerrRequest as the member", () => {
  it("posts with X-Api-User for the member and the API key", async () => {
    const result = await submitOverseerrRequest(config, payload, { overseerrUserId: 7 })

    expect(result).toEqual({ success: true, requestId: 412, status: "created" })
    const post = mockFetch.mock.calls.find(([, init]) => init.method === "POST")
    expect(post?.[0]).toBe("http://overseerr.local:5055/api/v1/request")
    expect(post?.[1].headers).toMatchObject({ "X-Api-User": "7", "X-Api-Key": "overseerr-key" })
    expect(JSON.parse(post?.[1].body)).toEqual({ mediaType: "movie", mediaId: 603 })
  })

  it("reads the media status with the API key alone", async () => {
    await submitOverseerrRequest(config, payload, { overseerrUserId: 7 })

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe("http://overseerr.local:5055/api/v1/movie/603")
    expect(init.headers).not.toHaveProperty("X-Api-User")
  })

  it("requires the member's Overseerr user id", () => {
    // Compiled, never called: the checks are the two type errors
    const callsWithoutTheMember = () => [
      // @ts-expect-error -- the third argument is required: no request goes out as the admin
      submitOverseerrRequest(config, payload),
      // @ts-expect-error -- and it must carry the user id
      submitOverseerrRequest(config, payload, {}),
    ]
    expect(callsWithoutTheMember).toEqual(expect.any(Function))
  })
})
