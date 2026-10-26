import { channelsFromConfig, channelStatsSettingsSchema } from "../config"
import { DEFAULT_FORMATS, formatChannelName, isValidFormat, MAX_CHANNEL_NAME } from "../format"
import { STAT_KEYS } from "../stats"

describe("formatChannelName", () => {
  it("builds the Windmill names", () => {
    expect(formatChannelName(DEFAULT_FORMATS.status, { server: "MFlix", value: "🟢" })).toBe("MFlix Status (🟢)")
    expect(formatChannelName(DEFAULT_FORMATS.streams, { server: "MFlix", value: "4" })).toBe("Current Streams: 4")
    expect(formatChannelName(DEFAULT_FORMATS.bandwidth, { server: "MFlix", value: "12.5" })).toBe("Bandwidth: 12.5 Mbps")
    expect(formatChannelName(DEFAULT_FORMATS.shows, { server: "MFlix", value: "35" })).toBe("TV Shows: 35")
  })

  it("does not treat `$` patterns in a server name as replacements", () => {
    expect(formatChannelName("{server}: {value}", { server: "A$&B", value: "1" })).toBe("A$&B: 1")
  })

  it("cuts a name to Discord's limit", () => {
    expect(formatChannelName("{value}", { server: "", value: "x".repeat(300) })).toHaveLength(MAX_CHANNEL_NAME)
  })
})

describe("isValidFormat", () => {
  it("needs {value} and allows {server}", () => {
    expect(isValidFormat("Movies: {value}")).toBe(true)
    expect(isValidFormat("{server} Movies {value}")).toBe(true)
    expect(isValidFormat("Movies")).toBe(false)
    expect(isValidFormat("{server} Movies")).toBe(false)
  })

  it("rejects other placeholders", () => {
    expect(isValidFormat("{value} {count}")).toBe(false)
  })
})

describe("channel settings", () => {
  const channels = Object.fromEntries(STAT_KEYS.map((key) => [key, { channelId: "", format: DEFAULT_FORMATS[key] }]))

  it("accepts the defaults with no channel chosen", () => {
    expect(channelStatsSettingsSchema.safeParse({ enabled: true, intervalMinutes: 10, channels }).success).toBe(true)
  })

  it("keeps the interval at ten minutes or more", () => {
    expect(channelStatsSettingsSchema.safeParse({ enabled: true, intervalMinutes: 9, channels }).success).toBe(false)
  })

  it("needs a real channel id", () => {
    const bad = { ...channels, movies: { channelId: "abc", format: DEFAULT_FORMATS.movies } }
    expect(channelStatsSettingsSchema.safeParse({ enabled: true, intervalMinutes: 10, channels: bad }).success).toBe(false)
  })

  it("fills defaults for missing or invalid stored channels", () => {
    const stored = { movies: { channelId: "123456789012345678", format: "Films {value}" }, shows: { channelId: "nope", format: "x" } }
    const result = channelsFromConfig(stored)
    expect(result.movies).toEqual(stored.movies)
    expect(result.shows).toEqual({ channelId: "", format: DEFAULT_FORMATS.shows })
    expect(result.status).toEqual({ channelId: "", format: DEFAULT_FORMATS.status })
    expect(channelsFromConfig(null).episodes.format).toBe(DEFAULT_FORMATS.episodes)
  })
})
