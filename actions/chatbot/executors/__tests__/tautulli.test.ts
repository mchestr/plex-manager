/**
 * Tests for actions/chatbot/executors/tautulli.ts and the Discord tool gating
 * in actions/chatbot/tools.ts.
 *
 * Covers two Phase 0 bug fixes:
 * 1. get_tautulli_library_stats must invoke the stats client
 *    (getTautulliLibraryStats), NOT the names client (getTautulliLibraryNames).
 * 2. get_tautulli_users must be excluded from the Discord safe-tool set and
 *    never advertised in the generated Discord system prompt.
 *
 * It also covers the Discord activity scoping, which maps the caller to their
 * Tautulli user through the shared findTautulliUser lookup (P0.9) and fails
 * closed on every other path (P4.19, SEC-50), and the
 * three tools that used to call commands Tautulli does not have (P2.3, RWP-10).
 */

import { executeTautulliTool } from "../tautulli"
import {
  DISCORD_SAFE_TOOLS,
  generateDiscordSystemPrompt,
} from "@/actions/chatbot/tools"
import { DISCORD_SAFE_TOOL_NAMES } from "@/actions/chatbot/tools/registry"
import {
  findTautulliUser,
  getTautulliActivity,
  getTautulliHistory,
  getTautulliHomeStat,
  getTautulliLibraryNames,
  getTautulliLibraryStats,
  getTautulliUsers,
} from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock("@/lib/connections/tautulli", () => ({
  findTautulliUser: jest.fn(),
  getTautulliActivity: jest.fn(),
  getTautulliHistory: jest.fn(),
  getTautulliHomeStat: jest.fn(),
  getTautulliLibraryNames: jest.fn(),
  getTautulliLibraryStats: jest.fn(),
  getTautulliUsers: jest.fn(),
}))

jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  })),
}))

const mockGetTautulliLibraryNames = getTautulliLibraryNames as jest.MockedFunction<
  typeof getTautulliLibraryNames
>
const mockGetTautulliLibraryStats = getTautulliLibraryStats as jest.MockedFunction<
  typeof getTautulliLibraryStats
>
const mockTautulliFindFirst = prisma.tautulli.findFirst as jest.MockedFunction<
  typeof prisma.tautulli.findFirst
>
const mockFindTautulliUser = findTautulliUser as jest.MockedFunction<typeof findTautulliUser>
const mockGetTautulliActivity = getTautulliActivity as jest.MockedFunction<typeof getTautulliActivity>
const mockUserFindUnique = prisma.user.findUnique as jest.Mock

