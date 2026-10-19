/**
 * @jest-environment node
 */

/**
 * Tests for the Plex library source (P2.4: BP-24, FR-44).
 */

import { fetchSectionItems, listSections } from "@/lib/wrapped/sources/plex-library"
import { directLimiter } from "@/lib/wrapped/sources/watch-history-source"

import sectionPage from "./fixtures/plex-section-page.json"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const config = { url: "http://plex.local:32400", token: "plex-token-secret" }
const ctx = { limiter: directLimiter }
const mockFetch = jest.fn()

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const headersOf = (call: number) => mockFetch.mock.calls[call][1].headers as Record<string, string>

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("fetchSectionItems", () => {
  it("pages with the container headers and never puts the token in a URL", async () => {
    const items = sectionPage.MediaContainer.Metadata
    const pageOf = (rows: unknown[]) => ({ MediaContainer: { ...sectionPage.MediaContainer, size: rows.length, totalSize: 1003, Metadata: rows } })
    const full = Array.from({ length: 500 }, (_, i) => ({ ...items[0], ratingKey: String(80000 + i) }))
    mockFetch
      .mockResolvedValueOnce(json(pageOf(full)))
      .mockResolvedValueOnce(json(pageOf(full)))
      .mockResolvedValueOnce(json(pageOf(items)))

    const result = await fetchSectionItems(config, "1", ctx)

    expect(result.ok && result.data).toHaveLength(1003)
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect([0, 1, 2].map((call) => headersOf(call)["X-Plex-Container-Start"])).toEqual(["0", "500", "1000"])
    for (const call of [0, 1, 2]) {
      expect(headersOf(call)).toMatchObject({ "X-Plex-Container-Size": "500", "X-Plex-Token": "plex-token-secret" })
      const url = String(mockFetch.mock.calls[call][0])
      expect(url).toBe("http://plex.local:32400/library/sections/1/all?includeGuids=1")
      expect(url).not.toContain("plex-token-secret")
    }
  })

  it("gives every item its content rating and section, and no file sizes", async () => {
    mockFetch.mockResolvedValueOnce(json(sectionPage))

    const result = await fetchSectionItems(config, "1", ctx)

    if (!result.ok) throw new Error(result.code)
    expect(result.data[0]).toEqual({
      ratingKey: "60001",
      type: "movie",
      title: "Synthetic Film 1",
      year: 2021,
      addedAt: 1700000001000,
      contentRating: "PG-13",
      librarySectionId: "1",
      genres: ["Science Fiction", "Adventure"],
      directors: ["Director 1"],
      actors: Array.from({ length: 10 }, (_, n) => `Actor ${n}`),
      guids: ["imdb://tt0000001", "tmdb://1001"],
    })
    expect(result.data.map((item) => [item.contentRating, item.librarySectionId])).toEqual([
      ["PG-13", "1"],
      ["R", "1"],
      [null, "1"],
    ])
    expect(JSON.stringify(result.data)).not.toMatch(/size|Part|file\.mkv/)
  })
})

describe("listSections", () => {
  it("lists the sections with the token in a header", async () => {
    mockFetch.mockResolvedValueOnce(
      json({ MediaContainer: { size: 2, Directory: [{ key: "1", type: "movie", title: "Films", agent: "tv.plex.agents.movie" }, { key: 2, type: "show", title: "TV" }] } })
    )

    const result = await listSections(config, ctx)

    expect(result).toEqual({
      ok: true,
      data: [
        { key: "1", type: "movie", title: "Films" },
        { key: "2", type: "show", title: "TV" },
      ],
    })
    expect(String(mockFetch.mock.calls[0][0])).toBe("http://plex.local:32400/library/sections")
    expect(headersOf(0)["X-Plex-Token"]).toBe("plex-token-secret")
  })
})
