import { type Message } from "discord.js"
import { handleMarkCommand, handleSelectionResponse, MARK_COMMANDS } from "../media-marking"
import { verifyDiscordUser } from "@/lib/discord/services"
import { searchPlexMedia, markPlexItemWatched, type PlexMediaItem } from "@/lib/connections/plex"
import { prisma } from "@/lib/prisma"
import { getActivePlexService } from "@/lib/services/service-helpers"
import { MarkType, MediaType } from "@/lib/generated/prisma/client"

// Mock dependencies
jest.mock("@/lib/discord/services")
jest.mock("@/lib/connections/plex")
jest.mock("@/lib/services/service-helpers", () => ({
  getActivePlexService: jest.fn(),
}))
jest.mock("@/lib/prisma", () => ({
  prisma: {
    userMediaMark: {
      upsert: jest.fn(),
    },
  },
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }),
}))

// Mock Discord.js Message
function createMockMessage(overrides: Partial<Message> = {}): Message {
  const mockReply = jest.fn().mockResolvedValue({})
  const mockChannel = {
    sendTyping: jest.fn().mockResolvedValue(undefined),
    id: "test-channel-id",
  }

  return {
    author: {
      id: "test-user-id",
      username: "testuser",
      discriminator: "1234",
      bot: false,
      system: false,
      tag: "testuser#1234",
    },
    channelId: "test-channel-id",
    channel: mockChannel,
    reply: mockReply,
    ...overrides,
  } as unknown as Message
}

// Mock PlexMediaItem factory
function createMockPlexItem(overrides: Partial<PlexMediaItem> = {}): PlexMediaItem {
  return {
    ratingKey: "12345",
    title: "The Office",
    type: "show",
    year: 2005,
    ...overrides,
  }
}

describe("MARK_COMMANDS", () => {
  it("should map all mark commands to correct MarkType values", () => {
    expect(MARK_COMMANDS["!finished"]).toBe(MarkType.FINISHED_WATCHING)
    expect(MARK_COMMANDS["!done"]).toBe(MarkType.FINISHED_WATCHING)
    expect(MARK_COMMANDS["!watched"]).toBe(MarkType.FINISHED_WATCHING)
    expect(MARK_COMMANDS["!notinterested"]).toBe(MarkType.NOT_INTERESTED)
    expect(MARK_COMMANDS["!skip"]).toBe(MarkType.NOT_INTERESTED)
    expect(MARK_COMMANDS["!pass"]).toBe(MarkType.NOT_INTERESTED)
    expect(MARK_COMMANDS["!keep"]).toBe(MarkType.KEEP_FOREVER)
    expect(MARK_COMMANDS["!favorite"]).toBe(MarkType.KEEP_FOREVER)
    expect(MARK_COMMANDS["!fav"]).toBe(MarkType.KEEP_FOREVER)
    expect(MARK_COMMANDS["!rewatch"]).toBe(MarkType.REWATCH_CANDIDATE)
    expect(MARK_COMMANDS["!badquality"]).toBe(MarkType.POOR_QUALITY)
    expect(MARK_COMMANDS["!lowquality"]).toBe(MarkType.POOR_QUALITY)
  })
})