describe("executeTautulliTool - library stats routing", () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockTautulliFindFirst.mockResolvedValue({
      id: "tautulli-1",
      name: "Tautulli",
      url: "http://localhost:8181",
      apiKey: "test-key",
      publicUrl: null,
      isActive: true,
    } as never)
  })

  it("routes get_tautulli_library_stats to the stats client, not the names client", async () => {
    mockGetTautulliLibraryStats.mockResolvedValue({
      success: true,
      data: { response: { data: { data: [{ section_name: "Movies", count: 100 }] } } },
    })

    const result = await executeTautulliTool("get_tautulli_library_stats", {})

    expect(mockGetTautulliLibraryStats).toHaveBeenCalledTimes(1)
    expect(mockGetTautulliLibraryNames).not.toHaveBeenCalled()
    expect(result).toContain("count")
  })

  it("routes get_tautulli_library_names to the names client, not the stats client", async () => {
    mockGetTautulliLibraryNames.mockResolvedValue({
      success: true,
      data: { response: { data: [{ section_name: "Movies" }] } },
    })

    const result = await executeTautulliTool("get_tautulli_library_names", {})

    expect(mockGetTautulliLibraryNames).toHaveBeenCalledTimes(1)
    expect(mockGetTautulliLibraryStats).not.toHaveBeenCalled()
    expect(result).toContain("section_name")
  })

  it("returns different shapes for library_stats vs library_names", async () => {
    const statsData = {
      response: { data: { data: [{ section_name: "Movies", count: 100, parent_count: 0, child_count: 0 }] } },
    }
    const namesData = {
      response: { data: [{ section_name: "Movies", section_id: 1 }] },
    }

    mockGetTautulliLibraryStats.mockResolvedValue({ success: true, data: statsData })
    mockGetTautulliLibraryNames.mockResolvedValue({ success: true, data: namesData })

    const statsResult = await executeTautulliTool("get_tautulli_library_stats", {})
    const namesResult = await executeTautulliTool("get_tautulli_library_names", {})

    expect(statsResult).not.toEqual(namesResult)
    expect(statsResult).toBe(JSON.stringify(statsData))
    expect(namesResult).toBe(JSON.stringify(namesData))
  })

  it("propagates the stats client error for get_tautulli_library_stats", async () => {
    mockGetTautulliLibraryStats.mockResolvedValue({
      success: false,
      error: "Tautulli library stats error: Bad Gateway",
    })

    const result = await executeTautulliTool("get_tautulli_library_stats", {})

    expect(mockGetTautulliLibraryStats).toHaveBeenCalledTimes(1)
    expect(mockGetTautulliLibraryNames).not.toHaveBeenCalled()
    expect(result).toBe(JSON.stringify({ error: "Tautulli library stats error: Bad Gateway" }))
  })
})

describe("executeTautulliTool - Discord activity scoping", () => {
  const UNMAPPED = { session_count: 0, sessions: [], scope: "unmapped" }

  // get_activity's `data`, as getTautulliActivity returns it
  const activity = {
    stream_count: "2",
    sessions: [
      { user_id: 501, title: "Mine" },
      { user_id: 502, title: "Someone else's" },
    ],
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockTautulliFindFirst.mockResolvedValue({
      id: "tautulli-1",
      name: "Tautulli",
      url: "http://localhost:8181",
      apiKey: "test-key",
      publicUrl: null,
      isActive: true,
    } as never)
    mockGetTautulliActivity.mockResolvedValue({ success: true, data: activity })
    mockUserFindUnique.mockResolvedValue({ plexUserId: "501" })
  })

  it("maps the caller through the shared lookup and keeps only their sessions", async () => {
    mockFindTautulliUser.mockResolvedValue({ ok: true, user: { user_id: 501, username: "lena_plex" } })

    const result = JSON.parse(
      await executeTautulliTool("get_tautulli_activity", {}, "user-1", "discord")
    )

    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { plexUserId: true },
    })
    expect(mockFindTautulliUser).toHaveBeenCalledWith(
      expect.objectContaining({ url: "http://localhost:8181", apiKey: "test-key" }),
      { plexUserId: "501" }
    )
    expect(result).toEqual({
      session_count: 1,
      sessions: [{ user_id: 501, title: "Mine" }],
      scope: "caller",
    })
  })

  it("returns no sessions when the matched user is not streaming", async () => {
    mockFindTautulliUser.mockResolvedValue({ ok: true, user: { user_id: 503, username: "lena_plex" } })

    const result = JSON.parse(
      await executeTautulliTool("get_tautulli_activity", {}, "user-1", "discord")
    )

    expect(result).toEqual({ session_count: 0, sessions: [], scope: "caller" })
  })

  it.each([
    ["the lookup finds no Tautulli user", { ok: false, code: "TAUTULLI_USER_NOT_FOUND", candidates: 2 }],
    ["the lookup fails or times out", { ok: false, code: "TAUTULLI_ERROR" }],
  ])("returns no sessions when %s", async (_case, lookup) => {
    mockFindTautulliUser.mockResolvedValue(lookup as never)

    const result = JSON.parse(
      await executeTautulliTool("get_tautulli_activity", {}, "user-1", "discord")
    )

    expect(result).toEqual(UNMAPPED)
  })

  it("returns no sessions to a caller without a Plex user ID", async () => {
    mockUserFindUnique.mockResolvedValue({ plexUserId: null })

    const result = JSON.parse(
      await executeTautulliTool("get_tautulli_activity", {}, "user-1", "discord")
    )

    expect(mockFindTautulliUser).not.toHaveBeenCalled()
    expect(result).toEqual(UNMAPPED)
  })

  it("returns no sessions when there is no caller at all", async () => {
    const result = JSON.parse(await executeTautulliTool("get_tautulli_activity", {}, undefined, "discord"))

    expect(mockUserFindUnique).not.toHaveBeenCalled()
    expect(result).toEqual(UNMAPPED)
  })

  it.each([
    ["sessions is a single object", { stream_count: "1", sessions: { user_id: 501, title: "Mine" } }],
    ["sessions is missing", { stream_count: "2" }],
    ["a session has no user_id", { sessions: [{ user_id: 501, title: "Mine" }, { title: "Someone else's" }] }],
    ["the payload is not an object", "<html>Bad Gateway</html>"],
    ["the payload is null", null],
  ])("returns no sessions when %s", async (_case, data) => {
    mockFindTautulliUser.mockResolvedValue({ ok: true, user: { user_id: 501, username: "lena_plex" } })
    mockGetTautulliActivity.mockResolvedValue({ success: true, data })

    const result = JSON.parse(
      await executeTautulliTool("get_tautulli_activity", {}, "user-1", "discord")
    )

    expect(result).toEqual(UNMAPPED)
  })

  it("never returns the unfiltered activity in the Discord context", async () => {
    mockFindTautulliUser.mockResolvedValue({ ok: false, code: "TAUTULLI_ERROR" })

    const output = await executeTautulliTool("get_tautulli_activity", {}, "user-1", "discord")

    expect(output).not.toContain("Someone else's")
    expect(output).not.toContain("stream_count")
  })

  it("returns the full activity outside the Discord context", async () => {
    const result = JSON.parse(await executeTautulliTool("get_tautulli_activity", {}, "user-1", "admin"))

    expect(result).toEqual(activity)
  })

  it("does not look the caller up outside the Discord context", async () => {
    await executeTautulliTool("get_tautulli_activity", {}, "user-1", "admin")

    expect(mockFindTautulliUser).not.toHaveBeenCalled()
  })
})

