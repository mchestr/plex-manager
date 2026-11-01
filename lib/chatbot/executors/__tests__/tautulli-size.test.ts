/**
 * The Tautulli tools on a large server (about 500 users, 25 streams, a long
 * history), built from synthetic records as heavy as Tautulli's: every result,
 * with default and with the largest arguments, stays under the 40,000
 * characters the MCP endpoint accepts. Names and titles are long on purpose.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getTautulliActivity, getTautulliHistory, getTautulliHomeStat, getTautulliUsers, tautulliCommand } from "@/lib/connections/tautulli"
import { MAX_RESULT_CHARS } from "@/lib/utils/tool-result-limit"

import { executeTautulliTool } from "../tautulli"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/connections/tautulli", () => ({
  findTautulliUser: jest.fn(),
  getTautulliActivity: jest.fn(),
  getTautulliHistory: jest.fn(),
  getTautulliHomeStat: jest.fn(),
  getTautulliUsers: jest.fn(),
  tautulliCommand: jest.fn(),
}))
jest.mock("@/lib/security/audit-log", () => ({ auditMemberRead: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
}))

const MCP_LIMIT = MAX_RESULT_CHARS
const LA = { timeZone: "America/Los_Angeles", locale: "en-US" }

const name = (i: number) => `Member With A Fairly Long Display Name ${i}`
const show = (i: number) => `A Series With An Unusually Long Name, Part ${i}`
const episode = (i: number) => `An Episode Whose Title Goes On For Quite A While ${i}`

/** Fields Tautulli sends that no projection keeps, so each raw record is full size. */
const padding = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, n) => [`unkept_field_${n}`, `a value the tools drop ${n}`]))

const rawUser = (i: number) => ({
  row_id: i,
  user_id: 100_000_000 + i,
  username: `member.username.${i}`,
  friendly_name: name(i),
  thumb: `https://plex.tv/users/0a1b2c3d4e5f${i}/avatar?c=1700000000`,
  email: `member${i}@example.com`,
  is_active: i % 10 === 0 ? 0 : 1,
  is_admin: i === 0 ? 1 : 0,
  is_home_user: i % 25 === 0 ? 1 : 0,
  is_allow_sync: 1,
  is_restricted: i % 50 === 0 ? 1 : 0,
  do_notify: 1,
  keep_history: 1,
  allow_guest: 0,
  server_token: `server-token-${i}`,
  // 15 libraries, and content restrictions on every tenth user
  shared_libraries: Array.from({ length: 15 }, (_, n) => String(n + 1)),
  filter_all: "",
  filter_movies: i % 10 === 5 ? "contentRating=G|PG|TV-Y|TV-Y7|TV-G|TV-PG&label!=horror" : "",
  filter_tv: i % 10 === 5 ? "contentRating=TV-Y|TV-Y7|TV-G|TV-PG&label!=horror" : "",
  filter_music: "",
  filter_photos: "",
})

/** A transcoding episode stream with Tautulli's ~200 fields. */
const rawSession = (i: number) => ({
  ...padding(150),
  user_id: 100_000_000 + i,
  user: `member.username.${i}`,
  username: `member.username.${i}`,
  friendly_name: name(i),
  email: `member${i}@example.com`,
  ip_address: `10.0.0.${i}`,
  ip_address_public: `203.0.113.${i}`,
  machine_id: `machine-identifier-${i}`,
  session_id: `session-identifier-${i}`,
  file: `/media/TV Shows/${show(i)}/Season 07/${show(i)} - S07E${i} - ${episode(i)}.mkv`,
  summary: "A summary of the episode. ".repeat(30),
  actors: Array.from({ length: 20 }, (_, n) => `Actor With A Long Name ${n}`),
  genres: ["Drama", "Fantasy", "Adventure"],
  full_title: `${show(i)} - ${episode(i)}`,
  title: episode(i),
  grandparent_title: show(i),
  parent_title: "Season 7",
  media_type: "episode",
  year: "2017",
  parent_media_index: "7",
  media_index: String(i),
  library_name: "TV Shows (4K and HDR)",
  state: "playing",
  progress_percent: "42",
  product: "Plex for Android (TV)",
  platform: "Android",
  player: `${name(i)}'s Living Room Television`,
  location: "wan",
  relayed: 0,
  secure: 1,
  bandwidth: "21500",
  bitrate: "64872",
  stream_bitrate: "20000",
  quality_profile: "Original (Remux 4K HDR)",
  transcode_decision: "transcode",
  video_decision: "transcode",
  audio_decision: "transcode",
  subtitle_decision: "burn",
  subtitle_codec: "pgs",
  container: "mkv",
  video_codec: "hevc",
  stream_video_codec: "h264",
  video_resolution: "4k",
  stream_video_resolution: "1080",
  video_dynamic_range: "HDR",
  stream_video_dynamic_range: "SDR",
  audio_codec: "truehd",
  stream_audio_codec: "eac3",
  transcode_speed: "1.4",
  transcode_throttled: 1,
  transcode_hw_decoding: 1,
  transcode_hw_encoding: 1,
})

