/**
 * The Plex reads around a swap: whether the item is playing, whether Plex
 * empties its trash, and the item a section holds for a guid.
 */

import { findPlexItemByGuid, isPlexItemPlaying, plexEmptiesTrash } from "@/lib/connections/plex-file-state"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const SERVER = { url: "http://plex.local:32400", token: "owner-token" }
const mockFetch = jest.fn()
const respond = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body, body: { cancel: async () => undefined } })

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("isPlexItemPlaying", () => {
  it("is true while a session plays the item, and false otherwise", async () => {
    mockFetch.mockResolvedValue(respond(200, { MediaContainer: { size: 2, Metadata: [{ ratingKey: "7001" }, { ratingKey: 555 }] } }))

    expect(await isPlexItemPlaying(SERVER, "555")).toBe(true)
    expect(await isPlexItemPlaying(SERVER, "556")).toBe(false)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe("http://plex.local:32400/status/sessions")
    expect(init.headers["X-Plex-Token"]).toBe("owner-token")
  })

  it("counts only the viewer's own sessions when asked about one member", async () => {
    const sessions = { MediaContainer: { size: 2, Metadata: [{ ratingKey: "555", User: { id: "42" } }, { ratingKey: "556", User: { id: 1 } }] } }
    mockFetch.mockResolvedValue(respond(200, sessions))

    expect(await isPlexItemPlaying(SERVER, "555", { plexUserId: "42", isOwner: false })).toBe(true)
    expect(await isPlexItemPlaying(SERVER, "555", { plexUserId: "43", isOwner: false })).toBe(false)
    // Plex reports the owner's own sessions as user 1
    expect(await isPlexItemPlaying(SERVER, "556", { plexUserId: "9000", isOwner: true })).toBe(true)
  })

  it("is false with no sessions, and null when Plex can't be read", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, { MediaContainer: { size: 0 } })).mockResolvedValueOnce(respond(500))

    expect(await isPlexItemPlaying(SERVER, "555")).toBe(false)
    expect(await isPlexItemPlaying(SERVER, "555")).toBeNull()
  })
})

describe("plexEmptiesTrash", () => {
  it("reads the autoEmptyTrash preference", async () => {
    mockFetch
      .mockResolvedValueOnce(respond(200, { MediaContainer: { Setting: [{ id: "FriendlyName", value: "Home" }, { id: "autoEmptyTrash", value: true }] } }))
      .mockResolvedValueOnce(respond(200, { MediaContainer: { Setting: [{ id: "autoEmptyTrash", value: false }] } }))
      .mockResolvedValueOnce(respond(200, { MediaContainer: { Setting: [] } }))

    expect(await plexEmptiesTrash(SERVER)).toBe(true)
    expect(await plexEmptiesTrash(SERVER)).toBe(false)
    expect(await plexEmptiesTrash(SERVER)).toBeNull()
    expect(mockFetch.mock.calls[0][0]).toBe("http://plex.local:32400/:/prefs")
  })
})

describe("findPlexItemByGuid", () => {
  it("finds the section's item for a guid", async () => {
    mockFetch.mockResolvedValue(respond(200, { MediaContainer: { Metadata: [{ ratingKey: "9001", title: "Heat" }] } }))

    expect(await findPlexItemByGuid(SERVER, "1", "plex://movie/heat")).toEqual({ status: "found", ratingKey: "9001" })
    expect(mockFetch.mock.calls[0][0]).toBe("http://plex.local:32400/library/sections/1/all?guid=plex%3A%2F%2Fmovie%2Fheat")
  })

  it("is missing with no match, and unknown for a section that isn't digits or Plex down", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, { MediaContainer: { size: 0 } })).mockResolvedValueOnce(respond(500))

    expect(await findPlexItemByGuid(SERVER, "1", "plex://movie/heat")).toEqual({ status: "missing" })
    expect(await findPlexItemByGuid(SERVER, "1", "plex://movie/heat")).toEqual({ status: "unknown" })
    expect(await findPlexItemByGuid(SERVER, "../1", "plex://movie/heat")).toEqual({ status: "unknown" })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