describe("executeTautulliTool - tools built on real Tautulli commands", () => {
  const mockGetTautulliHomeStat = getTautulliHomeStat as jest.MockedFunction<typeof getTautulliHomeStat>
  const mockGetTautulliHistory = getTautulliHistory as jest.MockedFunction<typeof getTautulliHistory>

  beforeEach(() => {
    jest.clearAllMocks()
    mockTautulliFindFirst.mockResolvedValue({
      id: "tautulli-1",
      name: "Tautulli",
      url: "http://localhost:8181",
      apiKey: "test-key",
      publicUrl: null,
      isActive: true,
    } as never)
    mockGetTautulliHomeStat.mockImplementation(async (_config, statId) => ({
      success: true,
      data: { stat_id: statId, rows: [] },
    }))
    mockGetTautulliHistory.mockResolvedValue({ success: true, data: { data: [] } })
  })

  it("get_tautulli_most_watched reads get_home_stats with stat_id top_movies and top_tv", async () => {
    const result = JSON.parse(await executeTautulliTool("get_tautulli_most_watched", { limit: 5 }))

    expect(mockGetTautulliHomeStat).toHaveBeenCalledTimes(2)
    expect(mockGetTautulliHomeStat).toHaveBeenCalledWith(expect.anything(), "top_movies", 5)
    expect(mockGetTautulliHomeStat).toHaveBeenCalledWith(expect.anything(), "top_tv", 5)
    expect(result).toEqual({
      top_movies: { stat_id: "top_movies", rows: [] },
      top_tv: { stat_id: "top_tv", rows: [] },
    })
  })

  it("get_tautulli_top_users reads get_home_stats with stat_id top_users, by duration", async () => {
    await executeTautulliTool("get_tautulli_top_users", {})

    expect(mockGetTautulliHomeStat).toHaveBeenCalledTimes(1)
    expect(mockGetTautulliHomeStat).toHaveBeenCalledWith(expect.anything(), "top_users", 10, "duration")
  })

  it("get_tautulli_recently_watched reads get_history, newest first", async () => {
    await executeTautulliTool("get_tautulli_recently_watched", { limit: 7 })

    expect(mockGetTautulliHistory).toHaveBeenCalledWith(expect.anything(), undefined, 7)
    expect(mockGetTautulliHomeStat).not.toHaveBeenCalled()
  })

  it("returns the client's fixed error message when a call fails", async () => {
    mockGetTautulliHomeStat.mockResolvedValue({ success: false, error: "Tautulli reported an error" })

    const result = JSON.parse(await executeTautulliTool("get_tautulli_top_users", {}))

    expect(result).toEqual({ error: "Tautulli reported an error" })
  })
})

