/**
 * @jest-environment node
 */

/**
 * The Plex executor's Discord scoping of `get_plex_sessions` (GAP-08), on the
 * recorded PMS sessions in lib/connections/__tests__/fixtures/pms/: the
 * server owner's own stream is PMS user 1, so it matches the owner and no one
 * else.
 */

import { readFileSync } from "fs"
import path from "path"

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getPlexLibrarySections, getPlexOnDeck, getPlexRecentlyAdded, getPlexSessions } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"

import { executePlexTool } from "../plex"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/connections/plex", () => ({
  getPlexLibrarySections: jest.fn(),
  getPlexOnDeck: jest.fn(),
  getPlexRecentlyAdded: jest.fn(),
  getPlexServerIdentity: jest.fn(),
  getPlexSessions: jest.fn(),
}))
jest.mock("@/lib/connections/plex-config", () => ({ getActivePlexServerConfig: jest.fn() }))

const SESSIONS = JSON.parse(
  readFileSync(path.join(__dirname, "../../../../lib/connections/__tests__/fixtures/pms/sessions-owner.json"), "utf8")
)
const CONFIG = {
  name: "Home",
  url: "https://plex.example.com:32400",
  token: "owner-token",
  adminPlexUserId: "1000",
  machineIdentifier: "this-server-machine-id",
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(getActivePlexServerConfig).mockResolvedValue(CONFIG)
  jest.mocked(getPlexSessions).mockResolvedValue({ success: true, data: SESSIONS })
})

async function sessionTitlesFor(plexUserId: string): Promise<string[]> {
  prismaMock.user.findUnique.mockResolvedValue({ plexUserId, jellyfinUserId: null } as never)
  const result = JSON.parse(await executePlexTool("get_plex_sessions", {}, "user-1", "discord")) as {
    data: { sessions: { mediaTitle?: string }[] }
  }
  return result.data.sessions.map((session) => session.mediaTitle ?? "")
}

describe("executePlexTool get_plex_sessions in Discord", () => {
  it("gives the owner their own stream, reported as PMS user 1", async () => {
    await expect(sessionTitlesFor("1000")).resolves.toEqual(["Arrival"])
  })

  it("gives a member only their own stream, never the owner's", async () => {
    const titles = await sessionTitlesFor("1001")

    expect(titles).toHaveLength(1)
    expect(titles[0]).toContain("Severance")
  })
})

describe("executePlexTool get_plex_sessions for a Jellyfin-only member (P11.12)", () => {
  it("says the member is on Jellyfin instead of reporting no sessions", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ plexUserId: null, jellyfinUserId: "jf-1" } as never)

    const result = JSON.parse(await executePlexTool("get_plex_sessions", {}, "user-1", "discord"))

    expect(result).toEqual({ unavailable: "jellyfin-member" })
  })

  it("still scopes a member with both services to their Plex streams", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ plexUserId: "1001", jellyfinUserId: "jf-1" } as never)

    const result = JSON.parse(await executePlexTool("get_plex_sessions", {}, "user-1", "discord")) as {
      data: { sessions: unknown[] }
    }

    expect(result.data.sessions).toHaveLength(1)
  })
})

describe("executePlexTool get_plex_sessions in Discord without a caller", () => {
  it("returns no sessions rather than everyone's (fail closed)", async () => {
    const result = JSON.parse(await executePlexTool("get_plex_sessions", {}, undefined, "discord"))

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true, data: expect.objectContaining({ totalSessions: 0, sessions: [] }) })
  })
})