const activity = (streams: number) => ({
  stream_count: String(streams),
  stream_count_direct_play: 5,
  stream_count_direct_stream: 5,
  stream_count_transcode: streams - 10,
  total_bandwidth: 512_000,
  lan_bandwidth: 128_000,
  wan_bandwidth: 384_000,
  sessions: Array.from({ length: streams }, (_, i) => rawSession(i)),
})

/** A `get_history` row with Tautulli's ~45 fields. */
const rawPlay = (i: number) => ({
  ...padding(10),
  reference_id: i,
  row_id: i,
  id: i,
  date: 1_793_590_200 - i * 3600,
  started: 1_793_590_200 - i * 3600,
  stopped: 1_793_590_200 - i * 3600 + 2700,
  duration: 2580,
  play_duration: 2580,
  paused_counter: 120,
  user_id: 100_000_000 + i,
  user: `member.username.${i}`,
  friendly_name: name(i),
  user_thumb: `https://plex.tv/users/0a1b2c3d4e5f${i}/avatar`,
  platform: "Android",
  product: "Plex for Android (TV)",
  player: `${name(i)}'s Living Room Television`,
  ip_address: `10.0.0.${i % 250}`,
  live: 0,
  machine_id: `machine-identifier-${i}`,
  location: "wan",
  secure: 1,
  relayed: 0,
  media_type: "episode",
  rating_key: 500_000 + i,
  parent_rating_key: 400_000 + i,
  grandparent_rating_key: 300_000 + i,
  full_title: `${show(i)} - ${episode(i)}`,
  title: episode(i),
  parent_title: "Season 7",
  grandparent_title: show(i),
  original_title: "",
  year: 2025,
  media_index: 10,
  parent_media_index: 7,
  thumb: `/library/metadata/${400_000 + i}/thumb/1700000000`,
  originally_available_at: "2025-09-14",
  guid: `plex://episode/${"0".repeat(20)}${i}`,
  transcode_decision: "direct play",
  percent_complete: 98,
  watched_status: 1,
  group_count: 1,
  group_ids: String(i),
  state: null,
  session_key: null,
})

const historyPage = (length: number) => ({
  recordsFiltered: 120_000,
  recordsTotal: 120_000,
  draw: 1,
  filter_duration: "1520 days 4 hrs",
  total_duration: "1520 days 4 hrs",
  data: Array.from({ length }, (_, i) => rawPlay(i)),
})

const rawTopTitle = (i: number) => ({
  ...padding(10),
  title: `${show(i)}: The Complete Extended Edition`,
  grandparent_title: show(i),
  year: 2024,
  total_plays: 900 - i,
  total_duration: 1_200_000 - i,
  users_watched: "",
  rating_key: 300_000 + i,
  last_play: 1_793_590_200 - i,
  guid: `plex://show/${"0".repeat(20)}${i}`,
  thumb: `/library/metadata/${300_000 + i}/thumb/1700000000`,
  art: `/library/metadata/${300_000 + i}/art/1700000000`,
  content_rating: "TV-MA",
  labels: ["Favourite", "4K"],
  media_type: "episode",
  section_id: 2,
})

const rawTopUser = (i: number) => ({
  ...padding(10),
  user: `member.username.${i}`,
  user_id: 100_000_000 + i,
  friendly_name: name(i),
  total_plays: 4000 - i,
  total_duration: 9_000_000 - i,
  last_play: 1_793_590_200 - i,
  user_thumb: `https://plex.tv/users/0a1b2c3d4e5f${i}/avatar`,
  platform: "",
  title: "",
  rating_key: "",
})

async function size(tool: string, args: Record<string, unknown> = {}): Promise<number> {
  const output = await executeTautulliTool(tool, args, "admin-1", "default", LA)
  expect(JSON.parse(output).error).toBeUndefined()
  return output.length
}

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.tautulli.findFirst.mockResolvedValue({ id: "t-1", name: "Tautulli", url: "http://t", apiKey: "k", publicUrl: null } as never)
  prismaMock.user.findMany.mockResolvedValue([])
  jest.mocked(getTautulliUsers).mockResolvedValue({ success: true, data: Array.from({ length: 500 }, (_, i) => rawUser(i)) })
  jest.mocked(getTautulliActivity).mockResolvedValue({ success: true, data: activity(25) })
  // Tautulli returns as many plays and rows as asked for (the page length is in the DataTables request)
  jest.mocked(tautulliCommand).mockImplementation(async (_config, _cmd, params) => ({ ok: true, data: historyPage(JSON.parse(String(params.json_data)).length) }) as never)
  jest.mocked(getTautulliHistory).mockImplementation(async (_config, _user, limit = 20) => ({ success: true, data: historyPage(limit) }))
  jest.mocked(getTautulliHomeStat).mockImplementation(async (_config, statId, count) => ({
    success: true,
    data: { stat_id: statId, rows: Array.from({ length: count }, (_, i) => (statId === "top_users" ? rawTopUser(i) : rawTopTitle(i))) },
  }))
})

