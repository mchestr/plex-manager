/**
 * Tests for the `/mystats` slash command (Step 21).
 *
 * discord.js is stubbed (jsdom can't load the @discordjs/rest → undici stack);
 * the builders record just enough state for assertions, and a fake EmbedBuilder
 * captures the title/fields the command sets. The Tautulli statistics fetch and
 * the active-server loader (`prisma.tautulli.findFirst`) are mocked so every
 * branch is exercised without a live gateway or database.
 */

jest.mock("discord.js", () => {
  class SlashCommandBuilder {
    name = ""
    description = ""
    setName(name: string) {
      this.name = name
      return this
    }
    setDescription(description: string) {
      this.description = description
      return this
    }
  }
  class EmbedBuilder {
    data: {
      title?: string
      description?: string
      fields: { name: string; value: string; inline?: boolean }[]
    } = { fields: [] }
    setTitle(title: string) {
      this.data.title = title
      return this
    }
    setDescription(description: string) {
      this.data.description = description
      return this
    }
    setColor(_color: unknown) {
      return this
    }
    setFooter(_footer: unknown) {
      return this
    }
    addFields(...fields: { name: string; value: string; inline?: boolean }[]) {
      this.data.fields.push(...fields.flat())
      return this
    }
  }
  return {
    MessageFlags: { Ephemeral: 64 },
    SlashCommandBuilder,
    EmbedBuilder,
  }
})

jest.mock("@/lib/wrapped/statistics", () => ({
  fetchTautulliStatistics: jest.fn(),
}))
jest.mock("@/lib/prisma", () => ({
  prisma: {
    tautulli: {
      findFirst: jest.fn(),
    },
  },
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))
// Spy on the backstop scrubber without replacing its real redaction behaviour.
jest.mock("@/lib/discord/chat-safety", () => {
  const actual = jest.requireActual("@/lib/discord/chat-safety")
  return {
    ...actual,
    sanitizeDiscordResponse: jest.fn(actual.sanitizeDiscordResponse),
  }
})

import { myStatsCommand } from "../mystats"
import { fetchTautulliStatistics } from "@/lib/wrapped/statistics"
import { prisma } from "@/lib/prisma"
import { sanitizeDiscordResponse } from "@/lib/discord/chat-safety"
import type { InteractionContext } from "../registry"
import type { VerifyDiscordUserResult } from "@/lib/discord/services"
import type { TautulliStatisticsData } from "@/lib/wrapped/statistics-types"

const mockFetch = fetchTautulliStatistics as jest.MockedFunction<
  typeof fetchTautulliStatistics
>
const mockFindFirst = prisma.tautulli.findFirst as jest.Mock
const mockSanitize = sanitizeDiscordResponse as jest.MockedFunction<
  typeof sanitizeDiscordResponse
>

const linkedUser: VerifyDiscordUserResult = {
  linked: true,
  entitled: true,
  user: {
    id: "user-1",
    name: "Test User",
    email: "t@example.com",
    plexUserId: "plex-1",
    isAdmin: false,
  },
}

const sampleStats: TautulliStatisticsData = {
  tautulliUserId: "42",
  totalWatchTime: 125,
  moviesWatchTime: 60,
  showsWatchTime: 65,
  moviesWatched: 3,
  showsWatched: 2,
  episodesWatched: 7,
  topMovies: [{ title: "Inception", watchTime: 60, playCount: 1, year: 2010 }],
  topShows: [
    { title: "The Office", watchTime: 65, playCount: 7, episodesWatched: 7, year: 2005 },
  ],
  watchTimeByMonth: [],
  derived: {
    longestStreak: { days: 4, start: "2026-01-01", end: "2026-01-04" },
    peakHour: { hour: 21, label: "9 PM", plays: 12 },
    hourHistogram: new Array<number>(24).fill(0),
    dayOfWeekHistogram: [],
    mostActiveDay: { date: "2026-01-03", watchTime: 90 },
    weekendVsWeekday: { weekendPct: 40 },
  },
}

function emptyStats(): TautulliStatisticsData {
  return {
    ...sampleStats,
    totalWatchTime: 0,
    moviesWatchTime: 0,
    showsWatchTime: 0,
    moviesWatched: 0,
    showsWatched: 0,
    episodesWatched: 0,
    topMovies: [],
    topShows: [],
    derived: {
      longestStreak: null,
      peakHour: null,
      hourHistogram: new Array<number>(24).fill(0),
      dayOfWeekHistogram: [],
      mostActiveDay: null,
      weekendVsWeekday: { weekendPct: 0 },
    },
  }
}

interface EmbedShape {
  data: {
    title?: string
    description?: string
    fields: { name: string; value: string; inline?: boolean }[]
  }
}

function createMockContext(options: { linked?: boolean } = {}): {
  ctx: InteractionContext
  reply: jest.Mock
  deferReply: jest.Mock
  editReply: jest.Mock
} {
  const reply = jest.fn().mockResolvedValue(undefined)
  const deferReply = jest.fn().mockResolvedValue(undefined)
  const editReply = jest.fn().mockResolvedValue(undefined)

  const interaction = { channelId: "channel-1", reply, deferReply, editReply }

  const verifiedUser: VerifyDiscordUserResult =
    options.linked === false ? { linked: false, entitled: false } : linkedUser

  return {
    ctx: {
      interaction: interaction as unknown as InteractionContext["interaction"],
      verifiedUser,
      discordUserId: "discord-user-1",
      channelId: "channel-1",
    },
    reply,
    deferReply,
    editReply,
  }
}

/** Concatenate every embed field's value for substring assertions. */
function embedText(embed: EmbedShape): string {
  return [
    embed.data.title ?? "",
    embed.data.description ?? "",
    ...embed.data.fields.map((f) => `${f.name} ${f.value}`),
  ].join(" ")
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFindFirst.mockResolvedValue({ url: "http://tautulli", apiKey: "key" })
  mockFetch.mockResolvedValue({ success: true, data: sampleStats })
})