describe("handleMarkCommand", () => {
  let mockMessage: Message
  const mockVerifyDiscordUser = verifyDiscordUser as jest.MockedFunction<typeof verifyDiscordUser>
  const mockSearchPlexMedia = searchPlexMedia as jest.MockedFunction<typeof searchPlexMedia>
  const mockMarkPlexItemWatched = markPlexItemWatched as jest.MockedFunction<typeof markPlexItemWatched>

  beforeEach(() => {
    jest.clearAllMocks()
    mockMessage = createMockMessage()
  })

  describe("user not linked", () => {
    it("should reply with link prompt when user is not linked", async () => {
      mockVerifyDiscordUser.mockResolvedValue({
        linked: false,
        user: null,
      })

      await handleMarkCommand(mockMessage, "!finished", ["The Office"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: "You need to link your account before marking media. Use the link provided earlier.",
        allowedMentions: { users: ["test-user-id"] },
      })
      expect(mockSearchPlexMedia).not.toHaveBeenCalled()
    })
  })

  describe("no media title provided", () => {
    it("should reply with usage example when no title provided", async () => {
      mockVerifyDiscordUser.mockResolvedValue({
        linked: true,
        user: { id: "user-123" },
      })

      await handleMarkCommand(mockMessage, "!finished", [])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: "Please provide a media title. Example: `!finished The Office`",
        allowedMentions: { users: ["test-user-id"] },
      })
      expect(mockSearchPlexMedia).not.toHaveBeenCalled()
    })

    it("should reply with usage example when title is only whitespace", async () => {
      mockVerifyDiscordUser.mockResolvedValue({
        linked: true,
        user: { id: "user-123" },
      })

      await handleMarkCommand(mockMessage, "!finished", ["   ", "  "])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: "Please provide a media title. Example: `!finished The Office`",
        allowedMentions: { users: ["test-user-id"] },
      })
      expect(mockSearchPlexMedia).not.toHaveBeenCalled()
    })
  })

  describe("no active Plex server", () => {
    it("should reply with error when no active Plex server found", async () => {
      mockVerifyDiscordUser.mockResolvedValue({
        linked: true,
        user: { id: "user-123" },
      })
      ;(getActivePlexService as jest.Mock).mockResolvedValue(null)

      await handleMarkCommand(mockMessage, "!finished", ["The Office"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: "No active Plex server configured. Please contact an admin.",
        allowedMentions: { users: ["test-user-id"] },
      })
      expect(mockSearchPlexMedia).not.toHaveBeenCalled()
    })
  })

  describe("search failures", () => {
    beforeEach(() => {
      mockVerifyDiscordUser.mockResolvedValue({
        linked: true,
        user: { id: "user-123" },
      })
      ;(getActivePlexService as jest.Mock).mockResolvedValue({
        id: "plex-1",
        name: "Test Server",
        url: "http://localhost:32400",
        isActive: true,
        config: {
          token: "test-token",
        },
      })
    })

    it("should reply with error when search fails", async () => {
      mockSearchPlexMedia.mockResolvedValue({
        success: false,
        error: "Connection timeout",
      })

      await handleMarkCommand(mockMessage, "!finished", ["The Office"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'Failed to search for "The Office": Connection timeout',
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should handle search error without error message", async () => {
      mockSearchPlexMedia.mockResolvedValue({
        success: false,
      })

      await handleMarkCommand(mockMessage, "!finished", ["The Office"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'Failed to search for "The Office": Unknown error',
        allowedMentions: { users: ["test-user-id"] },
      })
    })
  })

  describe("no search results", () => {
    it("should reply with no results message when search returns empty array", async () => {
      mockVerifyDiscordUser.mockResolvedValue({
        linked: true,
        user: { id: "user-123" },
      })
      ;(getActivePlexService as jest.Mock).mockResolvedValue({
        id: "plex-1",
        name: "Test Server",
        url: "http://localhost:32400",
        isActive: true,
        config: {
          token: "test-token",
        },
      })
      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [],
      })

      await handleMarkCommand(mockMessage, "!finished", ["Unknown Show"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'No media found matching "Unknown Show". Try a different search term.',
        allowedMentions: { users: ["test-user-id"] },
      })
    })
  })

  describe("single search result", () => {
    beforeEach(() => {
      mockVerifyDiscordUser.mockResolvedValue({
        linked: true,
        user: { id: "user-123" },
      })
      ;(getActivePlexService as jest.Mock).mockResolvedValue({
        id: "plex-1",
        name: "Test Server",
        url: "http://localhost:32400",
        isActive: true,
        config: {
          token: "test-token",
        },
      })
    })

    it("should process single movie result directly", async () => {
      const mockMovie = createMockPlexItem({
        ratingKey: "movie-123",
        title: "Inception",
        type: "movie",
        year: 2010,
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [mockMovie],
      })
      ;(prisma.userMediaMark.upsert as jest.Mock).mockResolvedValue({})
      mockMarkPlexItemWatched.mockResolvedValue({ success: true })

      await handleMarkCommand(mockMessage, "!finished", ["Inception"])

      expect(prisma.userMediaMark.upsert).toHaveBeenCalledWith({
        where: {
          userId_plexRatingKey_markType: {
            userId: "user-123",
            plexRatingKey: "movie-123",
            markType: MarkType.FINISHED_WATCHING,
          },
        },
        create: expect.objectContaining({
          userId: "user-123",
          mediaType: MediaType.MOVIE,
          plexRatingKey: "movie-123",
          markType: MarkType.FINISHED_WATCHING,
          title: "Inception",
          year: 2010,
          markedVia: "discord",
          discordChannelId: "test-channel-id",
        }),
        update: {
          markedAt: expect.any(Date),
          discordChannelId: "test-channel-id",
        },
      })

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: '✅ Marked "Inception (2010)" as **Finished Watching** and marked as watched in Plex.',
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should process single TV show result directly", async () => {
      const mockShow = createMockPlexItem({
        ratingKey: "show-123",
        title: "The Office",
        type: "show",
        year: 2005,
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [mockShow],
      })
      ;(prisma.userMediaMark.upsert as jest.Mock).mockResolvedValue({})

      await handleMarkCommand(mockMessage, "!keep", ["The Office"])

      expect(prisma.userMediaMark.upsert).toHaveBeenCalledWith({
        where: {
          userId_plexRatingKey_markType: {
            userId: "user-123",
            plexRatingKey: "show-123",
            markType: MarkType.KEEP_FOREVER,
          },
        },
        create: expect.objectContaining({
          userId: "user-123",
          mediaType: MediaType.TV_SERIES,
          plexRatingKey: "show-123",
          markType: MarkType.KEEP_FOREVER,
          title: "The Office",
          year: 2005,
          markedVia: "discord",
        }),
        update: {
          markedAt: expect.any(Date),
          discordChannelId: "test-channel-id",
        },
      })

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: '✅ Marked "The Office (2005)" as **Keep Forever**.',
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should process single episode result with full hierarchy", async () => {
      const mockEpisode = createMockPlexItem({
        ratingKey: "episode-123",
        title: "Pilot",
        type: "episode",
        grandparentTitle: "The Office",
        parentTitle: "Season 1",
        parentIndex: 1,
        index: 1,
        year: 2005,
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [mockEpisode],
      })
      ;(prisma.userMediaMark.upsert as jest.Mock).mockResolvedValue({})
      mockMarkPlexItemWatched.mockResolvedValue({ success: true })

      await handleMarkCommand(mockMessage, "!finished", ["The Office Pilot"])

      expect(prisma.userMediaMark.upsert).toHaveBeenCalledWith({
        where: {
          userId_plexRatingKey_markType: {
            userId: "user-123",
            plexRatingKey: "episode-123",
            markType: MarkType.FINISHED_WATCHING,
          },
        },
        create: expect.objectContaining({
          userId: "user-123",
          mediaType: MediaType.EPISODE,
          plexRatingKey: "episode-123",
          markType: MarkType.FINISHED_WATCHING,
          title: "Pilot",
          seasonNumber: 1,
          episodeNumber: 1,
          // parentTitle || grandparentTitle - parentTitle takes precedence
          parentTitle: "Season 1",
        }),
        update: {
          markedAt: expect.any(Date),
          discordChannelId: "test-channel-id",
        },
      })

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: '✅ Marked "The Office - Pilot (2005)" as **Finished Watching** and marked as watched in Plex.',
        allowedMentions: { users: ["test-user-id"] },
      })
    })
  })

  describe("multiple search results", () => {
    it("should display selection menu for multiple results", async () => {
      mockVerifyDiscordUser.mockResolvedValue({
        linked: true,
        user: { id: "user-123" },
      })
      ;(getActivePlexService as jest.Mock).mockResolvedValue({
        id: "plex-1",
        name: "Test Server",
        url: "http://localhost:32400",
        isActive: true,
        config: {
          token: "test-token",
        },
      })

      const mockResults = [
        createMockPlexItem({ ratingKey: "1", title: "The Office", type: "show", year: 2005 }),
        createMockPlexItem({ ratingKey: "2", title: "The Office", type: "show", year: 2001 }),
        createMockPlexItem({ ratingKey: "3", title: "The Office Special", type: "show", year: 2007 }),
      ]

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: mockResults,
      })

      await handleMarkCommand(mockMessage, "!finished", ["The Office"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("Found multiple matches for \"The Office\""),
        allowedMentions: { users: ["test-user-id"] },
      })

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("1. The Office (2005)"),
        allowedMentions: { users: ["test-user-id"] },
      })

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("2. The Office (2001)"),
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should limit results to 5 items in selection menu", async () => {
      mockVerifyDiscordUser.mockResolvedValue({
        linked: true,
        user: { id: "user-123" },
      })
      ;(getActivePlexService as jest.Mock).mockResolvedValue({
        id: "plex-1",
        name: "Test Server",
        url: "http://localhost:32400",
        isActive: true,
        config: {
          token: "test-token",
        },
      })

      const mockResults = Array.from({ length: 10 }, (_, i) =>
        createMockPlexItem({ ratingKey: `${i}`, title: `Show ${i}`, year: 2000 + i })
      )

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: mockResults,
      })

      await handleMarkCommand(mockMessage, "!finished", ["Show"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("Reply with a number (1-5)"),
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should format episode results with season and episode numbers", async () => {
      mockVerifyDiscordUser.mockResolvedValue({
        linked: true,
        user: { id: "user-123" },
      })
      ;(getActivePlexService as jest.Mock).mockResolvedValue({
        id: "plex-1",
        name: "Test Server",
        url: "http://localhost:32400",
        isActive: true,
        config: {
          token: "test-token",
        },
      })

      const mockResults = [
        createMockPlexItem({
          ratingKey: "1",
          title: "Pilot",
          type: "episode",
          grandparentTitle: "The Office",
          parentIndex: 1,
          index: 1,
        }),
        createMockPlexItem({
          ratingKey: "2",
          title: "Diversity Day",
          type: "episode",
          grandparentTitle: "The Office",
          parentIndex: 1,
          index: 2,
        }),
      ]

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: mockResults,
      })

      await handleMarkCommand(mockMessage, "!finished", ["Office"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("S1E1"),
        allowedMentions: { users: ["test-user-id"] },
      })

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("S1E2"),
        allowedMentions: { users: ["test-user-id"] },
      })
    })
  })

  describe("FINISHED_WATCHING marks as watched in Plex", () => {
    beforeEach(() => {
      mockVerifyDiscordUser.mockResolvedValue({
        linked: true,
        user: { id: "user-123" },
      })
      ;(getActivePlexService as jest.Mock).mockResolvedValue({
        id: "plex-1",
        name: "Test Server",
        url: "http://localhost:32400",
        isActive: true,
        config: {
          token: "test-token",
        },
      })
      ;(prisma.userMediaMark.upsert as jest.Mock).mockResolvedValue({})
    })

    it("should mark item as watched in Plex for FINISHED_WATCHING", async () => {
      const mockMovie = createMockPlexItem({
        ratingKey: "movie-123",
        title: "Inception",
        type: "movie",
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [mockMovie],
      })

      mockMarkPlexItemWatched.mockResolvedValue({
        success: true,
      })

      await handleMarkCommand(mockMessage, "!finished", ["Inception"])

      expect(mockMarkPlexItemWatched).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Test Server",
          url: "http://localhost:32400",
          token: "test-token",
        }),
        "movie-123"
      )
    })

    it("should not mark as watched for other mark types", async () => {
      const mockMovie = createMockPlexItem({
        ratingKey: "movie-123",
        title: "Inception",
        type: "movie",
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [mockMovie],
      })

      await handleMarkCommand(mockMessage, "!keep", ["Inception"])

      expect(mockMarkPlexItemWatched).not.toHaveBeenCalled()
    })

    it("should continue if Plex marking fails", async () => {
      const mockMovie = createMockPlexItem({
        ratingKey: "movie-123",
        title: "Inception",
        type: "movie",
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [mockMovie],
      })

      mockMarkPlexItemWatched.mockResolvedValue({
        success: false,
        error: "Plex API error",
      })

      await handleMarkCommand(mockMessage, "!finished", ["Inception"])

      // Should still reply with success
      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("✅ Marked"),
        allowedMentions: { users: ["test-user-id"] },
      })
    })
  })

  describe("error handling", () => {
    it("should handle unexpected errors gracefully", async () => {
      mockVerifyDiscordUser.mockRejectedValue(new Error("Database connection failed"))

      await handleMarkCommand(mockMessage, "!finished", ["The Office"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: "Sorry, something went wrong while processing your command. Please try again.",
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should handle unsupported media types", async () => {
      mockVerifyDiscordUser.mockResolvedValue({
        linked: true,
        user: { id: "user-123" },
      })
      ;(getActivePlexService as jest.Mock).mockResolvedValue({
        id: "plex-1",
        name: "Test Server",
        url: "http://localhost:32400",
        isActive: true,
        config: {
          token: "test-token",
        },
      })

      const mockUnsupported = createMockPlexItem({
        ratingKey: "track-123",
        title: "Song Title",
        type: "track" as any,
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [mockUnsupported],
      })

      await handleMarkCommand(mockMessage, "!finished", ["Song Title"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: "Unsupported media type: track. Only movies, TV shows, and episodes are supported.",
        allowedMentions: { users: ["test-user-id"] },
      })
    })
  })

  describe("channel typing indicator", () => {
    it("should send typing indicator before searching", async () => {
      mockVerifyDiscordUser.mockResolvedValue({
        linked: true,
        user: { id: "user-123" },
      })
      ;(getActivePlexService as jest.Mock).mockResolvedValue({
        id: "plex-1",
        name: "Test Server",
        url: "http://localhost:32400",
        isActive: true,
        config: {
          token: "test-token",
        },
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [],
      })

      await handleMarkCommand(mockMessage, "!finished", ["The Office"])

      expect(mockMessage.channel.sendTyping).toHaveBeenCalled()
    })

    it("should not fail if sendTyping is not available", async () => {
      const messageWithoutTyping = createMockMessage({
        channel: { id: "test-channel-id" } as any,
      })

      mockVerifyDiscordUser.mockResolvedValue({
        linked: true,
        user: { id: "user-123" },
      })
      ;(getActivePlexService as jest.Mock).mockResolvedValue({
        id: "plex-1",
        name: "Test Server",
        url: "http://localhost:32400",
        isActive: true,
        config: {
          token: "test-token",
        },
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [],
      })

      await expect(
        handleMarkCommand(messageWithoutTyping, "!finished", ["The Office"])
      ).resolves.not.toThrow()
    })
  })
})