describe("Tautulli tool results on a large server stay under the MCP limit", () => {
  it.each([
    ["get_tautulli_users", {}],
    ["get_tautulli_users", { limit: 150 }],
    ["get_tautulli_users", { limit: 150, page: 2 }],
    ["get_tautulli_users", { limit: 100_000, search: "Member" }],
    ["get_tautulli_users", { limit: 100_000, active: true }],
    ["get_tautulli_activity", {}],
    ["get_tautulli_activity", { search: "Member" }],
    ["get_tautulli_watch_history", {}],
    ["get_tautulli_watch_history", { limit: 100_000, page: 3 }],
    ["get_tautulli_watch_history", { limit: 100_000, page: 2, search: "A Series With An Unusually Long Name" }],
    ["get_tautulli_recently_watched", {}],
    ["get_tautulli_recently_watched", { limit: 100_000 }],
    ["get_tautulli_most_watched", {}],
    ["get_tautulli_most_watched", { limit: 100_000 }],
    ["get_tautulli_top_users", {}],
    ["get_tautulli_top_users", { limit: 100_000 }],
  ])("%s %j", async (tool, args) => {
    expect(await size(tool, args)).toBeLessThanOrEqual(MCP_LIMIT)
  })

  it("lists 100 of the 500 users by default and at most 150, and says so", async () => {
    const byDefault = JSON.parse(await executeTautulliTool("get_tautulli_users", {}))
    const most = JSON.parse(await executeTautulliTool("get_tautulli_users", { limit: 1000 }))

    expect(byDefault.users).toHaveLength(100)
    expect(byDefault.showing).toMatch(/^showing 100 of 500 users, by name; pass page 2 for more, or a search/)
    expect(most.users).toHaveLength(150)
    expect(most.showing).toMatch(/^showing 150 of 500 users, by name; pass page 2 for more, or a search .*access$/)
    expect(most).toMatchObject({ total: 500, active: 450 })
  })

  it("reaches every one of the 500 users, page by page at the largest limit, with their libraries", async () => {
    const pages = await Promise.all([1, 2, 3, 4].map(async (page) => JSON.parse(await executeTautulliTool("get_tautulli_users", { limit: 150, page }))))
    const ids = new Set(pages.flatMap((page) => page.users.map((user: { user_id: number }) => user.user_id)))

    // Each page fits the reply whole, so no user falls between two pages
    expect(pages.map((page) => page.users.length)).toEqual([150, 150, 150, 50])
    expect(ids.size).toBe(500)
    expect(pages[3].showing).toBe("showing 451-500 of 500 users, by name")
    expect(pages[0].users[0].shared_libraries).toBe("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15")
  })

  it("lists the 50 users who no longer have access", async () => {
    const result = JSON.parse(await executeTautulliTool("get_tautulli_users", { active: false }))

    expect(result.users).toHaveLength(50)
    expect(result.users.every((user: { is_active: number }) => user.is_active === 0)).toBe(true)
    expect(result.showing).toBe("showing 50 of 50 users without access, by name")
  })

  it("gives every one of 25 streams with the server's totals", async () => {
    const result = JSON.parse(await executeTautulliTool("get_tautulli_activity", {}))

    expect(result.sessions).toHaveLength(25)
    expect(result.showing).toBe("showing 25 of 25 streams")
    expect(result).toMatchObject({ stream_count: "25", stream_count_transcode: 15, wan_bandwidth: 384_000 })
  })

  it("keeps a server with far more streams under the limit, and says how to find the rest", async () => {
    jest.mocked(getTautulliActivity).mockResolvedValue({ success: true, data: activity(80) })

    const output = await executeTautulliTool("get_tautulli_activity", {}, "admin-1", "default", LA)
    const result = JSON.parse(output)

    expect(output.length).toBeLessThanOrEqual(MCP_LIMIT)
    expect(result.sessions.length).toBeLessThan(80)
    expect(result.showing).toBe(`showing ${result.sessions.length} of 80 streams; pass a search (a user or a title) to see the others`)
  })

  it("never lets a pathological record push a list over the limit", async () => {
    const huge = { ...rawPlay(0), full_title: "x".repeat(5000) }
    jest.mocked(getTautulliHistory).mockResolvedValue({ success: true, data: { recordsFiltered: 50, data: Array.from({ length: 50 }, () => huge) } })

    const output = await executeTautulliTool("get_tautulli_recently_watched", { limit: 50 })

    expect(output.length).toBeLessThanOrEqual(MCP_LIMIT)
    expect(JSON.parse(output).showing).toMatch(
      /^showing (\d) of 50 plays, newest first; the reply holds only \1 of the 50 plays it read; use get_tautulli_watch_history with a smaller limit and page through them$/
    )
  })
})
