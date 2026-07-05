/**
 * Tests for the `/mymarks [type]` slash command (Step 20).
 *
 * discord.js is stubbed (jsdom can't load the @discordjs/rest → undici stack);
 * the builders record just enough state for assertions (name/description,
 * string-option name + choices). Prisma is mocked so the query is exercised
 * without a database — and, critically, we assert the `where` clause is scoped
 * to the *resolved* user id (never a NextAuth session).
 */

jest.mock("discord.js", () => {
  class SlashCommandStringOption {
    name = ""
    description = ""
    required = false
    choices: { name: string; value: string }[] = []
    setName(name: string) {
      this.name = name
      return this
    }
    setDescription(description: string) {
      this.description = description
      return this
    }
    setRequired(required: boolean) {
      this.required = required
      return this
    }
    addChoices(...choices: { name: string; value: string }[]) {
      this.choices.push(...choices.flat())
      return this
    }
  }
  class SlashCommandBuilder {
    name = ""
    description = ""
    options: SlashCommandStringOption[] = []
    setName(name: string) {
      this.name = name
      return this
    }
    setDescription(description: string) {
      this.description = description
      return this
    }
    addStringOption(fn: (o: SlashCommandStringOption) => SlashCommandStringOption) {
      this.options.push(fn(new SlashCommandStringOption()))
      return this
    }
  }
  class EmbedBuilder {
    data: {
      title?: string
      description?: string
      fields: { name: string; value: string }[]
    } = { fields: [] }
    setTitle(title: string) {
      this.data.title = title
      return this
    }
    setDescription(description: string) {
      this.data.description = description
      return this
    }
    addFields(...fields: { name: string; value: string }[]) {
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

jest.mock("@/lib/prisma", () => ({
  prisma: {
    userMediaMark: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))

import { myMarksCommand } from "../mymarks"
import { prisma } from "@/lib/prisma"
import { MarkType } from "@/lib/generated/prisma/client"
import type { InteractionContext } from "../registry"
import type { VerifyDiscordUserResult } from "@/lib/discord/services"

const findMany = prisma.userMediaMark.findMany as jest.Mock
const count = prisma.userMediaMark.count as jest.Mock

const RESOLVED_USER_ID = "resolved-user-1"

const linkedUser: VerifyDiscordUserResult = {
  linked: true,
  entitled: true,
  user: {
    id: RESOLVED_USER_ID,
    name: "Test User",
    email: "t@example.com",
    plexUserId: "plex-1",
    isAdmin: false,
  },
}

interface MockMark {
  id: string
  title: string
  year: number | null
  markType: MarkType
  mediaType: string
  seasonNumber: number | null
  episodeNumber: number | null
  markedAt: Date
}

function makeMark(overrides: Partial<MockMark> = {}): MockMark {
  return {
    id: `mark-${Math.random()}`,
    title: "The Office",
    year: 2005,
    markType: MarkType.FINISHED_WATCHING,
    mediaType: "tv",
    seasonNumber: null,
    episodeNumber: null,
    markedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  }
}

interface MockCtxOptions {
  type?: string | null
  linked?: boolean
}

function createMockContext(options: MockCtxOptions = {}): {
  ctx: InteractionContext
  reply: jest.Mock
  deferReply: jest.Mock
  editReply: jest.Mock
} {
  const reply = jest.fn().mockResolvedValue(undefined)
  const deferReply = jest.fn().mockResolvedValue(undefined)
  const editReply = jest.fn().mockResolvedValue(undefined)

  const interaction = {
    channelId: "channel-1",
    options: {
      getString: (_name: string) => options.type ?? null,
    },
    reply,
    deferReply,
    editReply,
  }

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

function firstEmbedData(mock: jest.Mock): {
  title?: string
  description?: string
  fields: { name: string; value: string }[]
} {
  const call = mock.mock.calls[0][0]
  return (call.embeds[0] as { data: ReturnType<typeof firstEmbedData> }).data
}

beforeEach(() => {
  jest.clearAllMocks()
  findMany.mockResolvedValue([])
  count.mockResolvedValue(0)
})

describe("myMarksCommand.data", () => {
  it("registers as /mymarks", () => {
    expect(myMarksCommand.data.name).toBe("mymarks")
    expect(myMarksCommand.data.description).toBeTruthy()
  })

  it("uses the MEDIA_MARK audit type", () => {
    expect(myMarksCommand.commandType).toBe("MEDIA_MARK")
  })

  it("exposes an optional `type` picker with a choice per MarkType", () => {
    const option = (
      myMarksCommand.data as unknown as {
        options: {
          name: string
          required: boolean
          choices: { name: string; value: string }[]
        }[]
      }
    ).options[0]
    expect(option.name).toBe("type")
    expect(option.required).toBe(false)
    const values = option.choices.map((c) => c.value).sort()
    expect(values).toEqual(
      [
        MarkType.FINISHED_WATCHING,
        MarkType.KEEP_FOREVER,
        MarkType.NOT_INTERESTED,
        MarkType.POOR_QUALITY,
        MarkType.REWATCH_CANDIDATE,
      ].sort()
    )
  })
})

describe("myMarksCommand.handle — unlinked", () => {
  it("nudges an unlinked user ephemerally and never queries", async () => {
    const { ctx, reply } = createMockContext({ linked: false })

    await myMarksCommand.handle(ctx)

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("link your account"),
        flags: 64,
      })
    )
    expect(findMany).not.toHaveBeenCalled()
  })
})

describe("myMarksCommand.handle — query scoping", () => {
  it("scopes the query to the resolved user id (not a session) ordered by markedAt desc", async () => {
    const { ctx } = createMockContext()

    await myMarksCommand.handle(ctx)

    expect(findMany).toHaveBeenCalledTimes(1)
    const arg = findMany.mock.calls[0][0]
    expect(arg.where).toEqual({ userId: RESOLVED_USER_ID })
    expect(arg.where).not.toHaveProperty("markType")
    expect(arg.orderBy).toEqual({ markedAt: "desc" })
  })

  it("adds a markType filter when a type is provided", async () => {
    const { ctx } = createMockContext({ type: MarkType.KEEP_FOREVER })

    await myMarksCommand.handle(ctx)

    const arg = findMany.mock.calls[0][0]
    expect(arg.where).toEqual({
      userId: RESOLVED_USER_ID,
      markType: MarkType.KEEP_FOREVER,
    })
  })
})

describe("myMarksCommand.handle — rendering", () => {
  it("renders an ephemeral embed grouped by mark type with title (year)", async () => {
    findMany.mockResolvedValue([
      makeMark({ title: "The Office", year: 2005, markType: MarkType.FINISHED_WATCHING }),
      makeMark({ title: "Seinfeld", year: 1989, markType: MarkType.KEEP_FOREVER }),
      makeMark({ title: "Friends", year: 1994, markType: MarkType.FINISHED_WATCHING }),
    ])
    count.mockResolvedValue(3)
    const { ctx, deferReply, editReply } = createMockContext()

    await myMarksCommand.handle(ctx)

    expect(deferReply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }))
    const embed = firstEmbedData(editReply)

    // One field per non-empty mark-type group (field names carry a count suffix).
    const fieldNames = embed.fields.map((f) => f.name).join(" | ")
    expect(fieldNames).toContain("Finished Watching")
    expect(fieldNames).toContain("Keep Forever")

    const allValues = embed.fields.map((f) => f.value).join("\n")
    expect(allValues).toContain("The Office (2005)")
    expect(allValues).toContain("Seinfeld (1989)")
    expect(allValues).toContain("Friends (1994)")
  })

  it("shows an empty-state message when the user has no marks", async () => {
    findMany.mockResolvedValue([])
    const { ctx, editReply } = createMockContext()

    await myMarksCommand.handle(ctx)

    const editArg = editReply.mock.calls[0][0]
    expect(editArg.content).toMatch(/haven't marked anything/i)
    expect(editArg.embeds ?? []).toHaveLength(0)
  })

  it("shows a filtered empty-state message when a type filter yields nothing", async () => {
    findMany.mockResolvedValue([])
    const { ctx, editReply } = createMockContext({ type: MarkType.POOR_QUALITY })

    await myMarksCommand.handle(ctx)

    const editArg = editReply.mock.calls[0][0]
    expect(editArg.content).toMatch(/no marks/i)
  })

  it("respects Discord embed structural limits and notes truncation for large sets", async () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      makeMark({ id: `m-${i}`, title: `Title ${i}`, year: 2000 + (i % 20) })
    )
    // The query is bounded (take: 100) but count reports the true total, so the
    // "showing N of M" note reflects the real 500.
    findMany.mockResolvedValue(many.slice(0, 100))
    count.mockResolvedValue(500)
    const { ctx, editReply } = createMockContext()

    await myMarksCommand.handle(ctx)

    const embed = firstEmbedData(editReply)
    expect(embed.fields.length).toBeLessThanOrEqual(25)
    let total = (embed.title?.length ?? 0) + (embed.description?.length ?? 0)
    for (const field of embed.fields) {
      expect(field.name.length).toBeLessThanOrEqual(256)
      expect(field.value.length).toBeLessThanOrEqual(1024)
      total += field.name.length + field.value.length
    }
    expect(total).toBeLessThanOrEqual(6000)

    // A "showing N of M" note tells the user the list was capped.
    const haystack =
      (embed.description ?? "") + embed.fields.map((f) => f.value).join("\n")
    expect(haystack).toMatch(/showing \d+ of \d+/i)
  })

  it("includes a season/episode descriptor for episodes", async () => {
    findMany.mockResolvedValue([
      makeMark({
        title: "Pilot",
        year: 2005,
        mediaType: "episode",
        seasonNumber: 1,
        episodeNumber: 1,
        markType: MarkType.FINISHED_WATCHING,
      }),
    ])
    count.mockResolvedValue(1)
    const { ctx, editReply } = createMockContext()

    await myMarksCommand.handle(ctx)

    const embed = firstEmbedData(editReply)
    const allValues = embed.fields.map((f) => f.value).join("\n")
    expect(allValues).toContain("S1E1")
  })
})
