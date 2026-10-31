/**
 * Tests for lib/chatbot/executors/tautulli.ts and the Discord tool gating
 * in lib/chatbot/tools.
 *
 * Covers two Phase 0 bug fixes:
 * 1. get_tautulli_library_stats must invoke the stats client
 *    (getTautulliLibraryStats), NOT the names client (getTautulliLibraryNames).
 * 2. get_tautulli_users must be excluded from the Discord safe-tool set and
 *    never advertised in the generated Discord system prompt.
 *
 * It also covers the Discord activity scoping, which maps the caller to their
 * Tautulli user through the shared findTautulliUser lookup (P0.9) and fails
 * closed on every other path (P4.19, SEC-50), the
 * three tools that used to call commands Tautulli does not have (P2.3, RWP-10),
 * and the admin prompt sending "who is watching" to the activity, which names
 * the viewers.
 */

import { executeTautulliTool } from "../tautulli"
import {
  ALL_TOOLS,
  DISCORD_SAFE_TOOLS,
  generateDiscordSystemPrompt,
  generateSystemPrompt,
  getRegisteredTool,
} from "@/lib/chatbot/tools"
import { DISCORD_SAFE_TOOL_NAMES } from "@/lib/chatbot/tools/registry"
import {
  findTautulliUser,
  getTautulliActivity,
  getTautulliHistory,
  getTautulliHomeStat,
  getTautulliLibraryNames,
  getTautulliLibraryStats,
  getTautulliUsers,
  getTautulliUserWatchTimeStats,
  tautulliCommand,
} from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import { auditMemberRead } from "@/lib/security/audit-log"
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
  getTautulliUserWatchTimeStats: jest.fn(),
  tautulliCommand: jest.fn(),
}))

