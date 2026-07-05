/**
 * Tests for the `/watching` slash command (Step 22).
 *
 * discord.js is stubbed (jsdom can't load the @discordjs/rest → undici stack);
 * the builders record just enough state for assertions. `getPlexSessions` and
 * the active-server config loader are mocked so the command is exercised without
 * a live Plex server or database.
 *
 * The command scopes sessions to the caller's own `plexUserId` (mirroring the
 * `get_plex_sessions` executor's Discord scoping), so the tests assert that
 * another viewer's session is filtered out.
 */

jest.mock("discord.js", () => {
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

  return {
    MessageFlags: { Ephemeral: 64 },
    EmbedBuilder,
    SlashCommandBuilder,
  }
})

jest.mock("@/lib/connections/plex", () => ({
  getPlexSessions: jest.fn(),
}))
jest.mock("@/lib/connections/plex-config", () => ({
  getActivePlexServerConfig: jest.fn(),
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))

import { watchingCommand } from "../watching"
import { getPlexSessions } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import type { InteractionContext } from "../registry"
import type { VerifyDiscordUserResult } from "@/lib/discord/services"

const mockGetSessions = getPlexSessions as jest.MockedFunction<typeof getPlexSessions>
const mockGetConfig = getActivePlexServerConfig as jest.MockedFunction<
  typeof getActivePlexServerConfig
>

const PLEX_USER_ID = "plex-1"

const linkedUser: VerifyDiscordUserResult = {
  linked: true,
  user: {
    id: "user-1",
    name: "Test User",
    email: "t@example.com",
    plexUserId: PLEX_USER_ID,
    isAdmin: false,
  },
}

const activeConfig = {
  name: "Home",
  url: "https://plex.local:32400",
  token: "tok",
  adminPlexUserId: null,
}

/** A session belonging to the caller (an episode, transcoding). */
const myEpisodeSession = {
  type: "episode",
  title: "Pilot",
  grandparentTitle: "The Office",
  parentIndex: 1,
  index: 1,
  duration: 1_500_000,
  viewOffset: 750_000,
  User: { id: PLEX_USER_ID, title: "Test User" },
  Player: { product: "Plex Web", platform: "Chrome", device: "Chrome", state: "playing" },
  Session: { location: "lan", transcodeDecision: "transcode" },
  Media: [{ videoResolution: "1080" }],
}

/** A session belonging to somebody else — must be filtered out. */
const otherUserSession = {
  type: "movie",
  title: "Someone Else's Movie",
  duration: 7_200_000,
  viewOffset: 3_600_000,
  User: { id: "plex-999", title: "Other Person" },
  Player: { product: "Roku", platform: "Roku", state: "playing" },
  Session: { location: "wan" },
}

function createMockContext(
  options: { linked?: boolean } = {}
): {
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

beforeEach(() => {
  jest.clearAllMocks()
  mockGetConfig.mockResolvedValue(activeConfig)
  mockGetSessions.mockResolvedValue({
    success: true,
    data: { MediaContainer: { size: 2, Metadata: [myEpisodeSession, otherUserSession] } },
  })
})

describe("watchingCommand.data", () => {
  it("registers name 'watching' with a description and no options", () => {
    const data = watchingCommand.data as unknown as {
      name: string
      description: string
    }
    expect(data.name).toBe("watching")
    expect(data.description.length).toBeGreaterThan(0)
  })

  it("uses the CHAT audit type", () => {
    expect(watchingCommand.commandType).toBe("CHAT")
  })
})

describe("watchingCommand.handle", () => {
  it("nudges an unlinked user ephemerally and never fetches sessions", async () => {
    const { ctx, reply } = createMockContext({ linked: false })

    await watchingCommand.handle(ctx)

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("link your account"),
        flags: 64,
      })
    )
    expect(mockGetSessions).not.toHaveBeenCalled()
  })

  it("defers ephemerally before fetching (slow server call)", async () => {
    const { ctx, deferReply } = createMockContext()

    await watchingCommand.handle(ctx)

    expect(deferReply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }))
  })

  it("shows only the caller's own session and filters out other viewers", async () => {
    const { ctx, editReply } = createMockContext()

    await watchingCommand.handle(ctx)

    const editArg = editReply.mock.calls[0][0]
    const embed = editArg.embeds[0] as {
      data: { fields: { name: string; value: string }[]; description?: string }
    }
    const rendered = JSON.stringify(embed.data)

    // Caller's own stream is present.
    expect(rendered).toContain("The Office")
    // Someone else's stream is filtered out.
    expect(rendered).not.toContain("Someone Else's Movie")
    expect(rendered).not.toContain("Other Person")
    // Exactly one stream field rendered.
    expect(embed.data.fields).toHaveLength(1)
  })

  it("renders player, progress, and quality/transcode detail for the stream", async () => {
    const { ctx, editReply } = createMockContext()

    await watchingCommand.handle(ctx)

    const embed = editReply.mock.calls[0][0].embeds[0] as {
      data: { fields: { name: string; value: string }[] }
    }
    const field = embed.data.fields[0]
    const value = field.value
    // Season/episode descriptor lives with the title.
    expect(`${field.name} ${value}`).toMatch(/S1E1|S01E01/)
    // Player / device.
    expect(value).toContain("Plex Web")
    // Progress percent (750000 / 1500000 = 50%).
    expect(value).toContain("50%")
    // Transcode / quality signal.
    expect(value.toLowerCase()).toMatch(/transcod/)
  })

  it("shows a friendly empty state when the caller is watching nothing", async () => {
    mockGetSessions.mockResolvedValue({
      success: true,
      data: { MediaContainer: { size: 1, Metadata: [otherUserSession] } },
    })
    const { ctx, editReply } = createMockContext()

    await watchingCommand.handle(ctx)

    const editArg = editReply.mock.calls[0][0]
    expect(editArg.content).toMatch(/not watching anything/i)
    expect(editArg.embeds).toBeUndefined()
  })

  it("shows an empty state when nobody is streaming at all", async () => {
    mockGetSessions.mockResolvedValue({
      success: true,
      data: { MediaContainer: { size: 0, Metadata: [] } },
    })
    const { ctx, editReply } = createMockContext()

    await watchingCommand.handle(ctx)

    expect(editReply.mock.calls[0][0].content).toMatch(/not watching anything/i)
  })

  it("edits with an ephemeral error when no Plex server is configured", async () => {
    mockGetConfig.mockResolvedValue(null)
    const { ctx, editReply } = createMockContext()

    await watchingCommand.handle(ctx)

    expect(mockGetSessions).not.toHaveBeenCalled()
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("No active Plex server") })
    )
  })

  it("edits with a friendly error when the session fetch fails", async () => {
    mockGetSessions.mockResolvedValue({ success: false, error: "boom" })
    const { ctx, editReply } = createMockContext()

    await watchingCommand.handle(ctx)

    expect(editReply.mock.calls[0][0].content).toMatch(/couldn't|failed|unable/i)
  })

  it("handles a single (non-array) session object for the caller", async () => {
    mockGetSessions.mockResolvedValue({
      success: true,
      data: { MediaContainer: { size: 1, Metadata: myEpisodeSession } },
    })
    const { ctx, editReply } = createMockContext()

    await watchingCommand.handle(ctx)

    const embed = editReply.mock.calls[0][0].embeds[0] as {
      data: { fields: { name: string; value: string }[] }
    }
    expect(embed.data.fields).toHaveLength(1)
    expect(JSON.stringify(embed.data)).toContain("The Office")
  })
})