describe("myStatsCommand.data", () => {
  it("registers name 'mystats' with a description and no required options", () => {
    const data = myStatsCommand.data as unknown as {
      name: string
      description: string
    }
    expect(data.name).toBe("mystats")
    expect(data.description.length).toBeGreaterThan(0)
  })

  it("uses the CHAT audit type", () => {
    expect(myStatsCommand.commandType).toBe("CHAT")
  })
})

describe("myStatsCommand.handle", () => {
  it("nudges an unlinked user ephemerally and never fetches stats", async () => {
    const { ctx, reply, deferReply } = createMockContext({ linked: false })

    await myStatsCommand.handle(ctx)

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("link your account"),
        flags: 64,
      })
    )
    expect(deferReply).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("defers ephemerally before the slow Tautulli fetch (3s ack rule)", async () => {
    const { ctx, deferReply } = createMockContext()

    await myStatsCommand.handle(ctx)

    expect(deferReply).toHaveBeenCalledTimes(1)
    expect(deferReply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }))
  })

  it("resolves the user's Tautulli identity and renders the stats embed", async () => {
    const { ctx, editReply } = createMockContext()

    await myStatsCommand.handle(ctx)

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } })
    )
    expect(mockFetch).toHaveBeenCalledWith(
      { url: "http://tautulli", apiKey: "key" },
      "plex-1",
      "t@example.com",
      expect.any(Number)
    )

    const editArg = editReply.mock.calls[0][0]
    expect(editArg.embeds).toHaveLength(1)
    const text = embedText(editArg.embeds[0] as EmbedShape)
    // Humanized watch time (125 minutes → "2 hours, 5 minutes").
    expect(text).toContain("2 hours, 5 minutes")
    // Counts.
    expect(text).toContain("3")
    expect(text).toContain("7")
    // Top titles.
    expect(text).toContain("Inception")
    expect(text).toContain("The Office")
    // Derived stats.
    expect(text).toContain("9 PM")
    expect(text).toContain("4")
  })

  it("runs free-text embed fields through the sanitizer backstop", async () => {
    const { ctx } = createMockContext()

    await myStatsCommand.handle(ctx)

    expect(mockSanitize).toHaveBeenCalled()
  })

  it("shows an ephemeral error when no Tautulli server is configured", async () => {
    mockFindFirst.mockResolvedValue(null)
    const { ctx, editReply } = createMockContext()

    await myStatsCommand.handle(ctx)

    expect(mockFetch).not.toHaveBeenCalled()
    const editArg = editReply.mock.calls[0][0]
    expect(editArg.embeds).toBeUndefined()
    expect(editArg.content).toMatch(/not.*configured|no.*server/i)
  })

  it("shows a friendly 'no stats yet' message when there is no watch data", async () => {
    mockFetch.mockResolvedValue({ success: true, data: emptyStats() })
    const { ctx, editReply } = createMockContext()

    await myStatsCommand.handle(ctx)

    const editArg = editReply.mock.calls[0][0]
    expect(editArg.embeds).toBeUndefined()
    expect(editArg.content).toMatch(/(no|don't have any).*stats|haven't watched|nothing/i)
  })

  it("shows an ephemeral error (no internals leaked) when the fetch reports failure", async () => {
    mockFetch.mockResolvedValue({
      success: false,
      error: "User not found in Tautulli. Plex User ID: 123, Email: secret@x.com",
    })
    const { ctx, editReply } = createMockContext()

    await myStatsCommand.handle(ctx)

    const editArg = editReply.mock.calls[0][0]
    expect(editArg.embeds).toBeUndefined()
    expect(editArg.content).toMatch(/couldn't|could not|sorry|unable/i)
    // Must not leak the raw internal error.
    expect(editArg.content).not.toContain("secret@x.com")
    expect(editArg.content).not.toContain("Plex User ID")
  })

  it("shows an ephemeral error when the fetch throws", async () => {
    mockFetch.mockRejectedValue(new Error("boom"))
    const { ctx, editReply } = createMockContext()

    await myStatsCommand.handle(ctx)

    const editArg = editReply.mock.calls[0][0]
    expect(editArg.embeds).toBeUndefined()
    expect(editArg.content).toMatch(/couldn't|could not|sorry|unable/i)
    expect(editArg.content).not.toContain("boom")
  })
})
