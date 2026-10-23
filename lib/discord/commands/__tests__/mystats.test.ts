/**
 * @jest-environment node
 */

/**
 * Tests for the `/mystats` slash command (Step 21, P11.12).
 *
 * discord.js is stubbed; the builders record just enough state for
 * assertions, and a fake EmbedBuilder captures the title and fields the
 * command sets. The stats come from the real `getMemberYearStats` over the
 * typed Prisma mock, with Tautulli's `get_history` mocked, so the stored-facts
 * path, the bounded history read and the member's year are exercised end to
 * end.
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

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))
jest.mock("@/lib/connections/tautulli", () => ({
  ...jest.requireActual("@/lib/connections/tautulli"),
  tautulliCommand: jest.fn(),
}))
jest.mock("@/lib/utils/server-zone", () => ({ serverZone: jest.fn(async () => "America/Chicago") }))
// Spy on the backstop scrubber without replacing its real redaction behaviour.
jest.mock("@/lib/discord/chat-safety", () => {
  const actual = jest.requireActual("@/lib/discord/chat-safety")
  return {
    ...actual,
    sanitizeDiscordResponse: jest.fn(actual.sanitizeDiscordResponse),
  }
})

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { tautulliCommand } from "@/lib/connections/tautulli"
import { sanitizeDiscordResponse } from "@/lib/discord/chat-safety"
import { JELLYFIN_COPY } from "@/lib/discord/copy"
import type { VerifyDiscordUserResult } from "@/lib/discord/services"
import { MAX_HISTORY_PAGES } from "@/lib/discord/stats/member-stats"
import { minimalV3 } from "@/lib/wrapped/data/__tests__/v3-row"

import { myStatsCommand } from "../mystats"
import type { InteractionContext } from "../registry"

const mockCommand = tautulliCommand as jest.Mock
const mockSanitize = sanitizeDiscordResponse as jest.MockedFunction<typeof sanitizeDiscordResponse>

type LinkedUser = NonNullable<VerifyDiscordUserResult["user"]>

const linkedUser: LinkedUser = {
  id: "user-1",
  name: "Test User",
  email: "t@example.com",
  plexUserId: "plex-1",
  jellyfinUserId: null,
  primaryAuthService: "plex",
  services: ["plex"],
  timezone: null,
  isAdmin: false,
}

const STARTED = Date.parse("2026-03-02T03:00:00Z") / 1000 // 9 PM on 1 March in Chicago

/** A Tautulli `get_history` row. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 1,
    started: STARTED,
    stopped: STARTED + 3600,
    play_duration: 3600,
    paused_counter: 0,
    percent_complete: 100,
    watched_status: 1,
    transcode_decision: "direct play",
    location: "lan",
    platform: "Apple TV",
    product: "Plex for Apple TV",
    live: 0,
    media_type: "movie",
    rating_key: "5001",
    grandparent_rating_key: "",
    parent_media_index: "",
    media_index: "",
    title: "Inception",
    grandparent_title: "",
    year: 2010,
    originally_available_at: "2010-07-16",
    guid: "plex://movie/5001",
    section_id: "1",
    ...overrides,
  }
}

const SAMPLE_ROWS = [
  row(),
  row({
    started: STARTED + 86_400,
    stopped: STARTED + 86_400 + 3900,
    play_duration: 3900,
    media_type: "episode",
    rating_key: "9001",
    grandparent_rating_key: "900",
    parent_media_index: 1,
    media_index: 1,
    title: "Pilot",
    grandparent_title: "The Office",
    year: 2005,
    guid: "plex://episode/9001",
    section_id: "2",
  }),
]

/** Every page answers with `rows` and claims `total` rows in all. */
function historyPages(rows: readonly unknown[], total = rows.length) {
  mockCommand.mockResolvedValue({ ok: true, data: { recordsFiltered: total, data: rows } })
}

interface EmbedShape {
  data: {
    title?: string
    description?: string
    fields: { name: string; value: string; inline?: boolean }[]
  }
}

/** Each context gets its own member, so the per-member limit only counts within a test. */
let memberCount = 0

function createMockContext(options: { linked?: boolean; userId?: string; user?: Partial<LinkedUser> } = {}) {
  const reply = jest.fn().mockResolvedValue(undefined)
  const deferReply = jest.fn().mockResolvedValue(undefined)
  const editReply = jest.fn().mockResolvedValue(undefined)

  const interaction = { channelId: "channel-1", reply, deferReply, editReply }

  const userId = options.userId ?? `user-${++memberCount}`
  const verifiedUser: VerifyDiscordUserResult =
    options.linked === false
      ? { linked: false, entitled: false }
      : { linked: true, entitled: true, user: { ...linkedUser, id: userId, ...options.user } }

  const ctx: InteractionContext = {
    interaction: interaction as unknown as InteractionContext["interaction"],
    verifiedUser,
    discordUserId: "discord-user-1",
    channelId: "channel-1",
  }
  return { ctx, reply, deferReply, editReply }
}

