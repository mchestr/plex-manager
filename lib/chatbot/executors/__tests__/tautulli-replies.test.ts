/**
 * The Tautulli tools' replies: arguments read defensively, each list's
 * maximum, the "showing N of M" line and how it says to see the rest, search,
 * the projected fields, and what a Discord member still sees through the
 * `get_tautulli_activity` allowlist.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import {
  findTautulliUser,
  getTautulliActivity,
  getTautulliHistory,
  getTautulliHomeStat,
  getTautulliUsers,
  getTautulliUserWatchTimeStats,
  tautulliCommand,
} from "@/lib/connections/tautulli"

import { scrubForDiscord } from "../scrub"
import { executeTautulliTool } from "../tautulli"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/connections/tautulli", () => ({
  findTautulliUser: jest.fn(),
  getTautulliActivity: jest.fn(),
  getTautulliHistory: jest.fn(),
  getTautulliHomeStat: jest.fn(),
  getTautulliUsers: jest.fn(),
  getTautulliUserWatchTimeStats: jest.fn(),
  tautulliCommand: jest.fn(),
}))
jest.mock("@/lib/security/audit-log", () => ({ auditMemberRead: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
}))

const run = async (tool: string, args: Record<string, unknown> = {}, context = "default") =>
  JSON.parse(await executeTautulliTool(tool, args, "admin-1", context))

const play = (n: number) => ({ date: 1793590200 - n, full_title: `Play ${n}`, friendly_name: "Sam" })

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  prismaMock.tautulli.findFirst.mockResolvedValue({ id: "t-1", name: "Tautulli", url: "http://t", apiKey: "k", publicUrl: null } as never)
  jest.mocked(tautulliCommand).mockResolvedValue({ ok: true, data: { recordsFiltered: 0, data: [] } })
  jest.mocked(getTautulliHistory).mockResolvedValue({ success: true, data: { recordsFiltered: 0, data: [] } })
  jest.mocked(getTautulliHomeStat).mockResolvedValue({ success: true, data: { rows: [] } })
})

describe("limits", () => {
  it.each([
    ["get_tautulli_most_watched", 50],
    ["get_tautulli_top_users", 100],
  ])("%s asks Tautulli for at most %i rows", async (tool, max) => {
    await run(tool, { limit: 100_000 })

    for (const [, , count] of jest.mocked(getTautulliHomeStat).mock.calls) expect(count).toBe(max)
  })

  it("caps the history tools at 50 plays", async () => {
    await run("get_tautulli_recently_watched", { limit: 5000 })
    await run("get_tautulli_watch_history", { limit: 5000 })

    expect(getTautulliHistory).toHaveBeenCalledWith(expect.anything(), undefined, 50)
    expect(tautulliCommand).toHaveBeenCalledWith(expect.anything(), "get_history", expect.objectContaining({ length: 50, start: 0 }), expect.anything())
  })

  it.each([
    [{ limit: "7" }, 7],
    [{ limit: 0 }, 1],
    [{ limit: -3 }, 1],
    [{ limit: 2.9 }, 2],
    [{ limit: "lots" }, 20],
    [{}, 20],
  ])("reads limit %j as %i", async (args, length) => {
    await run("get_tautulli_recently_watched", args)

    expect(getTautulliHistory).toHaveBeenCalledWith(expect.anything(), undefined, length)
  })
})

describe("get_tautulli_watch_history", () => {
  it("pages back through older plays, for a user id sent as text and a search", async () => {
    jest.mocked(tautulliCommand).mockResolvedValue({ ok: true, data: { recordsFiltered: 45, data: [play(11), play(12)] } })

    const result = await run("get_tautulli_watch_history", { userId: "7", search: " Dune ", limit: 10, page: 2 })

    expect(tautulliCommand).toHaveBeenCalledWith(expect.anything(), "get_history", { user_id: 7, search: "Dune", length: 10, start: 10 }, expect.anything())
    expect(result.showing).toBe('showing 11-12 of 45 plays by user_id 7 matching "Dune", newest first; pass page 3 for older plays, or a larger limit (at most 50)')
    expect(result.total).toBe(45)
  })

  it("says how to see more on the first page of everyone's plays", async () => {
    jest.mocked(tautulliCommand).mockResolvedValue({ ok: true, data: { recordsFiltered: 12000, recordsTotal: 12000, data: [play(1), play(2)] } })

    const result = await run("get_tautulli_watch_history", { limit: 2 })

    expect(result.showing).toBe(
      "showing 2 of 12000 plays, newest first; pass page 2 for older plays, or a larger limit (at most 50), or a userId or a search to narrow them"
    )
  })

  it("says when a page is past the last play", async () => {
    jest.mocked(tautulliCommand).mockResolvedValue({ ok: true, data: { recordsFiltered: 45, data: [] } })

    const result = await run("get_tautulli_watch_history", { limit: 10, page: 9 })

    expect(result).toEqual({ showing: "none on page 9; there are 45 plays", total: 45, plays: [] })
  })

  it("refuses a userId that is not a user id instead of answering for every user", async () => {
    const result = await run("get_tautulli_watch_history", { userId: "Sam" })

    expect(result.error).toMatch(/user_id/)
    expect(tautulliCommand).not.toHaveBeenCalled()
  })

  it("keeps when, who, what, how long and on what, and nothing else", async () => {
    const row = {
      ...play(1),
      user_id: 7,
      user: "sam_plex",
      ip_address: "203.0.113.7",
      machine_id: "m-1",
      thumb: "/library/metadata/1/thumb",
      guid: "plex://episode/1",
      media_type: "episode",
      parent_media_index: 1,
      media_index: 4,
      duration: 2580,
      percent_complete: 98,
      watched_status: 1,
      platform: "Roku",
      player: "Living Room TV",
      transcode_decision: "direct play",
      location: "lan",
      group_ids: "1,2",
    }
    jest.mocked(tautulliCommand).mockResolvedValue({ ok: true, data: { recordsFiltered: 1, data: [row] } })

    const [kept] = (await run("get_tautulli_watch_history")).plays

    expect(Object.keys(kept).sort()).toEqual(
      ["date", "duration", "friendly_name", "full_title", "location", "media_index", "media_type", "parent_media_index", "percent_complete", "platform", "player", "transcode_decision", "user_id", "watched_status"].sort()
    )
  })
})

describe("get_tautulli_recently_watched", () => {
  it("points to the watch history for older plays", async () => {
    jest.mocked(getTautulliHistory).mockResolvedValue({ success: true, data: { recordsFiltered: 12000, data: [play(1)] } })

    const result = await run("get_tautulli_recently_watched", { limit: 1 })

    expect(result.showing).toBe(
      "showing 1 of 12000 plays, newest first; pass a larger limit (at most 50), or use get_tautulli_watch_history with page, userId or search for older plays"
    )
  })
})

describe("get_tautulli_user_watch_stats", () => {
  it("needs a user id: Tautulli has no server-wide watch time stats", async () => {
    const result = await run("get_tautulli_user_watch_stats")

    expect(result.error).toMatch(/user_id/)
    expect(getTautulliUserWatchTimeStats).not.toHaveBeenCalled()
  })

  it("reads a user id sent as text", async () => {
    jest.mocked(getTautulliUserWatchTimeStats).mockResolvedValue({ success: true, data: [{ query_days: 0, total_time: 3600, total_plays: 2 }] })

    await run("get_tautulli_user_watch_stats", { userId: "7" })

    expect(getTautulliUserWatchTimeStats).toHaveBeenCalledWith(expect.anything(), 7)
  })
})

describe("get_tautulli_users", () => {
  const users = [
    { user_id: 3, username: "zed", friendly_name: "Zed", is_active: 1, is_admin: 0, is_home_user: 0, is_restricted: 0, email: "z@example.com" },
    { user_id: 1, username: "owner", friendly_name: "alice", is_active: 1, is_admin: 1, is_home_user: 1, is_restricted: 0, server_token: "tok" },
    { user_id: 25, username: "kids", friendly_name: "Kids", is_active: 0, is_admin: 0, is_home_user: 1, is_restricted: 1, shared_libraries: ["1", "2"] },
  ]

  beforeEach(() => jest.mocked(getTautulliUsers).mockResolvedValue({ success: true, data: users }))

  it("lists users by name, with only the flags that are set, and counts those with access", async () => {
    const result = await run("get_tautulli_users")

    expect(result).toEqual({
      showing: "showing 3 of 3 users, by name",
      total: 3,
      active: 2,
      users: [
        { user_id: 1, friendly_name: "alice", username: "owner", is_active: 1, is_admin: 1, is_home_user: 1 },
        { user_id: 25, friendly_name: "Kids", username: "kids", is_active: 0, is_home_user: 1, is_restricted: 1 },
        { user_id: 3, friendly_name: "Zed", username: "zed", is_active: 1 },
      ],
    })
  })

  it.each([
    ["a name, in any case", "ALI", [1]],
    ["a username", "kid", [25]],
    ["a user_id, exactly", "3", [3]],
  ])("finds users by %s", async (_case, search, ids) => {
    const result = await run("get_tautulli_users", { search })

    expect(result.users.map((user: { user_id: number }) => user.user_id)).toEqual(ids)
    expect(result.showing).toBe(`showing 1 of 1 users matching "${search}"`)
  })

  it("says how many it leaves out, and how to see them", async () => {
    const result = await run("get_tautulli_users", { limit: 2 })

    expect(result.users).toHaveLength(2)
    expect(result.showing).toBe("showing 2 of 3 users, by name; pass a search (a name, username or user_id) to find someone, or a larger limit (at most 200)")
  })

  it("offers only a narrower search once the limit is the largest", async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ user_id: i, friendly_name: `Member ${i}`, is_active: 1 }))
    jest.mocked(getTautulliUsers).mockResolvedValue({ success: true, data: many })

    const result = await run("get_tautulli_users", { search: "member", limit: 999 })

    expect(result.users).toHaveLength(200)
    expect(result.showing).toBe('showing 200 of 250 users matching "member"; use a longer search')
  })
})

describe("get_tautulli_activity", () => {
  const session = {
    user_id: 7,
    user: "sam_plex",
    username: "sam_plex",
    friendly_name: "Sam",
    email: "sam@example.com",
    ip_address: "10.0.0.7",
    ip_address_public: "203.0.113.7",
    machine_id: "m-1",
    session_id: "s-1",
    session_key: "27",
    file: "/media/TV/Severance/S01E03.mkv",
    summary: "A long summary",
    actors: ["Adam Scott"],
    genres: ["Drama"],
    shared_libraries: ["1", "2"],
    full_title: "Severance - In Perpetuity",
    title: "In Perpetuity",
    grandparent_title: "Severance",
    parent_title: "Season 1",
    media_type: "episode",
    year: "2022",
    parent_media_index: "1",
    media_index: "3",
    library_name: "TV Shows",
    state: "playing",
    progress_percent: "42",
    product: "Plex for Android (TV)",
    platform: "Android",
    player: "Sam's TV",
    location: "wan",
    bandwidth: "12000",
    quality_profile: "4 Mbps 720p",
    transcode_decision: "transcode",
    video_decision: "transcode",
    audio_decision: "copy",
    subtitle_decision: "burn",
    container: "mkv",
    video_codec: "hevc",
    video_resolution: "4k",
    stream_video_resolution: "720",
    audio_codec: "eac3",
    transcode_hw_decoding: 1,
    transcode_hw_encoding: 1,
  }
  const others = [
    { user_id: 8, friendly_name: "Ana", full_title: "Heat", title: "Heat", state: "paused" },
    { user_id: 9, friendly_name: "Bo", full_title: "Arrival", title: "Arrival", state: "playing" },
  ]
  const activity = { stream_count: "3", stream_count_transcode: 1, total_bandwidth: 30000, wan_bandwidth: 12000, sessions: [session, ...others] }

  beforeEach(() => jest.mocked(getTautulliActivity).mockResolvedValue({ success: true, data: activity }))

  it("keeps each stream's title, progress, player, bandwidth and quality, and the server's totals", async () => {
    const result = await run("get_tautulli_activity")

    expect(result.stream_count).toBe("3")
    expect(result.total_bandwidth).toBe(30000)
    expect(result.sessions[0]).toEqual({
      user_id: 7,
      friendly_name: "Sam",
      full_title: "Severance - In Perpetuity",
      title: "In Perpetuity",
      grandparent_title: "Severance",
      parent_title: "Season 1",
      media_type: "episode",
      year: "2022",
      parent_media_index: "1",
      media_index: "3",
      library_name: "TV Shows",
      state: "playing",
      progress_percent: "42",
      product: "Plex for Android (TV)",
      platform: "Android",
      player: "Sam's TV",
      location: "wan",
      bandwidth: "12000",
      quality_profile: "4 Mbps 720p",
      transcode_decision: "transcode",
      video_decision: "transcode",
      audio_decision: "copy",
      subtitle_decision: "burn",
      container: "mkv",
      video_codec: "hevc",
      video_resolution: "4k",
      stream_video_resolution: "720",
      audio_codec: "eac3",
      transcode_hw_decoding: 1,
      transcode_hw_encoding: 1,
    })
  })

  it.each([
    ["a user", "ana", ["Heat"]],
    ["a title", "arriv", ["Arrival"]],
    ["a user_id", "7", ["Severance - In Perpetuity"]],
  ])("narrows to the streams of %s", async (_case, search, titles) => {
    const result = await run("get_tautulli_activity", { search })

    expect(result.sessions.map((s: { full_title: string }) => s.full_title)).toEqual(titles)
    expect(result.showing).toBe(`showing 1 of 1 streams matching "${search}"`)
  })

  it("shows a Discord member the same fields of their own stream as before, and nothing that identifies them", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ plexUserId: "7", jellyfinUserId: null } as never)
    jest.mocked(findTautulliUser).mockResolvedValue({ ok: true, user: { user_id: 7, username: "sam_plex" } })

    const scrubbed = JSON.parse(scrubForDiscord("get_tautulli_activity", await executeTautulliTool("get_tautulli_activity", {}, "user-1", "discord")))
    // What the allowlist kept of the raw session before the projection, less the
    // arrays of text it let through (genres, actors, library ids)
    const before = JSON.parse(scrubForDiscord("get_tautulli_activity", { sessions: [session] })).sessions[0]
    for (const key of ["actors", "genres", "shared_libraries"]) delete before[key]

    expect(scrubbed).toEqual({ session_count: 1, scope: "caller", sessions: [before] })
    expect(JSON.stringify(scrubbed)).not.toMatch(/Sam|sam_plex|"7"|user_id|10\.0\.0\.7|203\.0\.113|m-1|Ana|Heat/)
  })
})

describe("home stats", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Title ${i}`, total_plays: n - i, total_duration: 3600, user_id: i, friendly_name: `User ${i}` }))

  it("offers a larger limit when a card is full and below the maximum", async () => {
    jest.mocked(getTautulliHomeStat).mockResolvedValue({ success: true, data: { rows: rows(5) } })

    expect((await run("get_tautulli_top_users", { limit: 5 })).showing).toBe(
      "showing the top 5 users by watch time in the last 30 days; pass a larger limit (at most 100) to see more"
    )
    expect((await run("get_tautulli_most_watched", { limit: 5 })).showing).toBe(
      "showing the top 5 movies and top 5 shows by plays in the last 30 days; pass a larger limit (at most 50) to see more"
    )
  })

  it("offers nothing more when a card has fewer rows than asked", async () => {
    jest.mocked(getTautulliHomeStat).mockResolvedValue({ success: true, data: { rows: rows(3) } })

    expect((await run("get_tautulli_top_users", { limit: 10 })).showing).toBe("showing the top 3 users by watch time in the last 30 days")
  })
})
