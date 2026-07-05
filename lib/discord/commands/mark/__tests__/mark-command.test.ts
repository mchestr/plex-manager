/**
 * Tests for the `/mark` slash command and its select-menu component handler.
 *
 * discord.js is stubbed (jsdom can't load the @discordjs/rest → undici stack);
 * the builders record just enough state for assertions. Plex search, applyMark,
 * the pending-store, plex-config, and services are all mocked so the flows are
 * exercised without a live gateway or database.
 */

jest.mock("discord.js", () => {
  class SlashCommandStringOption {
    name = ""
    description = ""
    required = false
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
  }
  class SlashCommandSubcommandBuilder {
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
  class SlashCommandBuilder {
    name = ""
    description = ""
    subcommands: SlashCommandSubcommandBuilder[] = []
    setName(name: string) {
      this.name = name
      return this
    }
    setDescription(description: string) {
      this.description = description
      return this
    }
    addSubcommand(fn: (s: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder) {
      this.subcommands.push(fn(new SlashCommandSubcommandBuilder()))
      return this
    }
  }
  class StringSelectMenuBuilder {
    data: { customId?: string; placeholder?: string; options: unknown[] } = { options: [] }
    setCustomId(id: string) {
      this.data.customId = id
      return this
    }
    setPlaceholder(p: string) {
      this.data.placeholder = p
      return this
    }
    addOptions(options: unknown[]) {
      this.data.options.push(...options)
      return this
    }
  }
  class ActionRowBuilder {
    components: unknown[] = []
    addComponents(...components: unknown[]) {
      this.components.push(...components.flat())
      return this
    }
  }
  return {
    MessageFlags: { Ephemeral: 64 },
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    ActionRowBuilder,
  }
})

jest.mock("crypto", () => ({
  randomUUID: () => "uuid-1234",
}))

jest.mock("@/lib/connections/plex", () => ({
  searchPlexMedia: jest.fn(),
}))
jest.mock("@/lib/connections/plex-config", () => ({
  getActivePlexServerConfig: jest.fn(),
}))
jest.mock("@/lib/discord/media/mark-media", () => ({
  applyMark: jest.fn(),
}))
jest.mock("../pending-store", () => ({
  createPendingSelection: jest.fn(),
  findByCustomId: jest.fn(),
  deleteById: jest.fn(),
}))
jest.mock("@/lib/discord/services", () => ({
  verifyDiscordUser: jest.fn(),
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))

import { markCommand, MARK_SUBCOMMANDS, MARK_SELECT_PREFIX } from "../index"
import { searchPlexMedia, type PlexMediaItem } from "@/lib/connections/plex"
import { getActivePlexServerConfig, type PlexServerConfig } from "@/lib/connections/plex-config"
import { applyMark } from "@/lib/discord/media/mark-media"
import { createPendingSelection, findByCustomId, deleteById } from "../pending-store"
import { verifyDiscordUser } from "@/lib/discord/services"
import { MarkType } from "@/lib/generated/prisma/client"
import type { InteractionContext } from "../registry"
import type { VerifyDiscordUserResult } from "@/lib/discord/services"

const mockSearch = searchPlexMedia as jest.MockedFunction<typeof searchPlexMedia>
const mockGetConfig = getActivePlexServerConfig as jest.MockedFunction<
  typeof getActivePlexServerConfig
>
const mockApplyMark = applyMark as jest.MockedFunction<typeof applyMark>
const mockCreatePending = createPendingSelection as jest.MockedFunction<
  typeof createPendingSelection
>
const mockFindByCustomId = findByCustomId as jest.MockedFunction<typeof findByCustomId>
const mockDeleteById = deleteById as jest.MockedFunction<typeof deleteById>
const mockVerify = verifyDiscordUser as jest.MockedFunction<typeof verifyDiscordUser>

const plexConfig: PlexServerConfig = {
  name: "Server",
  url: "http://plex.local:32400",
  token: "tok",
  adminPlexUserId: null,
}

const linkedUser: VerifyDiscordUserResult = {
  linked: true,
  user: {
    id: "user-1",
    name: "Test User",
    email: "t@example.com",
    plexUserId: "plex-1",
    isAdmin: false,
  },
}

function makeItem(overrides: Partial<PlexMediaItem> = {}): PlexMediaItem {
  return { ratingKey: "rk-1", title: "The Office", type: "show", year: 2005, ...overrides }
}

interface MockChatOptions {
  subcommand?: string
  title?: string
  linked?: boolean
}

function createMockContext(options: MockChatOptions = {}): {
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
      getSubcommand: () => options.subcommand ?? "finished",
      getString: (_name: string, _required?: boolean) => options.title ?? "The Office",
    },
    reply,
    deferReply,
    editReply,
  }

  const verifiedUser: VerifyDiscordUserResult =
    options.linked === false ? { linked: false } : linkedUser

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

function createMockSelectInteraction(options: { customId?: string; values?: string[] } = {}) {
  const update = jest.fn().mockResolvedValue(undefined)
  const interaction = {
    customId: options.customId ?? `${MARK_SELECT_PREFIX}uuid-1234`,
    values: options.values ?? ["0"],
    channelId: "channel-1",
    user: { id: "discord-user-1", tag: "testuser#1234" },
    update,
  }
  return { interaction: interaction as never, update }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetConfig.mockResolvedValue(plexConfig)
  mockVerify.mockResolvedValue(linkedUser)
})

describe("markCommand.data", () => {
  it("registers name 'mark' with five subcommands, each with a required title option", () => {
    const data = markCommand.data as unknown as {
      name: string
      subcommands: { name: string; options: { name: string; required: boolean }[] }[]
    }
    expect(data.name).toBe("mark")
    expect(data.subcommands.map((s) => s.name).sort()).toEqual(
      ["badquality", "finished", "keep", "notinterested", "rewatch"].sort()
    )
    for (const sub of data.subcommands) {
      expect(sub.options).toHaveLength(1)
      expect(sub.options[0]).toMatchObject({ name: "title", required: true })
    }
  })

  it("maps every subcommand to a MarkType", () => {
    expect(MARK_SUBCOMMANDS.finished).toBe(MarkType.FINISHED_WATCHING)
    expect(MARK_SUBCOMMANDS.keep).toBe(MarkType.KEEP_FOREVER)
    expect(MARK_SUBCOMMANDS.notinterested).toBe(MarkType.NOT_INTERESTED)
    expect(MARK_SUBCOMMANDS.rewatch).toBe(MarkType.REWATCH_CANDIDATE)
    expect(MARK_SUBCOMMANDS.badquality).toBe(MarkType.POOR_QUALITY)
  })

  it("declares a select-menu component handler under the SELECTION audit type", () => {
    expect(markCommand.components).toHaveLength(1)
    expect(markCommand.components?.[0].customIdPrefix).toBe(MARK_SELECT_PREFIX)
    expect(markCommand.components?.[0].commandType).toBe("SELECTION")
  })
})

describe("markCommand.handle", () => {
  it("nudges an unlinked user ephemerally and never searches", async () => {
    const { ctx, reply } = createMockContext({ linked: false })

    await markCommand.handle(ctx)

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("link your account"),
        flags: 64,
      })
    )
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it("errors ephemerally when no active Plex server is configured", async () => {
    mockGetConfig.mockResolvedValue(null)
    const { ctx, deferReply, editReply } = createMockContext()

    await markCommand.handle(ctx)

    expect(deferReply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }))
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("No active Plex server") })
    )
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it("reports no matches when the search returns zero results", async () => {
    mockSearch.mockResolvedValue({ success: true, data: [] })
    const { ctx, editReply } = createMockContext({ title: "Nonexistent" })

    await markCommand.handle(ctx)

    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("No media found") })
    )
    expect(mockApplyMark).not.toHaveBeenCalled()
  })

  it("marks directly and confirms on a single result", async () => {
    const item = makeItem()
    mockSearch.mockResolvedValue({ success: true, data: [item] })
    mockApplyMark.mockResolvedValue({ ok: true, mediaType: "TV_SERIES" as never, watchedSynced: true })
    const { ctx, editReply } = createMockContext({ subcommand: "finished" })

    await markCommand.handle(ctx)

    expect(mockApplyMark).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        item,
        markType: MarkType.FINISHED_WATCHING,
        markedVia: "discord",
        plexConfig,
        channelId: "channel-1",
      })
    )
    expect(mockCreatePending).not.toHaveBeenCalled()
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("marked as watched in Plex"),
      })
    )
  })

  it("renders an unsupported-media-type error for a single unsupported result", async () => {
    const item = makeItem({ type: "artist" })
    mockSearch.mockResolvedValue({ success: true, data: [item] })
    mockApplyMark.mockResolvedValue({
      ok: false,
      reason: "unsupported_media_type",
      mediaType: "artist",
    })
    const { ctx, editReply } = createMockContext()

    await markCommand.handle(ctx)

    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Unsupported media type") })
    )
  })

  it("persists a pending selection and replies with a select menu on multiple results", async () => {
    const items = [makeItem({ ratingKey: "rk-1" }), makeItem({ ratingKey: "rk-2", title: "Parks" })]
    mockSearch.mockResolvedValue({ success: true, data: items })
    mockCreatePending.mockResolvedValue({} as never)
    const { ctx, editReply } = createMockContext({ subcommand: "keep" })

    await markCommand.handle(ctx)

    expect(mockApplyMark).not.toHaveBeenCalled()
    expect(mockCreatePending).toHaveBeenCalledWith(
      expect.objectContaining({
        discordUserId: "discord-user-1",
        channelId: "channel-1",
        customId: `${MARK_SELECT_PREFIX}uuid-1234`,
        markType: MarkType.KEEP_FOREVER,
        results: items,
      })
    )
    const editArg = editReply.mock.calls[0][0]
    expect(editArg.content).toContain("Found multiple matches")
    expect(editArg.components).toHaveLength(1)
    // The select menu carries the same customId we persisted.
    const menu = editArg.components[0].components[0]
    expect(menu.data.customId).toBe(`${MARK_SELECT_PREFIX}uuid-1234`)
    expect(menu.data.options).toHaveLength(2)
  })

  it("surfaces a search failure ephemerally", async () => {
    mockSearch.mockResolvedValue({ success: false, error: "boom" })
    const { ctx, editReply } = createMockContext()

    await markCommand.handle(ctx)

    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Failed to search") })
    )
  })
})