describe("Discord tool gating - get_tautulli_users", () => {
  it("excludes get_tautulli_users from the Discord safe-tool set", () => {
    expect(DISCORD_SAFE_TOOL_NAMES.has("get_tautulli_users")).toBe(false)
    expect(DISCORD_SAFE_TOOLS.map((tool) => tool.function.name)).not.toContain(
      "get_tautulli_users"
    )
  })

  it("does not advertise get_tautulli_users in the generated Discord system prompt", () => {
    const prompt = generateDiscordSystemPrompt(DISCORD_SAFE_TOOLS)

    expect(prompt).not.toContain("get_tautulli_users")
  })
})

describe("admin context drops emails, addresses and tokens (P4.15, SEC-42)", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockTautulliFindFirst.mockResolvedValue({
      id: "tautulli-1",
      name: "Tautulli",
      url: "http://localhost:8181",
      apiKey: "test-key",
      publicUrl: null,
      isActive: true,
    } as never)
  })

  const PERSONAL = /email|ip_address|server_token|example\.com|203\.0\.113/

  it("get_tautulli_users keeps names and ids only", async () => {
    jest.mocked(getTautulliUsers).mockResolvedValue({
      success: true,
      data: [{ user_id: 7, friendly_name: "Sam", email: "sam@example.com", server_token: "tok" }],
    })

    const result = await executeTautulliTool("get_tautulli_users", {})

    expect(result).not.toMatch(PERSONAL)
    expect(JSON.parse(result)).toEqual([{ user_id: 7, friendly_name: "Sam" }])
  })

  it("get_tautulli_activity drops each session's addresses", async () => {
    mockGetTautulliActivity.mockResolvedValue({
      success: true,
      data: {
        stream_count: "1",
        sessions: [
          { user_id: 7, title: "Heat", ip_address: "203.0.113.7", ip_address_public: "203.0.113.8", email: "sam@example.com" },
        ],
      },
    })

    const result = await executeTautulliTool("get_tautulli_activity", {})

    expect(result).not.toMatch(PERSONAL)
    expect(JSON.parse(result)).toEqual({ stream_count: "1", sessions: [{ user_id: 7, title: "Heat" }] })
  })

  it("the history tools drop each row's address", async () => {
    jest.mocked(getTautulliHistory).mockResolvedValue({
      success: true,
      data: { data: [{ title: "Heat", user: "Sam", ip_address: "203.0.113.7" }] },
    })

    for (const tool of ["get_tautulli_watch_history", "get_tautulli_recently_watched"]) {
      const result = await executeTautulliTool(tool, {})
      expect(result).not.toMatch(PERSONAL)
      expect(JSON.parse(result)).toEqual({ data: [{ title: "Heat", user: "Sam" }] })
    }
  })
})