describe("handleSelectionResponse", () => {
  let mockMessage: Message
  const mockVerifyDiscordUser = verifyDiscordUser as jest.MockedFunction<typeof verifyDiscordUser>
  const mockSearchPlexMedia = searchPlexMedia as jest.MockedFunction<typeof searchPlexMedia>

  beforeEach(() => {
    jest.clearAllMocks()
    mockMessage = createMockMessage()
  })

  describe("valid selection", () => {
    it("should process valid selection (1-5)", async () => {
      // First, set up a pending selection by calling handleMarkCommand
      mockVerifyDiscordUser.mockResolvedValue({
        linked: true,
        user: { id: "user-123" },
      })
      ;(getActivePlexService as jest.Mock).mockResolvedValue({
        id: "plex-1",
        name: "Test Server",
        url: "http://localhost:32400",
        isActive: true,
        config: {
          token: "test-token",
        },
      })

      const mockResults = [
        createMockPlexItem({ ratingKey: "1", title: "Show 1", year: 2001 }),
        createMockPlexItem({ ratingKey: "2", title: "Show 2", year: 2002 }),
        createMockPlexItem({ ratingKey: "3", title: "Show 3", year: 2003 }),
      ]

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: mockResults,
      })

      // Create pending selection
      await handleMarkCommand(mockMessage, "!finished", ["Show"])

      // Clear previous reply calls
      ;(mockMessage.reply as jest.Mock).mockClear()
      ;(prisma.userMediaMark.upsert as jest.Mock).mockResolvedValue({})

      // Now respond with selection
      const result = await handleSelectionResponse(mockMessage, 2)

      expect(result).toBe(true)
      expect(prisma.userMediaMark.upsert).toHaveBeenCalledWith({
        where: {
          userId_plexRatingKey_markType: {
            userId: "user-123",
            plexRatingKey: "2",
            markType: MarkType.FINISHED_WATCHING,
          },
        },
        create: expect.objectContaining({
          userId: "user-123",
          plexRatingKey: "2",
          title: "Show 2",
        }),
        update: expect.anything(),
      })
    })
  })

  describe("invalid selection", () => {
    it("should reject selection less than 1", async () => {
      mockVerifyDiscordUser.mockResolvedValue({
        linked: true,
        user: { id: "user-123" },
      })
      ;(getActivePlexService as jest.Mock).mockResolvedValue({
        id: "plex-1",
        name: "Test Server",
        url: "http://localhost:32400",
        isActive: true,
        config: {
          token: "test-token",
        },
      })

      const mockResults = [
        createMockPlexItem({ ratingKey: "1", title: "Show 1" }),
        createMockPlexItem({ ratingKey: "2", title: "Show 2" }),
      ]

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: mockResults,
      })

      await handleMarkCommand(mockMessage, "!finished", ["Show"])
      ;(mockMessage.reply as jest.Mock).mockClear()

      const result = await handleSelectionResponse(mockMessage, 0)

      expect(result).toBe(true)
      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: "Please select a number between 1 and 2.",
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should reject selection greater than available results", async () => {
      mockVerifyDiscordUser.mockResolvedValue({
        linked: true,
        user: { id: "user-123" },
      })
      ;(getActivePlexService as jest.Mock).mockResolvedValue({
        id: "plex-1",
        name: "Test Server",
        url: "http://localhost:32400",
        isActive: true,
        config: {
          token: "test-token",
        },
      })

      const mockResults = [
        createMockPlexItem({ ratingKey: "1", title: "Show 1" }),
        createMockPlexItem({ ratingKey: "2", title: "Show 2" }),
      ]

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: mockResults,
      })

      await handleMarkCommand(mockMessage, "!finished", ["Show"])
      ;(mockMessage.reply as jest.Mock).mockClear()

      const result = await handleSelectionResponse(mockMessage, 5)

      expect(result).toBe(true)
      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: "Please select a number between 1 and 2.",
        allowedMentions: { users: ["test-user-id"] },
      })
    })
  })

  describe("no pending selection", () => {
    it("should return false when there is no pending selection", async () => {
      // Use a different user/channel to ensure no pending selection
      const freshMessage = createMockMessage({
        author: {
          id: "different-user-id",
          username: "differentuser",
          discriminator: "5678",
          bot: false,
          system: false,
          tag: "differentuser#5678",
        } as any,
        channelId: "different-channel-id",
      })

      const result = await handleSelectionResponse(freshMessage, 1)

      expect(result).toBe(false)
      expect(freshMessage.reply).not.toHaveBeenCalled()
    })
  })

  describe("error handling", () => {
    it("should handle errors and clean up pending selection", async () => {
      // Use unique message for this test
      const errorTestMessage = createMockMessage({
        author: {
          id: "error-test-user",
          username: "erroruser",
          discriminator: "9999",
          bot: false,
          system: false,
          tag: "erroruser#9999",
        } as any,
        channelId: "error-test-channel",
      })

      mockVerifyDiscordUser.mockResolvedValue({
        linked: true,
        user: { id: "user-123" },
      })

      // Mock getActivePlexService to succeed for handleMarkCommand
      ;(getActivePlexService as jest.Mock).mockResolvedValue({
        id: "plex-1",
        name: "Test Server",
        url: "http://localhost:32400",
        isActive: true,
        config: {
          token: "test-token",
        },
      })

      // Return multiple results to create a pending selection
      const mockResults = [
        createMockPlexItem({ ratingKey: "1", title: "Show 1" }),
        createMockPlexItem({ ratingKey: "2", title: "Show 2" }),
      ]

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: mockResults,
      })

      await handleMarkCommand(errorTestMessage, "!finished", ["Show"])
      ;(errorTestMessage.reply as jest.Mock).mockClear()

      // Now mock the error for the selection response
      ;(getActivePlexService as jest.Mock).mockRejectedValue(new Error("Database error"))

      const result = await handleSelectionResponse(errorTestMessage, 1)

      expect(result).toBe(true)
      expect(errorTestMessage.reply).toHaveBeenCalledWith({
        content: "Sorry, something went wrong while processing your selection. Please try again.",
        allowedMentions: { users: ["error-test-user"] },
      })

      // Verify pending selection is cleaned up
      const secondResult = await handleSelectionResponse(errorTestMessage, 1)
      expect(secondResult).toBe(false)
    })

    it("should handle missing Plex server during selection", async () => {
      // Use unique message for this test
      const noServerMessage = createMockMessage({
        author: {
          id: "no-server-user",
          username: "noserveruser",
          discriminator: "8888",
          bot: false,
          system: false,
          tag: "noserveruser#8888",
        } as any,
        channelId: "no-server-channel",
      })

      mockVerifyDiscordUser.mockResolvedValue({
        linked: true,
        user: { id: "user-123" },
      })

      // Mock getActivePlexService to succeed for handleMarkCommand
      ;(getActivePlexService as jest.Mock).mockResolvedValue({
        id: "plex-1",
        name: "Test Server",
        url: "http://localhost:32400",
        isActive: true,
        config: {
          token: "test-token",
        },
      })

      // Return multiple results to create a pending selection
      const mockResults = [
        createMockPlexItem({ ratingKey: "1", title: "Show 1" }),
        createMockPlexItem({ ratingKey: "2", title: "Show 2" }),
      ]

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: mockResults,
      })

      await handleMarkCommand(noServerMessage, "!finished", ["Show"])
      ;(noServerMessage.reply as jest.Mock).mockClear()

      // Now mock no server for the selection response
      ;(getActivePlexService as jest.Mock).mockResolvedValue(null)

      const result = await handleSelectionResponse(noServerMessage, 1)

      expect(result).toBe(true)
      expect(noServerMessage.reply).toHaveBeenCalledWith({
        content: "No active Plex server configured. Please contact an admin.",
        allowedMentions: { users: ["no-server-user"] },
      })
    })
  })
})