describe("select-menu component handler", () => {
  const handleSelect = () => markCommand.components![0].handle

  it("resolves the pending selection, applies the mark, updates the menu, and deletes the row", async () => {
    const item = makeItem()
    mockFindByCustomId.mockResolvedValue({
      id: "pending-1",
      discordUserId: "discord-user-1",
      channelId: "channel-1",
      customId: `${MARK_SELECT_PREFIX}uuid-1234`,
      markType: MarkType.NOT_INTERESTED,
      results: [item],
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    })
    mockApplyMark.mockResolvedValue({ ok: true, mediaType: "TV_SERIES" as never, watchedSynced: false })
    const { interaction, update } = createMockSelectInteraction({ values: ["0"] })

    await handleSelect()(interaction)

    expect(mockFindByCustomId).toHaveBeenCalledWith(`${MARK_SELECT_PREFIX}uuid-1234`)
    expect(mockApplyMark).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        item,
        markType: MarkType.NOT_INTERESTED,
        markedVia: "discord",
      })
    )
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Not Interested"),
        components: [],
      })
    )
    expect(mockDeleteById).toHaveBeenCalledWith("pending-1")
  })

  it("shows an expired notice when the pending selection is gone", async () => {
    mockFindByCustomId.mockResolvedValue(null)
    const { interaction, update } = createMockSelectInteraction()

    await handleSelect()(interaction)

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("expired"),
        components: [],
      })
    )
    expect(mockApplyMark).not.toHaveBeenCalled()
    expect(mockDeleteById).not.toHaveBeenCalled()
  })

  it("rejects a selection clicked by a different user", async () => {
    mockFindByCustomId.mockResolvedValue({
      id: "pending-1",
      discordUserId: "someone-else",
      channelId: "channel-1",
      customId: `${MARK_SELECT_PREFIX}uuid-1234`,
      markType: MarkType.KEEP_FOREVER,
      results: [makeItem()],
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    })
    const { interaction, update } = createMockSelectInteraction()

    await handleSelect()(interaction)

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("someone else") })
    )
    expect(mockApplyMark).not.toHaveBeenCalled()
  })

  it("checks ownership before the index path (non-owner cannot delete another user's pending)", async () => {
    mockFindByCustomId.mockResolvedValue({
      id: "pending-1",
      discordUserId: "someone-else",
      channelId: "channel-1",
      customId: `${MARK_SELECT_PREFIX}uuid-1234`,
      markType: MarkType.KEEP_FOREVER,
      results: [makeItem()],
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    })
    // Out-of-range index: if the index lookup ran first it would delete the
    // pending row. Ownership must be checked first, so deleteById never runs.
    const { interaction, update } = createMockSelectInteraction({ values: ["99"] })

    await handleSelect()(interaction)

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("someone else") })
    )
    expect(mockApplyMark).not.toHaveBeenCalled()
    expect(mockDeleteById).not.toHaveBeenCalled()
  })
})