jest.mock("@/lib/security/audit-log", () => ({ auditMemberRead: jest.fn() }))

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
      select: { plexUserId: true, jellyfinUserId: true },
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

  it("tells a Jellyfin-only caller why there are no sessions (P11.12)", async () => {
    mockUserFindUnique.mockResolvedValue({ plexUserId: null, jellyfinUserId: "jf-1" })

    const result = JSON.parse(await executeTautulliTool("get_tautulli_activity", {}, "user-1", "discord"))

    expect(mockFindTautulliUser).not.toHaveBeenCalled()
    expect(result).toEqual({ unavailable: "jellyfin-member" })
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

  it("returns everyone's streams outside the Discord context", async () => {
    const result = JSON.parse(await executeTautulliTool("get_tautulli_activity", {}, "user-1", "admin"))

    expect(result).toEqual({ ...activity, showing: "showing 2 of 2 streams" })
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
    mockGetTautulliHomeStat.mockImplementation(async (_config, statId) => ({
      success: true,
      data: {
        stat_id: statId,
        stat_type: "total_plays",
        rows: [{ title: statId === "top_movies" ? "Heat" : "Severance", year: 1995, total_plays: 4, total_duration: 28800, guid: "plex://movie/1", thumb: "/library/metadata/1/thumb", rating_key: 1 }],
      },
    }))

    const result = JSON.parse(await executeTautulliTool("get_tautulli_most_watched", { limit: 5 }))

    expect(mockGetTautulliHomeStat).toHaveBeenCalledTimes(2)
    expect(mockGetTautulliHomeStat).toHaveBeenCalledWith(expect.anything(), "top_movies", 5)
    expect(mockGetTautulliHomeStat).toHaveBeenCalledWith(expect.anything(), "top_tv", 5)
    expect(result).toEqual({
      showing: "showing the top 1 movies and top 1 shows by plays in the last 30 days",
      top_movies: [{ title: "Heat", year: 1995, total_plays: 4, total_duration: 28800 }],
      top_tv: [{ title: "Severance", year: 1995, total_plays: 4, total_duration: 28800 }],
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

const UTC_PROMPT_FORMAT = { timeZone: "UTC", locale: "en-US" }

describe("Discord tool gating - get_tautulli_users", () => {
  it("excludes get_tautulli_users from the Discord safe-tool set", () => {
    expect(DISCORD_SAFE_TOOL_NAMES.has("get_tautulli_users")).toBe(false)
    expect(DISCORD_SAFE_TOOLS.map((tool) => tool.function.name)).not.toContain(
      "get_tautulli_users"
    )
  })

  it("does not advertise get_tautulli_users in the generated Discord system prompt", () => {
    const prompt = generateDiscordSystemPrompt(DISCORD_SAFE_TOOLS, { format: UTC_PROMPT_FORMAT, now: new Date() })

    expect(prompt).not.toContain("get_tautulli_users")
  })

  it("names Jellyfin in the Discord system prompt only when a Jellyfin server is active (P11.12)", () => {
    expect(generateDiscordSystemPrompt(DISCORD_SAFE_TOOLS, { format: UTC_PROMPT_FORMAT, now: new Date() })).not.toContain("Jellyfin")

    const prompt = generateDiscordSystemPrompt(DISCORD_SAFE_TOOLS, { format: UTC_PROMPT_FORMAT, now: new Date(), jellyfin: true })
    expect(prompt).toContain("Plex, Jellyfin, Tautulli")
    expect(prompt).toContain('"unavailable":"jellyfin-member"')
  })
})

describe("the admin prompt sends 'who is watching' to the Tautulli activity, which names the viewers", () => {
  const prompt = generateSystemPrompt(ALL_TOOLS, UTC_PROMPT_FORMAT, new Date())
  const description = (name: string) => getRegisteredTool(name)?.function.description

  it("routes the question to get_tautulli_activity, and to get_plex_sessions only without Tautulli or when it fails", () => {
    expect(prompt).toContain(
      "Who is watching or streaming now (active sessions) → get_tautulli_activity, which names each viewer; if Tautulli is not configured or get_tautulli_activity returns an error, get_plex_sessions (viewers anonymised)"
    )
    expect(prompt).toContain(
      "3. Call get_tautulli_activity for who is watching, as it names each viewer; if Tautulli is not configured or the call fails, call get_plex_sessions"
    )
    expect(prompt).not.toContain("get_plex_sessions for active viewers")
  })

  it("says which of the two tools names the viewers", () => {
    expect(description("get_tautulli_activity")).toContain("who is watching each one (user_id, friendly_name)")
    expect(description("get_plex_sessions")).toContain("Viewers are anonymised (Viewer 1, Viewer 2...): to name who is watching, use get_tautulli_activity")
  })

  it("names the parameter get_tautulli_user_watch_stats requires", () => {
    expect(getRegisteredTool("get_tautulli_user_watch_stats")?.function.parameters.required).toEqual(["userId"])
    expect(prompt).toContain("get_tautulli_user_watch_stats (pass their Tautulli user_id as userId)")
  })
})

describe("per-member reads are audited (P11.16, GAP-33)", () => {
  const plays = (...userIds: number[]) => ({ ok: true as const, data: { recordsFiltered: userIds.length, data: userIds.map((user_id) => ({ user_id, full_title: "Heat" })) } })

  beforeEach(() => {
    jest.clearAllMocks()
    mockTautulliFindFirst.mockResolvedValue({ id: "tautulli-1", name: "Tautulli", url: "http://t", apiKey: "k", publicUrl: null } as never)
    jest.mocked(tautulliCommand).mockResolvedValue({ ok: true, data: { data: [] } })
    prismaMock.user.findMany.mockResolvedValue([])
  })

  it("writes one read for the member whose Plex id the tool was given", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "member-7" }] as never)

    await executeTautulliTool("get_tautulli_watch_history", { userId: 7 }, "admin-1")

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({ where: { plexUserId: { in: ["7"] } }, select: { id: true } })
    expect(auditMemberRead).toHaveBeenCalledTimes(1)
    expect(auditMemberRead).toHaveBeenCalledWith("chatbot-tautulli", "member-7", "admin-1")
  })

  it("writes a read for each member whose plays a search finds, such as by their name", async () => {
    jest.mocked(tautulliCommand).mockResolvedValue(plays(7, 8, 7, 9))
    prismaMock.user.findMany.mockResolvedValue([{ id: "member-7" }, { id: "member-8" }] as never)

    await executeTautulliTool("get_tautulli_watch_history", { search: "Sam" }, "admin-1")

    // Plex user 9 has no account here
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({ where: { plexUserId: { in: ["7", "8", "9"] } }, select: { id: true } })
    expect(jest.mocked(auditMemberRead).mock.calls).toEqual([
      ["chatbot-tautulli", "member-7", "admin-1"],
      ["chatbot-tautulli", "member-8", "admin-1"],
    ])
  })

  it("writes one read for the member asked for when a search narrows their plays", async () => {
    jest.mocked(tautulliCommand).mockResolvedValue(plays(7, 7))
    prismaMock.user.findMany.mockResolvedValue([{ id: "member-7" }] as never)

    await executeTautulliTool("get_tautulli_watch_history", { userId: 7, search: "Heat" }, "admin-1")

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({ where: { plexUserId: { in: ["7"] } }, select: { id: true } })
    expect(auditMemberRead).toHaveBeenCalledTimes(1)
  })

  it("writes nothing for the server-wide history, an unknown Plex user or the admin's own", async () => {
    jest.mocked(tautulliCommand).mockResolvedValue(plays(7, 8))
    await executeTautulliTool("get_tautulli_watch_history", {}, "admin-1")
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()

    prismaMock.user.findMany.mockResolvedValueOnce([])
    await executeTautulliTool("get_tautulli_watch_history", { userId: 8 }, "admin-1")
    prismaMock.user.findMany.mockResolvedValueOnce([{ id: "admin-1" }] as never)
    await executeTautulliTool("get_tautulli_watch_history", { search: "Heat" }, "admin-1")

    expect(auditMemberRead).not.toHaveBeenCalled()
  })

  it("writes a read for the member whose watch time stats were read", async () => {
    jest.mocked(getTautulliUserWatchTimeStats).mockResolvedValue({ success: true, data: [] })
    prismaMock.user.findMany.mockResolvedValue([{ id: "member-7" }] as never)

    await executeTautulliTool("get_tautulli_user_watch_stats", { userId: 7 }, "admin-1")

    expect(auditMemberRead).toHaveBeenCalledWith("chatbot-tautulli", "member-7", "admin-1")
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
      data: [{ user_id: 7, friendly_name: "Sam", email: "sam@example.com", server_token: "tok", thumb: "https://plex.tv/users/x/avatar" }],
    })

    const result = await executeTautulliTool("get_tautulli_users", {})

    expect(result).not.toMatch(PERSONAL)
    expect(JSON.parse(result)).toEqual({ showing: "showing 1 of 1 users, by name", total: 1, active: 0, users: [{ user_id: 7, friendly_name: "Sam" }] })
  })

  it("get_tautulli_activity drops each session's addresses", async () => {
    mockGetTautulliActivity.mockResolvedValue({
      success: true,
      data: {
        stream_count: "1",
        sessions: [
          { user_id: 7, title: "Heat", ip_address: "203.0.113.7", ip_address_public: "203.0.113.8", email: "sam@example.com", machine_id: "m-1" },
        ],
      },
    })

    const result = await executeTautulliTool("get_tautulli_activity", {})

    expect(result).not.toMatch(PERSONAL)
    expect(JSON.parse(result)).toEqual({ stream_count: "1", showing: "showing 1 of 1 streams", sessions: [{ user_id: 7, title: "Heat" }] })
  })

  it("the history tools drop each row's address", async () => {
    const page = { recordsFiltered: 1, data: [{ full_title: "Heat", friendly_name: "Sam", user: "sam_plex", ip_address: "203.0.113.7", machine_id: "m-1" }] }
    jest.mocked(getTautulliHistory).mockResolvedValue({ success: true, data: page })
    jest.mocked(tautulliCommand).mockResolvedValue({ ok: true, data: page })

    for (const tool of ["get_tautulli_watch_history", "get_tautulli_recently_watched"]) {
      const result = await executeTautulliTool(tool, {})
      expect(result).not.toMatch(PERSONAL)
      expect(JSON.parse(result)).toEqual({ showing: "showing 1 of 1 plays, newest first", total: 1, plays: [{ full_title: "Heat", friendly_name: "Sam" }] })
    }
  })
})