describe("executePlexTool get_plex_recently_added", () => {
  const RECENTLY_ADDED = JSON.parse(readFileSync(path.join(__dirname, "../../../../lib/connections/__tests__/fixtures/pms/recently-added.json"), "utf8"))

  it("passes the requested count through, from the newest", async () => {
    jest.mocked(getPlexRecentlyAdded).mockResolvedValue({ success: true, data: {} })

    await executePlexTool("get_plex_recently_added", { limit: 5 })

    expect(getPlexRecentlyAdded).toHaveBeenCalledWith(CONFIG, 5, 0)
  })

  it.each([
    [{ limit: 5000 }, 100, 0],
    [{ limit: "30" }, 30, 0],
    [{ limit: "many" }, 20, 0],
    [{}, 20, 0],
    [{ page: 3 }, 20, 40],
    [{ limit: 100, page: "2" }, 100, 100],
    [{ page: 0 }, 20, 0],
    [{ page: "last" }, 20, 0],
  ])("reads %j as %i items from the %ith newest", async (args, limit, start) => {
    jest.mocked(getPlexRecentlyAdded).mockResolvedValue({ success: true, data: {} })

    await executePlexTool("get_plex_recently_added", args)

    expect(getPlexRecentlyAdded).toHaveBeenCalledWith(CONFIG, limit, start)
  })

  it("keeps what each item is, where, and when it was added, in the turn's zone", async () => {
    jest.mocked(getPlexRecentlyAdded).mockResolvedValue({ success: true, data: RECENTLY_ADDED })

    // 1760000200 is 2025-10-09T08:56:40Z
    const result = JSON.parse(await executePlexTool("get_plex_recently_added", { limit: 2 }, "admin-1", "default", { timeZone: "America/Los_Angeles", locale: "en-US" }))

    expect(result).toEqual({
      showing: "showing the 2 newest items; pass page 2 for older items, or a larger limit (at most 100)",
      items: [
        { type: "movie", title: "Dune: Part Two", year: 2024, librarySectionTitle: "Movies", addedAt: "2025-10-09T01:56:40-07:00" },
        { type: "episode", title: "The Eightfold Fence", grandparentTitle: "Shogun", parentIndex: 1, index: 4, librarySectionTitle: "TV Shows", addedAt: "2025-10-09T01:55:00-07:00" },
      ],
    })
  })

  it("counts a later page from the newest when the server sends no total", async () => {
    jest.mocked(getPlexRecentlyAdded).mockResolvedValue({ success: true, data: RECENTLY_ADDED })

    expect(JSON.parse(await executePlexTool("get_plex_recently_added", { limit: 2, page: 4 })).showing).toBe(
      "showing items 7-8, newest first; pass page 5 for older items, or a larger limit (at most 100)"
    )
    expect(JSON.parse(await executePlexTool("get_plex_recently_added", { limit: 5, page: 2 })).showing).toBe("showing items 6-7, newest first")
  })

  it("gives the server's total when it sends one", async () => {
    jest.mocked(getPlexRecentlyAdded).mockResolvedValue({
      success: true,
      data: { MediaContainer: { ...RECENTLY_ADDED.MediaContainer, totalSize: 312, Metadata: [{ ...RECENTLY_ADDED.MediaContainer.Metadata[0], Media: [{ videoResolution: "4k" }] }] } },
    })

    const result = JSON.parse(await executePlexTool("get_plex_recently_added", { limit: 1 }))

    expect(result.showing).toBe("showing 1 of 312 items, newest first; pass page 2 for older items, or a larger limit (at most 100)")
    expect(result.total).toBe(312)
    expect(result.items[0].videoResolution).toBe("4K")
  })

  it("pages back to the oldest item, and says when a page is past it", async () => {
    const container = (count: number) => ({ MediaContainer: { totalSize: 312, Metadata: Array.from({ length: count }, (_, i) => ({ type: "movie", title: `Film ${i}` })) } })

    jest.mocked(getPlexRecentlyAdded).mockResolvedValue({ success: true, data: container(100) })
    expect(JSON.parse(await executePlexTool("get_plex_recently_added", { limit: 100, page: 2 })).showing).toBe(
      "showing 101-200 of 312 items, newest first; pass page 3 for older items"
    )

    jest.mocked(getPlexRecentlyAdded).mockResolvedValue({ success: true, data: container(12) })
    expect(JSON.parse(await executePlexTool("get_plex_recently_added", { limit: 100, page: 4 })).showing).toBe("showing 301-312 of 312 items, newest first")

    jest.mocked(getPlexRecentlyAdded).mockResolvedValue({ success: true, data: container(0) })
    expect(JSON.parse(await executePlexTool("get_plex_recently_added", { limit: 100, page: 9 }))).toEqual({ showing: "none on page 9; there are 312 items", total: 312, items: [] })
  })

  it("returns the client's error as an error", async () => {
    jest.mocked(getPlexRecentlyAdded).mockResolvedValue({ success: false, error: "Plex did not respond in time" })

    expect(JSON.parse(await executePlexTool("get_plex_recently_added", {}))).toEqual({ error: "Plex did not respond in time" })
  })
})

