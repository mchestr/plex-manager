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

interface HistoryRequest {
  draw: number
  columns: { data: string; orderable: boolean; searchable: boolean }[]
  order: { column: number; dir: string }[]
  start: number
  length: number
  search: { value: string }
}

/** The last `get_history` call: its DataTables request (`json_data`) and the other parameters. */
function historyRequest(): { params: Record<string, unknown>; request: HistoryRequest } {
  const [, cmd, sent] = jest.mocked(tautulliCommand).mock.calls.at(-1) ?? []
  expect(cmd).toBe("get_history")
  const { json_data, ...params } = sent ?? {}
  return { params, request: JSON.parse(String(json_data)) }
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  prismaMock.tautulli.findFirst.mockResolvedValue({ id: "t-1", name: "Tautulli", url: "http://t", apiKey: "k", publicUrl: null } as never)
  prismaMock.user.findMany.mockResolvedValue([])
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
    expect(historyRequest().request).toMatchObject({ start: 0, length: 50 })
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

    const { params, request } = historyRequest()
    expect(params).toEqual({ user_id: 7 })
    expect(request).toMatchObject({ start: 10, length: 10, search: { value: "Dune" } })
    expect(result.showing).toBe('showing 11-12 of 45 plays by user_id 7 matching "Dune", newest first; pass page 3 for older plays, or a larger limit (at most 50)')
    expect(result.total).toBe(45)
  })

  it("never lets a search reach the addresses Tautulli keeps (SEC-42)", async () => {
    // Tautulli's own default searches ip_address with LIKE '%...%'
    await run("get_tautulli_watch_history", { search: "203.0.113.", userId: 7 })

    const { params, request } = historyRequest()
    const searchable = request.columns.filter((column) => column.searchable).map((column) => column.data)
    expect(searchable.sort()).toEqual(["friendly_name", "full_title", "platform", "player", "product"])
    expect(JSON.stringify(request)).not.toMatch(/ip_address|machine_id|email/)
    expect(Object.keys(params)).toEqual(["user_id"])
    expect(request).toMatchObject({ draw: 1, search: { value: "203.0.113." } })
  })

  it("sends its own request without a search too, newest first", async () => {
    await run("get_tautulli_watch_history")

    const { request } = historyRequest()
    expect(request.columns[request.order[0].column].data).toBe("date")
    expect(request).toMatchObject({ order: [{ dir: "desc" }], start: 0, length: 20, search: { value: "" } })
  })

  it("says how to see the rest when one page holds more than the reply can", async () => {
    const huge = { ...play(1), full_title: "x".repeat(5000) }
    jest.mocked(tautulliCommand).mockResolvedValue({ ok: true, data: { recordsFiltered: 500, data: Array.from({ length: 10 }, () => huge) } })

    const result = await run("get_tautulli_watch_history", { limit: 10, page: 3 })

    // A next page would start after the 10 plays read, so it would skip the ones left out
    expect(result.plays).toHaveLength(7)
    expect(result.showing).toBe("showing 21-27 of 500 plays, newest first; the reply holds only 7 of the 10 plays it read; pass a smaller limit and page through them")
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
  const filters = { filter_all: "", filter_movies: "contentRating=G|PG", filter_tv: "label=kids", filter_music: "", filter_photos: "" }
  const users = [
    { user_id: 3, username: "zed", friendly_name: "Zed", is_active: 1, is_admin: 0, is_home_user: 0, is_restricted: 0, email: "z@example.com", shared_libraries: ["1", "2", "5"] },
    { user_id: 1, username: "owner", friendly_name: "alice", is_active: 1, is_admin: 1, is_home_user: 1, is_restricted: 0, server_token: "tok", shared_libraries: [] },
    { user_id: 25, username: "kids", friendly_name: "Kids", is_active: 0, is_admin: 0, is_home_user: 1, is_restricted: 1, shared_libraries: ["1", "2"], ...filters },
  ]

  beforeEach(() => jest.mocked(getTautulliUsers).mockResolvedValue({ success: true, data: users }))

  it("lists users by name, with the flags that are set, their libraries and restrictions, and counts those with access", async () => {
    const result = await run("get_tautulli_users")

    expect(result).toEqual({
      showing: "showing 3 of 3 users, by name",
      total: 3,
      active: 2,
      users: [
        { user_id: 1, friendly_name: "alice", username: "owner", is_active: 1, is_admin: 1, is_home_user: 1 },
        {
          user_id: 25,
          friendly_name: "Kids",
          username: "kids",
          is_active: 0,
          is_home_user: 1,
          is_restricted: 1,
          shared_libraries: "1,2",
          filter_movies: "contentRating=G|PG",
          filter_tv: "label=kids",
        },
        { user_id: 3, friendly_name: "Zed", username: "zed", is_active: 1, shared_libraries: "1,2,5" },
      ],
    })
  })

  it.each([
    ["a list of text", ["1", " 2 ", ""], "1,2"],
    ["a list of numbers", [4, 10], "4,10"],
    ["text joined by semicolons", "1;2;10", "1,2,10"],
    ["empty text", "", undefined],
    ["anything else", { 1: true }, undefined],
  ])("reads the library ids sent as %s", async (_case, sharedLibraries, expected) => {
    jest.mocked(getTautulliUsers).mockResolvedValue({ success: true, data: [{ user_id: 7, friendly_name: "Sam", shared_libraries: sharedLibraries }] })

    const [user] = (await run("get_tautulli_users")).users

    expect(user.shared_libraries).toBe(expected)
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
    expect(result.showing).toBe(
      "showing 2 of 3 users, by name; pass page 2 for more, or a search (a name, username or user_id) to find someone, or active (true or false) for only the users with or without access, or a larger limit (at most 150)"
    )
  })

  it("pages through the users by name", async () => {
    const result = await run("get_tautulli_users", { limit: 2, page: "2" })

    expect(result.users.map((user: { user_id: number }) => user.user_id)).toEqual([3])
    expect(result.showing).toBe("showing 3-3 of 3 users, by name")
  })

  it("says when a page is past the last user", async () => {
    const result = await run("get_tautulli_users", { limit: 2, page: 5 })

    expect(result).toEqual({ showing: "none on page 5; there are 3 users", total: 3, active: 2, users: [] })
  })

  it.each([
    [false, [25], "showing 1 of 1 users without access, by name"],
    ["true", [1, 3], "showing 2 of 2 users with access, by name"],
    [0, [25], "showing 1 of 1 users without access, by name"],
    ["perhaps", [1, 25, 3], "showing 3 of 3 users, by name"],
  ])("reads active %j as a filter on access", async (active, ids, line) => {
    const result = await run("get_tautulli_users", { active })

    expect(result.users.map((user: { user_id: number }) => user.user_id)).toEqual(ids)
    expect(result.showing).toBe(line)
    expect(result).toMatchObject({ total: 3, active: 2 })
  })

  it("narrows by access and a search together", async () => {
    const result = await run("get_tautulli_users", { active: true, search: "z" })

    expect(result.showing).toBe('showing 1 of 1 users with access matching "z"')
  })

  describe("on a server with more users than the largest page", () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ user_id: i, friendly_name: `Member ${String(i).padStart(3, "0")}`, is_active: 1 }))

    beforeEach(() => jest.mocked(getTautulliUsers).mockResolvedValue({ success: true, data: many }))

    it("offers the next page and a narrower search once the limit is the largest", async () => {
      const result = await run("get_tautulli_users", { search: "member", limit: 999 })

      expect(result.users).toHaveLength(150)
      expect(result.showing).toBe('showing 150 of 250 users matching "member"; pass page 2 for more, or a longer search')
    })

    it("reaches the last of them on the next page", async () => {
      const result = await run("get_tautulli_users", { search: "member", limit: 999, page: 2 })

      expect(result.users).toHaveLength(100)
      expect(result.users[0].friendly_name).toBe("Member 150")
      expect(result.showing).toBe('showing 151-250 of 250 users matching "member"')
    })
  })

  it("asks for smaller pages when the reply holds fewer users than the page read", async () => {
    const long = Array.from({ length: 30 }, (_, i) => ({ user_id: i, friendly_name: `${"A very long name ".repeat(100)}${i}` }))
    jest.mocked(getTautulliUsers).mockResolvedValue({ success: true, data: long })

    const result = await run("get_tautulli_users", { limit: 30 })

    expect(result.users.length).toBeLessThan(30)
    expect(result.showing).toBe(`showing ${result.users.length} of 30 users, by name; the reply holds only ${result.users.length} of the 30 users it read; pass a smaller limit and page through them`)
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
    relayed: 1,
    secure: 1,
    bandwidth: "12000",
    bitrate: "42000",
    stream_bitrate: "4000",
    quality_profile: "4 Mbps 720p",
    transcode_decision: "transcode",
    video_decision: "transcode",
    audio_decision: "copy",
    subtitle_decision: "burn",
    subtitle_codec: "pgs",
    stream_subtitle_codec: "",
    container: "mkv",
    video_codec: "hevc",
    stream_video_codec: "h264",
    video_resolution: "4k",
    stream_video_resolution: "720",
    video_dynamic_range: "HDR",
    stream_video_dynamic_range: "SDR",
    audio_codec: "eac3",
    stream_audio_codec: "eac3",
    transcode_speed: "0.8",
    transcode_throttled: 0,
    transcode_hw_decoding: 1,
    transcode_hw_encoding: 1,
  }
  const others = [
    { user_id: 8, friendly_name: "Ana", full_title: "Heat", title: "Heat", state: "paused" },
    { user_id: 9, friendly_name: "Bo", full_title: "Arrival", title: "Arrival", state: "playing" },
  ]
  const activity = { stream_count: "3", stream_count_transcode: 1, total_bandwidth: 30000, wan_bandwidth: 12000, sessions: [session, ...others] }

  beforeEach(() => jest.mocked(getTautulliActivity).mockResolvedValue({ success: true, data: activity }))

  it("keeps each stream's title, progress, player, connection, bitrates, quality and transcoder state, and the server's totals", async () => {
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
      // Plex Relay, a throttled or slow transcode and burned-in image subtitles explain buffering
      relayed: 1,
      secure: 1,
      bandwidth: "12000",
      bitrate: "42000",
      stream_bitrate: "4000",
      quality_profile: "4 Mbps 720p",
      transcode_decision: "transcode",
      video_decision: "transcode",
      audio_decision: "copy",
      subtitle_decision: "burn",
      subtitle_codec: "pgs",
      container: "mkv",
      video_codec: "hevc",
      stream_video_codec: "h264",
      video_resolution: "4k",
      stream_video_resolution: "720",
      video_dynamic_range: "HDR",
      stream_video_dynamic_range: "SDR",
      audio_codec: "eac3",
      stream_audio_codec: "eac3",
      transcode_speed: "0.8",
      transcode_throttled: 0,
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
    // The admin's diagnostics stay out of Discord
    expect(JSON.stringify(scrubbed)).not.toMatch(/relayed|secure|bitrate|transcode_speed|throttled|dynamic_range|subtitle_codec|stream_video_codec/)
  })

  it.each(["Ana", "Heat", "8", "Severance"])("ignores a search in Discord, so a member always sees their own streams (%s)", async (search) => {
    prismaMock.user.findUnique.mockResolvedValue({ plexUserId: "7", jellyfinUserId: null } as never)
    jest.mocked(findTautulliUser).mockResolvedValue({ ok: true, user: { user_id: 7, username: "sam_plex" } })

    const output = await executeTautulliTool("get_tautulli_activity", { search }, "user-1", "discord")
    const scrubbed = JSON.parse(scrubForDiscord("get_tautulli_activity", output))

    expect(scrubbed).toMatchObject({ session_count: 1, scope: "caller", sessions: [{ full_title: "Severance - In Perpetuity" }] })
    expect(output).not.toMatch(/Ana|Heat|Arrival/)
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