describe("epochs reach the model as ISO strings with an offset (P11.17)", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockTautulliFindFirst.mockResolvedValue({ id: "tautulli-1", name: "Tautulli", url: "http://t", apiKey: "k", publicUrl: null } as never)
  })

  it("converts history epochs into the turn's zone", async () => {
    // 1793590200 is 2026-11-02T03:30:00Z: 19:30 on 1 November in Los Angeles
    jest.mocked(tautulliCommand).mockResolvedValue({
      ok: true,
      data: { data: [{ full_title: "Heat", date: 1793590200, started: "1793590200", stopped: 1793597400, duration: 7200 }] },
    })

    const result = JSON.parse(
      await executeTautulliTool("get_tautulli_watch_history", {}, "admin-1", "default", {
        timeZone: "America/Los_Angeles",
        locale: "en-US",
      })
    )

    // `started` repeats `date`, and `stopped` is `date` plus `duration` and any pause, so neither is kept
    expect(result.plays[0]).toEqual({ full_title: "Heat", date: "2026-11-01T19:30:00-08:00", duration: 7200 })
  })

  it("converts a user's last play sent as text", async () => {
    jest.mocked(getTautulliUsers).mockResolvedValue({ success: true, data: [{ user_id: 7, friendly_name: "Sam", last_seen: "1793590200" }] })

    const result = JSON.parse(await executeTautulliTool("get_tautulli_users", {}, "admin-1", "default", { timeZone: "America/Los_Angeles", locale: "en-US" }))

    expect(result.users[0]).toEqual({ user_id: 7, friendly_name: "Sam", last_seen: "2026-11-01T19:30:00-08:00" })
  })

  it("converts the libraries table's last access, and keeps a numeric last-played title", async () => {
    mockGetTautulliLibraryStats.mockResolvedValue({
      success: true,
      data: { data: [{ section_name: "Movies", last_accessed: 1793590200, last_played: "1917" }] },
    } as never)

    const result = JSON.parse(
      await executeTautulliTool("get_tautulli_library_stats", {}, "admin-1", "default", { timeZone: "America/Los_Angeles", locale: "en-US" })
    )

    expect(result.data[0]).toEqual({ section_name: "Movies", last_accessed: "2026-11-01T19:30:00-08:00", last_played: "1917" })
  })

  it("writes UTC with an explicit offset when no zone is given", async () => {
    jest.mocked(getTautulliHomeStat).mockResolvedValue({
      success: true,
      data: { stat_id: "top_users", rows: [{ user: "sam_plex", friendly_name: "Sam", user_thumb: "https://plex.tv/users/x/avatar", last_play: 1793590200 }] },
    })

    const result = JSON.parse(await executeTautulliTool("get_tautulli_top_users", {}))

    expect(result.users).toEqual([{ friendly_name: "Sam", last_play: "2026-11-02T03:30:00+00:00" }])
  })
})