describe("executePlexTool get_plex_on_deck", () => {
  it("keeps what each item is, how far in the owner is and when they last watched", async () => {
    jest.mocked(getPlexOnDeck).mockResolvedValue({
      success: true,
      data: {
        MediaContainer: {
          size: 1,
          totalSize: 1,
          Metadata: [
            {
              ratingKey: "5310",
              key: "/library/metadata/5310",
              type: "episode",
              title: "In Perpetuity",
              grandparentTitle: "Severance",
              parentTitle: "Season 1",
              parentIndex: 1,
              index: 3,
              librarySectionTitle: "TV Shows",
              summary: "Mark is promoted.",
              duration: 2_700_000,
              viewOffset: 600_000,
              lastViewedAt: 1793590200,
              Media: [{ Part: [{ file: "/media/TV/Severance/S01E03.mkv" }] }],
            },
          ],
        },
      },
    })

    const result = JSON.parse(await executePlexTool("get_plex_on_deck", {}, "admin-1", "default", { timeZone: "America/Los_Angeles", locale: "en-US" }))

    expect(result).toEqual({
      showing: "showing 1 of 1 On Deck items",
      total: 1,
      items: [
        {
          type: "episode",
          title: "In Perpetuity",
          grandparentTitle: "Severance",
          parentTitle: "Season 1",
          parentIndex: 1,
          index: 3,
          librarySectionTitle: "TV Shows",
          lastViewedAt: "2026-11-01T19:30:00-08:00",
          progressPercent: 22,
        },
      ],
    })
  })

  it("reads one item sent on its own rather than in a list", async () => {
    jest.mocked(getPlexOnDeck).mockResolvedValue({ success: true, data: { MediaContainer: { size: 1, Metadata: { type: "movie", title: "Arrival", year: 2016 } } } })

    const result = JSON.parse(await executePlexTool("get_plex_on_deck", {}))

    expect(result).toEqual({ showing: "showing 1 On Deck items", items: [{ type: "movie", title: "Arrival", year: 2016 }] })
  })

  it("says when the owner has more On Deck than the page it reads", async () => {
    const episode = { type: "episode", title: "Pilot", grandparentTitle: "Severance" }
    jest.mocked(getPlexOnDeck).mockResolvedValue({ success: true, data: { MediaContainer: { size: 50, totalSize: 73, Metadata: Array(50).fill(episode) } } })

    const result = JSON.parse(await executePlexTool("get_plex_on_deck", {}))

    expect(result.showing).toBe("showing 50 of 73 On Deck items; the tool reads the first 50 only")
  })
})

describe("executePlexTool get_plex_library_sections (P11.17)", () => {
  it("gives each section's scan and change times in the turn's zone", async () => {
    // 1793590200 is 2026-11-02T03:30:00Z: 19:30 on 1 November in Los Angeles
    jest.mocked(getPlexLibrarySections).mockResolvedValue({ success: true, data: [{ title: "Movies", scannedAt: 1793590200, contentChangedAt: 1793590200 }] } as never)

    const result = JSON.parse(await executePlexTool("get_plex_library_sections", {}, "admin-1", "default", { timeZone: "America/Los_Angeles", locale: "en-US" }))

    expect(result).toEqual([{ title: "Movies", scannedAt: "2026-11-01T19:30:00-08:00", contentChangedAt: "2026-11-01T19:30:00-08:00" }])
  })
})

/**
 * A large server (3,000 movies, 1,500 series, 25 streams), from synthetic
 * items as heavy as the PMS sends them (summary, cast, crew, media parts with
 * file paths): each result, with default and largest arguments, stays under
 * the 40,000 characters the MCP endpoint accepts.
 */