/** Concatenate every embed field's value for substring assertions. */
function embedText(embed: EmbedShape): string {
  return [embed.data.title ?? "", embed.data.description ?? "", ...embed.data.fields.map((f) => `${f.name} ${f.value}`)].join(" ")
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.restoreAllMocks()
  prismaMock.user.findUnique.mockResolvedValue({ plexUserId: "plex-1", rewindExclusions: [] } as never)
  prismaMock.plexWrapped.findUnique.mockResolvedValue(null)
  prismaMock.tautulli.findFirst.mockResolvedValue({ url: "http://tautulli", apiKey: "key" } as never)
  prismaMock.config.findUnique.mockResolvedValue(null)
  historyPages(SAMPLE_ROWS)
})

describe("myStatsCommand.data", () => {
  it("registers name 'mystats' with a description and no required options", () => {
    const data = myStatsCommand.data as unknown as { name: string; description: string }
    expect(data.name).toBe("mystats")
    expect(data.description.length).toBeGreaterThan(0)
  })

  it("uses the CHAT audit type", () => {
    expect(myStatsCommand.commandType).toBe("CHAT")
  })
})

describe("myStatsCommand.handle", () => {
  it("nudges an unlinked user ephemerally and never reads stats", async () => {
    const { ctx, reply, deferReply } = createMockContext({ linked: false })

    await myStatsCommand.handle(ctx)

    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("link your account"), flags: 64 }))
    expect(deferReply).not.toHaveBeenCalled()
    expect(mockCommand).not.toHaveBeenCalled()
  })

  it("tells a Jellyfin-only member why stats are unavailable", async () => {
    const { ctx, reply, deferReply } = createMockContext({
      user: { plexUserId: null, jellyfinUserId: "jf-1", primaryAuthService: "jellyfin", services: ["jellyfin"] },
    })

    await myStatsCommand.handle(ctx)

    expect(reply).toHaveBeenCalledWith({ content: JELLYFIN_COPY.mystats, flags: 64 })
    expect(deferReply).not.toHaveBeenCalled()
    expect(prismaMock.plexWrapped.findUnique).not.toHaveBeenCalled()
  })

  it("defers ephemerally before the slow read (3s ack rule)", async () => {
    const { ctx, deferReply } = createMockContext()

    await myStatsCommand.handle(ctx)

    expect(deferReply).toHaveBeenCalledTimes(1)
    expect(deferReply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }))
  })

  it("answers from a completed v3 Rewind with no Tautulli call", async () => {
    const facts = {
      "time.totalMinutes": { value: 78420, display: "78,420 minutes", unit: "duration" },
      "counts.films": { value: 112, display: "112", unit: "count" },
      "series[1].title": { value: "Severance", display: "Severance", unit: "title" },
      "hours.peak": { value: 22, display: "10 PM", unit: "hour" },
      "streak.longest.days": { value: 23, display: "23 days", unit: "days" },
    }
    prismaMock.plexWrapped.findUnique.mockResolvedValue({
      status: "completed",
      data: JSON.stringify({ ...minimalV3(), facts }),
    } as never)
    const { ctx, editReply } = createMockContext()

    await myStatsCommand.handle(ctx)

    expect(mockCommand).not.toHaveBeenCalled()
    const text = embedText(editReply.mock.calls[0][0].embeds[0] as EmbedShape)
    expect(text).toContain("1307 hours")
    expect(text).toContain("Severance")
    expect(text).toContain("10 PM")
    expect(text).toContain("23 days")
  })

  it("formats the peak hour in the app locale", async () => {
    prismaMock.config.findUnique.mockResolvedValue({ locale: "en-GB", rewindExcludedSectionIds: [] } as never)
    const { ctx, editReply } = createMockContext()

    await myStatsCommand.handle(ctx)

    const text = embedText(editReply.mock.calls[0][0].embeds[0] as EmbedShape)
    expect(text).toContain("21:00")
    expect(text).not.toContain("9 PM")
  })

  it("reads at most the member's year from the history and renders the embed", async () => {
    const { ctx, editReply } = createMockContext()

    await myStatsCommand.handle(ctx)

    expect(mockCommand).toHaveBeenCalledWith(
      { url: "http://tautulli", apiKey: "key" },
      "get_history",
      expect.objectContaining({ user_id: "plex-1", after: expect.any(String), before: expect.any(String) }),
      expect.anything(),
      expect.anything()
    )
    const text = embedText(editReply.mock.calls[0][0].embeds[0] as EmbedShape)
    expect(text).toContain("2 hours, 5 minutes")
    expect(text).toContain("Inception")
    expect(text).toContain("The Office")
    expect(text).toContain("9 PM")
    expect(text).toContain("2 days")
  })

  it(`stops after ${MAX_HISTORY_PAGES} pages with an error that leaks nothing`, async () => {
    historyPages(SAMPLE_ROWS, 1_000_000)
    const { ctx, editReply } = createMockContext()

    await myStatsCommand.handle(ctx)

    expect(mockCommand).toHaveBeenCalledTimes(MAX_HISTORY_PAGES)
    expect(editReply.mock.calls[0][0]).toEqual({ content: expect.stringMatching(/couldn't load your stats/) })
  })

  it("takes the year in the member's zone: 16:30 on 31 December in Los Angeles is still 2026", async () => {
    jest.spyOn(Date, "now").mockReturnValue(Date.parse("2027-01-01T00:30:00Z"))
    const { ctx } = createMockContext({ user: { timezone: "America/Los_Angeles" } })

    await myStatsCommand.handle(ctx)

    expect(prismaMock.plexWrapped.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_year: { userId: expect.any(String), year: 2026 } } })
    )
    expect(mockCommand).toHaveBeenCalledWith(
      expect.anything(),
      "get_history",
      expect.objectContaining({ after: "2025-12-31", before: "2027-01-01" }),
      expect.anything(),
      expect.anything()
    )
  })

  it("runs free-text embed fields through the sanitizer backstop", async () => {
    const { ctx } = createMockContext()

    await myStatsCommand.handle(ctx)

    expect(mockSanitize).toHaveBeenCalled()
  })

  it("shows an ephemeral error when no Tautulli server is configured", async () => {
    prismaMock.tautulli.findFirst.mockResolvedValue(null)
    const { ctx, editReply } = createMockContext()

    await myStatsCommand.handle(ctx)

    expect(mockCommand).not.toHaveBeenCalled()
    const editArg = editReply.mock.calls[0][0]
    expect(editArg.embeds).toBeUndefined()
    expect(editArg.content).toMatch(/not.*configured|no.*server/i)
  })

  it("shows a friendly 'no stats yet' message when there is no watch data", async () => {
    historyPages([])
    const { ctx, editReply } = createMockContext()

    await myStatsCommand.handle(ctx)

    const editArg = editReply.mock.calls[0][0]
    expect(editArg.embeds).toBeUndefined()
    expect(editArg.content).toMatch(/don't have any watch stats/)
  })

  it("shows an ephemeral error (no internals leaked) when Tautulli fails", async () => {
    mockCommand.mockResolvedValue({ ok: false, code: "HTTP_ERROR", status: 500 })
    const { ctx, editReply } = createMockContext()

    await myStatsCommand.handle(ctx)

    const editArg = editReply.mock.calls[0][0]
    expect(editArg.embeds).toBeUndefined()
    expect(editArg.content).toMatch(/couldn't load your stats/)
    expect(editArg.content).not.toContain("HTTP_ERROR")
  })
})

describe("myStatsCommand rate limit (P4.20)", () => {
  it("refuses the sixth call in an hour, before deferring or reading", async () => {
    for (let i = 0; i < 5; i++) {
      const { ctx, editReply } = createMockContext({ userId: "stats-fan" })
      await myStatsCommand.handle(ctx)
      expect(editReply.mock.calls[0][0].embeds).toHaveLength(1)
    }
    mockCommand.mockClear()

    const { ctx, reply, deferReply } = createMockContext({ userId: "stats-fan" })
    await myStatsCommand.handle(ctx)

    expect(reply).toHaveBeenCalledWith({
      content: expect.stringMatching(/You can look again in \d+ (hour|minute)s?\.$/),
      flags: 64,
    })
    expect(deferReply).not.toHaveBeenCalled()
    expect(mockCommand).not.toHaveBeenCalled()
  })

  it("counts each member separately", async () => {
    for (let i = 0; i < 5; i++) {
      await myStatsCommand.handle(createMockContext({ userId: "member-a" }).ctx)
    }
    const { ctx, editReply } = createMockContext({ userId: "member-b" })

    await myStatsCommand.handle(ctx)

    expect(editReply.mock.calls[0][0].embeds).toHaveLength(1)
  })
})
