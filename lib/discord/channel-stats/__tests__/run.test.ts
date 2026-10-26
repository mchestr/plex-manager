/**
 * @jest-environment node
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))
jest.mock("@/lib/brand", () => ({ serverName: jest.fn(async () => "MFlix") }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/discord/config", () => ({ getDiscordBotToken: jest.fn() }))
jest.mock("@/lib/connections/tautulli", () => ({ tautulliCommand: jest.fn() }))
jest.mock("../rename", () => ({ renameChannel: jest.fn() }))

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { tautulliCommand } from "@/lib/connections/tautulli"
import { getActiveService } from "@/lib/data/active-service"
import { getDiscordBotToken } from "@/lib/discord/config"

import { DEFAULT_FORMATS } from "../format"
import { renameChannel } from "../rename"
import { runChannelStats } from "../run"

const tautulli = tautulliCommand as jest.Mock
const rename = renameChannel as jest.Mock

const ids = {
  status: "100000000000000001",
  streams: "100000000000000002",
  transcodes: "100000000000000003",
  bandwidth: "100000000000000004",
  movies: "100000000000000005",
  shows: "100000000000000006",
  episodes: "100000000000000007",
}
const channels = Object.fromEntries(Object.entries(ids).map(([key, channelId]) => [key, { channelId, format: DEFAULT_FORMATS[key as keyof typeof ids] }]))

const activity = { stream_count: 2, stream_count_transcode: 1, total_bandwidth: 8000 }
const libraries = [
  { section_type: "movie", count: 10 },
  { section_type: "show", count: 4, child_count: 80 },
]

function tautulliAnswers({ activityOk = true, librariesOk = true } = {}) {
  tautulli.mockImplementation(async (_config: unknown, cmd: string) => {
    if (cmd === "get_activity") return activityOk ? { ok: true, data: activity } : { ok: false, code: "TIMEOUT" }
    return librariesOk ? { ok: true, data: libraries } : { ok: false, code: "TIMEOUT" }
  })
}

function config(overrides: Record<string, unknown> = {}) {
  prismaMock.config.findUnique.mockResolvedValue({
    discordStatsEnabled: true,
    discordStatsChannels: channels,
    discordStatsLastNames: null,
    ...overrides,
  } as never)
}

const renamed = () => Object.fromEntries(rename.mock.calls.map(([, id, name]) => [id, name]))
const savedNames = () => prismaMock.config.updateMany.mock.calls[0]![0]!.data.discordStatsLastNames as Record<string, string>

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  ;(getActiveService as unknown as jest.Mock).mockResolvedValue({ url: "http://t", apiKey: "k" })
  ;(getDiscordBotToken as jest.Mock).mockResolvedValue("bot-token")
  rename.mockResolvedValue({ ok: true })
  prismaMock.config.updateMany.mockResolvedValue({ count: 1 } as never)
  config()
  tautulliAnswers()
})

describe("runChannelStats", () => {
  it("does nothing on a schedule while the job is off", async () => {
    config({ discordStatsEnabled: false })
    await expect(runChannelStats("scheduled")).resolves.toBeNull()
    expect(rename).not.toHaveBeenCalled()
  })

  it("renames every channel with the Windmill names", async () => {
    const result = await runChannelStats("scheduled")
    expect(result).toMatchObject({ status: "online", renamed: 7, unchanged: 0, failed: 0 })
    expect(renamed()).toEqual({
      [ids.status]: "MFlix Status (🟢)",
      [ids.streams]: "Current Streams: 2",
      [ids.transcodes]: "Current Transcodes: 1",
      [ids.bandwidth]: "Bandwidth: 8.0 Mbps",
      [ids.movies]: "Movies: 10",
      [ids.shows]: "TV Shows: 4",
      [ids.episodes]: "Episodes: 80",
    })
  })

  it("does not rename a channel whose name did not change", async () => {
    config({ discordStatsLastNames: { [ids.streams]: "Current Streams: 2", [ids.movies]: "Movies: 10" } })
    const result = await runChannelStats("scheduled")
    expect(result).toMatchObject({ renamed: 5, unchanged: 2 })
    expect(renamed()[ids.streams]).toBeUndefined()
    expect(renamed()[ids.movies]).toBeUndefined()
  })

  it("renames a newly chosen channel even when the stat is unchanged", async () => {
    config({ discordStatsLastNames: { "999999999999999999": "Movies: 10" } })
    await runChannelStats("scheduled")
    expect(renamed()[ids.movies]).toBe("Movies: 10")
    expect(savedNames()).not.toHaveProperty("999999999999999999")
  })

  it("skips the activity channels when get_activity fails and reports Degraded", async () => {
    tautulliAnswers({ activityOk: false })
    const result = await runChannelStats("scheduled")
    expect(result?.status).toBe("degraded")
    expect(renamed()[ids.status]).toBe("MFlix Status (🟡)")
    expect(renamed()[ids.movies]).toBe("Movies: 10")
    for (const key of ["streams", "transcodes", "bandwidth"] as const) expect(renamed()[ids[key]]).toBeUndefined()
  })

  it("skips the library channels when get_libraries fails", async () => {
    tautulliAnswers({ librariesOk: false })
    const result = await runChannelStats("scheduled")
    expect(result?.status).toBe("degraded")
    for (const key of ["movies", "shows", "episodes"] as const) expect(renamed()[ids[key]]).toBeUndefined()
    expect(renamed()[ids.streams]).toBe("Current Streams: 2")
  })

  it("shows Offline and renames only the status channel when both calls fail", async () => {
    tautulliAnswers({ activityOk: false, librariesOk: false })
    const result = await runChannelStats("scheduled")
    expect(result?.status).toBe("offline")
    expect(renamed()).toEqual({ [ids.status]: "MFlix Status (🔴)" })
  })

  it("is offline without a Tautulli server", async () => {
    ;(getActiveService as unknown as jest.Mock).mockResolvedValue(null)
    const result = await runChannelStats("scheduled")
    expect(result?.status).toBe("offline")
    expect(tautulli).not.toHaveBeenCalled()
  })

  it("carries on to the next channel when one rename fails", async () => {
    rename.mockImplementation(async (_token: string, id: string) => (id === ids.streams ? { ok: false, code: "FAILED" } : { ok: true }))
    const result = await runChannelStats("scheduled")
    expect(result).toMatchObject({ renamed: 6, failed: 1 })
    expect(savedNames()).not.toHaveProperty(ids.streams)
    expect(savedNames()).toHaveProperty(ids.episodes)
  })

  it("counts a 429, keeps the old name for a retry, and goes on", async () => {
    rename.mockImplementation(async (_token: string, id: string) =>
      id === ids.status ? { ok: false, code: "RATE_LIMITED", retryAfterSec: 300, global: false } : { ok: true }
    )
    config({ discordStatsLastNames: { [ids.status]: "MFlix Status (🟡)" } })
    const result = await runChannelStats("scheduled")
    expect(result).toMatchObject({ rateLimited: 1, renamed: 6 })
    expect(savedNames()[ids.status]).toBe("MFlix Status (🟡)")
  })

  it("stops the run on a global 429", async () => {
    rename.mockResolvedValue({ ok: false, code: "RATE_LIMITED", retryAfterSec: 5, global: true })
    const result = await runChannelStats("scheduled")
    expect(result?.rateLimited).toBe(1)
    expect(rename).toHaveBeenCalledTimes(1)
  })

  it("leaves unassigned channels alone", async () => {
    config({ discordStatsChannels: { movies: { channelId: ids.movies, format: "Films: {value}" } } })
    await runChannelStats("scheduled")
    expect(renamed()).toEqual({ [ids.movies]: "Films: 10" })
  })

  it("does not rename without a bot token", async () => {
    ;(getDiscordBotToken as jest.Mock).mockResolvedValue(undefined)
    const result = await runChannelStats("scheduled")
    expect(result?.skipped).toBe("No Discord bot token")
    expect(rename).not.toHaveBeenCalled()
  })
})