describe("Plex tool results on a large server stay under the MCP limit", () => {
  const MCP_LIMIT = 40_000
  const LA = { timeZone: "America/Los_Angeles", locale: "en-US" }

  const heavyItem = (i: number) => ({
    ratingKey: String(600_000 + i),
    key: `/library/metadata/${600_000 + i}`,
    guid: `plex://episode/${"0".repeat(20)}${i}`,
    type: "episode",
    title: `An Episode Whose Title Goes On For Quite A While ${i}`,
    grandparentTitle: `A Series With An Unusually Long Name, Part ${i}`,
    parentTitle: "Season 7",
    parentIndex: 7,
    index: i,
    year: 2024,
    librarySectionTitle: "TV Shows (4K and HDR)",
    librarySectionID: 2,
    contentRating: "TV-MA",
    summary: "A summary of the episode. ".repeat(40),
    rating: 7.8,
    thumb: `/library/metadata/${600_000 + i}/thumb/1700000000`,
    art: `/library/metadata/${600_000 + i}/art/1700000000`,
    duration: 3_600_000,
    viewOffset: 1_200_000,
    lastViewedAt: 1_793_590_200 - i,
    addedAt: 1_793_590_200 - i * 60,
    updatedAt: 1_793_590_200,
    originallyAvailableAt: "2024-03-01",
    Media: [
      {
        videoResolution: "4k",
        videoCodec: "hevc",
        audioCodec: "truehd",
        bitrate: 25_000,
        Part: [{ key: `/library/parts/${i}/file.mkv`, file: `/media/TV/Series ${i}/Season 07/Series ${i} - S07E${i} - Remux-2160p.mkv`, size: 60_000_000_000 }],
      },
    ],
    Genre: [{ tag: "Drama" }, { tag: "Science Fiction" }],
    Director: [{ tag: "A Director With A Long Name" }],
    Writer: [{ tag: "A Writer" }, { tag: "Another Writer" }],
    Role: Array.from({ length: 30 }, (_, n) => ({ tag: `Actor With A Long Name ${n}`, role: `Character ${n}`, thumb: `https://metadata-static.plex.tv/${n}.jpg` })),
    Guid: [{ id: "imdb://tt0000001" }, { id: "tmdb://1" }, { id: "tvdb://1" }],
  })

  const page = (count: number, totalSize: number) => ({
    MediaContainer: { size: count, totalSize, Metadata: Array.from({ length: count }, (_, i) => heavyItem(i)) },
  })

  const rawSession = (i: number) => ({
    ...heavyItem(i),
    User: { id: String(1000 + i), title: `member.username.${i}`, thumb: "https://plex.tv/users/x/avatar" },
    Player: { address: `10.0.0.${i}`, device: "Android TV", platform: "Android", product: "Plex for Android (TV)", state: "playing", title: `Member ${i}'s TV` },
    Session: { id: `session-${i}`, bandwidth: 21_500, location: "wan" },
    TranscodeSession: { videoDecision: "transcode", audioDecision: "transcode", throttled: false, speed: 1.2 },
  })

  async function size(tool: string, args: Record<string, unknown> = {}): Promise<number> {
    const output = await executePlexTool(tool, args, "admin-1", "default", LA)
    expect(JSON.parse(output).error).toBeUndefined()
    return output.length
  }

  beforeEach(() => {
    // The PMS returns as many items as the container size asks for
    jest.mocked(getPlexRecentlyAdded).mockImplementation(async (_config, limit = 20) => ({ success: true, data: page(limit, 4500) }))
    jest.mocked(getPlexOnDeck).mockResolvedValue({ success: true, data: page(50, 50) })
    jest.mocked(getPlexSessions).mockResolvedValue({ success: true, data: { MediaContainer: { size: 25, Metadata: Array.from({ length: 25 }, (_, i) => rawSession(i)) } } })
  })

  it.each([
    ["get_plex_recently_added", {}],
    ["get_plex_recently_added", { limit: 100_000 }],
    ["get_plex_recently_added", { limit: 100_000, page: 45 }],
    ["get_plex_on_deck", {}],
    ["get_plex_sessions", {}],
  ])("%s %j", async (tool, args) => {
    expect(await size(tool, args)).toBeLessThanOrEqual(MCP_LIMIT)
  })

  it("lists 20 recently added by default and at most 100 a page, of the server's total, and pages back through the rest", async () => {
    const byDefault = JSON.parse(await executePlexTool("get_plex_recently_added", {}))
    const most = JSON.parse(await executePlexTool("get_plex_recently_added", { limit: 1000 }))
    const later = JSON.parse(await executePlexTool("get_plex_recently_added", { limit: 1000, page: 7 }))

    expect(byDefault.items).toHaveLength(20)
    expect(byDefault.showing).toBe("showing 20 of 4500 items, newest first; pass page 2 for older items, or a larger limit (at most 100)")
    // A page of 100 fits the reply whole, so paging skips no item
    expect(most.items).toHaveLength(100)
    expect(most.showing).toBe("showing 100 of 4500 items, newest first; pass page 2 for older items")
    expect(later.showing).toBe("showing 601-700 of 4500 items, newest first; pass page 8 for older items")
    expect(getPlexRecentlyAdded).toHaveBeenLastCalledWith(CONFIG, 100, 600)
  })
})
