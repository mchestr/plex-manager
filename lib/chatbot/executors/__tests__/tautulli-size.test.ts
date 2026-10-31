/**
 * The Tautulli tools on a large server (about 500 users, 25 streams, a long
 * history), built from synthetic records as heavy as Tautulli's: every result,
 * with default and with the largest arguments, stays under the 40,000
 * characters the MCP endpoint accepts. Names and titles are long on purpose.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getTautulliActivity, getTautulliHistory, getTautulliHomeStat, getTautulliUsers, tautulliCommand } from "@/lib/connections/tautulli"

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

const MCP_LIMIT = 40_000
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
  shared_libraries: ["1", "2", "3", "4", "5", "6", "7", "8"],
  filter_all: "",
  filter_movies: "",
  filter_tv: "",
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
  bandwidth: "21500",
  quality_profile: "Original (Remux 4K HDR)",
  transcode_decision: "transcode",
  video_decision: "transcode",
  audio_decision: "transcode",
  subtitle_decision: "burn",
  container: "mkv",
  video_codec: "hevc",
  video_resolution: "4k",
  stream_video_resolution: "1080",
  audio_codec: "truehd",
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
  jest.mocked(getTautulliUsers).mockResolvedValue({ success: true, data: Array.from({ length: 500 }, (_, i) => rawUser(i)) })
  jest.mocked(getTautulliActivity).mockResolvedValue({ success: true, data: activity(25) })
  // Tautulli returns as many plays and rows as asked for
  jest.mocked(tautulliCommand).mockImplementation(async (_config, _cmd, params) => ({ ok: true, data: historyPage(Number(params.length)) }) as never)
  jest.mocked(getTautulliHistory).mockImplementation(async (_config, _user, limit = 20) => ({ success: true, data: historyPage(limit) }))
  jest.mocked(getTautulliHomeStat).mockImplementation(async (_config, statId, count) => ({
    success: true,
    data: { stat_id: statId, rows: Array.from({ length: count }, (_, i) => (statId === "top_users" ? rawTopUser(i) : rawTopTitle(i))) },
  }))
})

describe("Tautulli tool results on a large server stay under the MCP limit", () => {
  it.each([
    ["get_tautulli_users", {}],
    ["get_tautulli_users", { limit: 200 }],
    ["get_tautulli_users", { limit: 100_000, search: "Member" }],
    ["get_tautulli_activity", {}],
    ["get_tautulli_watch_history", {}],
    ["get_tautulli_watch_history", { limit: 100_000, page: 3 }],
    ["get_tautulli_recently_watched", {}],
    ["get_tautulli_recently_watched", { limit: 100_000 }],
    ["get_tautulli_most_watched", {}],
    ["get_tautulli_most_watched", { limit: 100_000 }],
    ["get_tautulli_top_users", {}],
    ["get_tautulli_top_users", { limit: 100_000 }],
  ])("%s %j", async (tool, args) => {
    expect(await size(tool, args)).toBeLessThanOrEqual(MCP_LIMIT)
  })

  it("lists 100 of the 500 users by default and at most 200, and says so", async () => {
    const byDefault = JSON.parse(await executeTautulliTool("get_tautulli_users", {}))
    const most = JSON.parse(await executeTautulliTool("get_tautulli_users", { limit: 1000 }))

    expect(byDefault.users).toHaveLength(100)
    expect(byDefault.showing).toMatch(/^showing 100 of 500 users, by name; pass a search/)
    expect(most.users).toHaveLength(200)
    expect(most).toMatchObject({ total: 500, active: 450 })
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
    expect(JSON.parse(output).showing).toMatch(/^showing \d of 50 plays, newest first; use get_tautulli_watch_history with page/)
  })
})