describe("processSingleResult (via handleMarkCommand)", () => {
  const mockVerifyDiscordUser = verifyDiscordUser as jest.MockedFunction<typeof verifyDiscordUser>
  const mockSearchPlexMedia = searchPlexMedia as jest.MockedFunction<typeof searchPlexMedia>
  const mockMarkPlexItemWatched = markPlexItemWatched as jest.MockedFunction<typeof markPlexItemWatched>

  beforeEach(() => {
    jest.clearAllMocks()
    mockVerifyDiscordUser.mockResolvedValue({
      linked: true,
      user: { id: "user-123" },
    })
    ;(getActivePlexService as jest.Mock).mockResolvedValue({
      id: "plex-1",
      name: "Test Server",
      url: "http://localhost:32400",
      publicUrl: "https://plex.example.com",
      isActive: true,
      config: {
        token: "test-token",
      },
    })
    ;(prisma.userMediaMark.upsert as jest.Mock).mockResolvedValue({})
  })

  describe("different mark types", () => {
    it("should create mark with NOT_INTERESTED type", async () => {
      const mockMessage = createMockMessage()
      const mockMovie = createMockPlexItem({
        ratingKey: "movie-123",
        title: "Bad Movie",
        type: "movie",
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [mockMovie],
      })

      await handleMarkCommand(mockMessage, "!notinterested", ["Bad Movie"])

      expect(prisma.userMediaMark.upsert).toHaveBeenCalledWith({
        where: {
          userId_plexRatingKey_markType: {
            userId: "user-123",
            plexRatingKey: "movie-123",
            markType: MarkType.NOT_INTERESTED,
          },
        },
        create: expect.objectContaining({
          markType: MarkType.NOT_INTERESTED,
        }),
        update: expect.anything(),
      })

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("Not Interested"),
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should create mark with KEEP_FOREVER type", async () => {
      const mockMessage = createMockMessage()
      const mockMovie = createMockPlexItem({
        ratingKey: "movie-123",
        title: "Great Movie",
        type: "movie",
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [mockMovie],
      })

      await handleMarkCommand(mockMessage, "!keep", ["Great Movie"])

      expect(prisma.userMediaMark.upsert).toHaveBeenCalledWith({
        where: {
          userId_plexRatingKey_markType: {
            userId: "user-123",
            plexRatingKey: "movie-123",
            markType: MarkType.KEEP_FOREVER,
          },
        },
        create: expect.objectContaining({
          markType: MarkType.KEEP_FOREVER,
        }),
        update: expect.anything(),
      })

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("Keep Forever"),
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should create mark with REWATCH_CANDIDATE type", async () => {
      const mockMessage = createMockMessage()
      const mockMovie = createMockPlexItem({
        ratingKey: "movie-123",
        title: "Classic Movie",
        type: "movie",
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [mockMovie],
      })

      await handleMarkCommand(mockMessage, "!rewatch", ["Classic Movie"])

      expect(prisma.userMediaMark.upsert).toHaveBeenCalledWith({
        where: {
          userId_plexRatingKey_markType: {
            userId: "user-123",
            plexRatingKey: "movie-123",
            markType: MarkType.REWATCH_CANDIDATE,
          },
        },
        create: expect.objectContaining({
          markType: MarkType.REWATCH_CANDIDATE,
        }),
        update: expect.anything(),
      })

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("Rewatch Candidate"),
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should create mark with POOR_QUALITY type", async () => {
      const mockMessage = createMockMessage()
      const mockMovie = createMockPlexItem({
        ratingKey: "movie-123",
        title: "Low Quality Movie",
        type: "movie",
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [mockMovie],
      })

      await handleMarkCommand(mockMessage, "!badquality", ["Low Quality Movie"])

      expect(prisma.userMediaMark.upsert).toHaveBeenCalledWith({
        where: {
          userId_plexRatingKey_markType: {
            userId: "user-123",
            plexRatingKey: "movie-123",
            markType: MarkType.POOR_QUALITY,
          },
        },
        create: expect.objectContaining({
          markType: MarkType.POOR_QUALITY,
        }),
        update: expect.anything(),
      })

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("Poor Quality"),
        allowedMentions: { users: ["test-user-id"] },
      })
    })
  })

  describe("database creation", () => {
    it("should create database entry with all fields for movie", async () => {
      const mockMessage = createMockMessage()
      const mockMovie = createMockPlexItem({
        ratingKey: "movie-123",
        title: "Test Movie",
        type: "movie",
        year: 2020,
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [mockMovie],
      })

      await handleMarkCommand(mockMessage, "!finished", ["Test Movie"])

      expect(prisma.userMediaMark.upsert).toHaveBeenCalledWith({
        where: {
          userId_plexRatingKey_markType: {
            userId: "user-123",
            plexRatingKey: "movie-123",
            markType: MarkType.FINISHED_WATCHING,
          },
        },
        create: {
          userId: "user-123",
          mediaType: MediaType.MOVIE,
          plexRatingKey: "movie-123",
          markType: MarkType.FINISHED_WATCHING,
          title: "Test Movie",
          year: 2020,
          seasonNumber: undefined,
          episodeNumber: undefined,
          parentTitle: undefined,
          radarrId: null,
          radarrTitleSlug: null,
          sonarrId: null,
          sonarrTitleSlug: null,
          markedVia: "discord",
          discordChannelId: "test-channel-id",
        },
        update: {
          markedAt: expect.any(Date),
          discordChannelId: "test-channel-id",
        },
      })
    })

    it("should create database entry with episode details", async () => {
      const mockMessage = createMockMessage()
      const mockEpisode = createMockPlexItem({
        ratingKey: "episode-123",
        title: "Test Episode",
        type: "episode",
        grandparentTitle: "Test Show",
        parentTitle: "Season 2",
        parentIndex: 2,
        index: 5,
        year: 2021,
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [mockEpisode],
      })
      mockMarkPlexItemWatched.mockResolvedValue({ success: true })

      await handleMarkCommand(mockMessage, "!finished", ["Test Episode"])

      expect(prisma.userMediaMark.upsert).toHaveBeenCalledWith({
        where: {
          userId_plexRatingKey_markType: {
            userId: "user-123",
            plexRatingKey: "episode-123",
            markType: MarkType.FINISHED_WATCHING,
          },
        },
        create: {
          userId: "user-123",
          mediaType: MediaType.EPISODE,
          plexRatingKey: "episode-123",
          markType: MarkType.FINISHED_WATCHING,
          title: "Test Episode",
          year: 2021,
          seasonNumber: 2,
          episodeNumber: 5,
          // parentTitle || grandparentTitle - parentTitle takes precedence
          parentTitle: "Season 2",
          radarrId: null,
          radarrTitleSlug: null,
          sonarrId: null,
          sonarrTitleSlug: null,
          markedVia: "discord",
          discordChannelId: "test-channel-id",
        },
        update: {
          markedAt: expect.any(Date),
          discordChannelId: "test-channel-id",
        },
      })
    })

    it("should update markedAt timestamp when mark already exists", async () => {
      const mockMessage = createMockMessage()
      const mockMovie = createMockPlexItem({
        ratingKey: "movie-123",
        title: "Test Movie",
        type: "movie",
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [mockMovie],
      })

      await handleMarkCommand(mockMessage, "!finished", ["Test Movie"])

      const upsertCall = (prisma.userMediaMark.upsert as jest.Mock).mock.calls[0][0]
      expect(upsertCall.update).toEqual({
        markedAt: expect.any(Date),
        discordChannelId: "test-channel-id",
      })
    })
  })

  describe("Plex marking for FINISHED_WATCHING", () => {
    it("should call markPlexItemWatched for FINISHED_WATCHING", async () => {
      const mockMessage = createMockMessage()
      const mockMovie = createMockPlexItem({
        ratingKey: "movie-123",
        title: "Test Movie",
        type: "movie",
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [mockMovie],
      })

      mockMarkPlexItemWatched.mockResolvedValue({ success: true })

      await handleMarkCommand(mockMessage, "!finished", ["Test Movie"])

      expect(mockMarkPlexItemWatched).toHaveBeenCalledWith(
        {
          name: "Test Server",
          url: "http://localhost:32400",
          token: "test-token",
          publicUrl: "https://plex.example.com",
        },
        "movie-123"
      )
    })

    it("should not call markPlexItemWatched for non-FINISHED_WATCHING marks", async () => {
      const mockMessage = createMockMessage()
      const mockMovie = createMockPlexItem({
        ratingKey: "movie-123",
        title: "Test Movie",
        type: "movie",
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [mockMovie],
      })

      await handleMarkCommand(mockMessage, "!rewatch", ["Test Movie"])

      expect(mockMarkPlexItemWatched).not.toHaveBeenCalled()
    })

    it("should include Plex marking confirmation in reply", async () => {
      const mockMessage = createMockMessage()
      const mockMovie = createMockPlexItem({
        ratingKey: "movie-123",
        title: "Test Movie",
        type: "movie",
        year: 2020,
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [mockMovie],
      })

      mockMarkPlexItemWatched.mockResolvedValue({ success: true })

      await handleMarkCommand(mockMessage, "!finished", ["Test Movie"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: '✅ Marked "Test Movie (2020)" as **Finished Watching** and marked as watched in Plex.',
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should not include Plex marking confirmation for other mark types", async () => {
      const mockMessage = createMockMessage()
      const mockMovie = createMockPlexItem({
        ratingKey: "movie-123",
        title: "Test Movie",
        type: "movie",
        year: 2020,
      })

      mockSearchPlexMedia.mockResolvedValue({
        success: true,
        data: [mockMovie],
      })

      await handleMarkCommand(mockMessage, "!keep", ["Test Movie"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: '✅ Marked "Test Movie (2020)" as **Keep Forever**.',
        allowedMentions: { users: ["test-user-id"] },
      })
    })
  })
})
