/**
 * Plex's refresh of one item's details and scan of one library folder: the
 * method, the path, the owner token, and digits-only keys.
 */

import { refreshPlexItem, scanPlexFolder } from "@/lib/connections/plex-library-actions"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const SERVER = { url: "http://plex.local:32400", token: "owner-token" }
const mockFetch = jest.fn()
const respond = (status: number) => ({ ok: status >= 200 && status < 300, status, text: async () => "" })

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("refreshPlexItem", () => {
  it("puts a refresh for the item with the owner token", async () => {
    mockFetch.mockResolvedValue(respond(200))

    expect(await refreshPlexItem(SERVER, "5114")).toBe(true)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe("http://plex.local:32400/library/metadata/5114/refresh")
    expect(init.method).toBe("PUT")
    expect(init.headers).toEqual(expect.objectContaining({ "X-Plex-Token": "owner-token" }))
  })

  it("is false when Plex refuses, and sends nothing for a key that isn't digits", async () => {
    mockFetch.mockResolvedValue(respond(500))
    expect(await refreshPlexItem(SERVER, "5114")).toBe(false)

    mockFetch.mockClear()
    expect(await refreshPlexItem(SERVER, "5114/../1")).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe("scanPlexFolder", () => {
  it("scans one folder of the section", async () => {
    mockFetch.mockResolvedValue(respond(200))

    expect(await scanPlexFolder(SERVER, "2", "/tv/The Office")).toBe(true)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe("http://plex.local:32400/library/sections/2/refresh?path=%2Ftv%2FThe%20Office")
    expect(init.method).toBe("GET")
  })

  it("sends nothing for a section that isn't digits or an empty folder", async () => {
    expect(await scanPlexFolder(SERVER, "2a", "/tv")).toBe(false)
    expect(await scanPlexFolder(SERVER, "2", " ")).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
