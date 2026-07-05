// Stub discord.js so the router can be tested in the jsdom environment without
// loading the real @discordjs/rest → undici stack (needs Node web streams).
// Only MessageFlags is consumed at runtime by the router; everything else is a
// type-only import that is erased at compile time.
jest.mock("discord.js", () => {
  class SlashCommandStringOption {
    setName() {
      return this
    }
    setDescription() {
      return this
    }
    setAutocomplete() {
      return this
    }
    setRequired() {
      return this
    }
    addChoices() {
      return this
    }
  }
  class SlashCommandSubcommandBuilder {
    setName() {
      return this
    }
    setDescription() {
      return this
    }
    addStringOption(fn: (o: SlashCommandStringOption) => SlashCommandStringOption) {
      fn(new SlashCommandStringOption())
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
    addStringOption(fn: (o: SlashCommandStringOption) => SlashCommandStringOption) {
      fn(new SlashCommandStringOption())
      return this
    }
    addSubcommand(fn: (s: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder) {
      fn(new SlashCommandSubcommandBuilder())
      return this
    }
  }
  class StringSelectMenuBuilder {
    setCustomId() {
      return this
    }
    setPlaceholder() {
      return this
    }
    addOptions() {
      return this
    }
  }
  class ActionRowBuilder {
    addComponents() {
      return this
    }
  }
  class EmbedBuilder {
    setTitle() {
      return this
    }
    setDescription() {
      return this
    }
    addFields() {
      return this
    }
    setColor() {
      return this
    }
    setFooter() {
      return this
    }
    setTimestamp() {
      return this
    }
    setThumbnail() {
      return this
    }
  }
  return {
    MessageFlags: { Ephemeral: 64 },
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    EmbedBuilder,
  }
})

import { routeInteraction, type RouteDeps } from "../interaction-router"
import { createCommandLog, updateCommandLog } from "../../audit"
import type { Interaction } from "discord.js"
import type { SlashCommand } from "../../commands/registry"
import type { VerifyDiscordUserResult } from "../../services"
import type { DiscordCommandLog, DiscordCommandType } from "@/lib/generated/prisma/client"

// Let withAuditLog run for real, but stub the DB writes it delegates to so we
// can assert the SUCCESS / FAILED lifecycle without a live database.
jest.mock("../../audit", () => ({
  createCommandLog: jest.fn(),
  updateCommandLog: jest.fn(),
}))

// The router's default `verifyDiscordUser` transitively loads lib/prisma (which
// requires DATABASE_URL). Stub it — tests always inject their own via deps.
jest.mock("../../services", () => ({
  verifyDiscordUser: jest.fn(),
}))

// registry → mark/index → plex-config → lib/prisma (needs DATABASE_URL) at import
// time. Stub prisma so the module graph loads under jsdom; the router only reads
// injected deps, so the real registry defaults are never exercised here.
jest.mock("@/lib/prisma", () => ({ prisma: {} }))

const mockCreate = createCommandLog as jest.MockedFunction<typeof createCommandLog>
const mockUpdate = updateCommandLog as jest.MockedFunction<typeof updateCommandLog>

function createMockLog(): DiscordCommandLog {
  return {
    id: "log-123",
    discordUserId: "discord-user-123",
    discordUsername: "testuser#1234",
    userId: "user-123",
    commandType: "HELP" as DiscordCommandType,
    commandName: "ping",
    commandArgs: null,
    channelId: "channel-123",
    channelType: "guild",
    guildId: "guild-123",
    status: "PENDING",
    error: null,
    responseTimeMs: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
  }
}

const linkedUser: VerifyDiscordUserResult = {
  linked: true,
  user: {
    id: "user-123",
    name: "Test User",
    email: "test@example.com",
    plexUserId: "plex-1",
    isAdmin: false,
  },
}

interface MockInteractionOptions {
  isChatInputCommand?: boolean
  isAutocomplete?: boolean
  isButton?: boolean
  isStringSelectMenu?: boolean
  commandName?: string
  replied?: boolean
  deferred?: boolean
}

function createMockChatInputInteraction(options: MockInteractionOptions = {}) {
  const reply = jest.fn().mockResolvedValue(undefined)
  const followUp = jest.fn().mockResolvedValue(undefined)
  const deferReply = jest.fn().mockResolvedValue(undefined)

  const interaction = {
    id: "interaction-123",
    commandName: options.commandName ?? "ping",
    channelId: "channel-123",
    guildId: "guild-123",
    user: { id: "discord-user-123", tag: "testuser#1234" },
    replied: options.replied ?? false,
    deferred: options.deferred ?? false,
    reply,
    followUp,
    deferReply,
    isChatInputCommand: () => options.isChatInputCommand ?? true,
    isAutocomplete: () => options.isAutocomplete ?? false,
    isButton: () => options.isButton ?? false,
    isStringSelectMenu: () => options.isStringSelectMenu ?? false,
  }

  return { interaction: interaction as unknown as Interaction, reply, followUp, deferReply }
}

function createMockAutocompleteInteraction(commandName = "help") {
  const respond = jest.fn().mockResolvedValue(undefined)
  const interaction = {
    commandName,
    isChatInputCommand: () => false,
    isAutocomplete: () => true,
    isButton: () => false,
    isStringSelectMenu: () => false,
    respond,
  }
  return { interaction: interaction as unknown as Interaction, respond }
}

function createStubCommand(handle = jest.fn().mockResolvedValue(undefined)): SlashCommand {
  return {
    // Only .name is read by the router path under test.
    data: { name: "ping" } as SlashCommand["data"],
    commandType: "HELP" as DiscordCommandType,
    handle,
  }
}

function makeDeps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return {
    verifyDiscordUser: jest.fn().mockResolvedValue(linkedUser),
    getCommand: jest.fn().mockReturnValue(createStubCommand()),
    getComponentHandler: jest.fn().mockReturnValue(undefined),
    ...overrides,
  }
}

function createMockComponentInteraction(
  options: {
    customId?: string
    isButton?: boolean
    isStringSelectMenu?: boolean
    replied?: boolean
    deferred?: boolean
  } = {}
) {
  const reply = jest.fn().mockResolvedValue(undefined)
  const followUp = jest.fn().mockResolvedValue(undefined)
  const update = jest.fn().mockResolvedValue(undefined)

  const interaction = {
    customId: options.customId ?? "mark:select:abc",
    channelId: "channel-123",
    guildId: "guild-123",
    user: { id: "discord-user-123", tag: "testuser#1234" },
    replied: options.replied ?? false,
    deferred: options.deferred ?? false,
    reply,
    followUp,
    update,
    isChatInputCommand: () => false,
    isAutocomplete: () => false,
    isButton: () => options.isButton ?? false,
    isStringSelectMenu: () => options.isStringSelectMenu ?? true,
  }

  return { interaction: interaction as unknown as Interaction, reply, followUp, update }
}

describe("routeInteraction", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreate.mockResolvedValue(createMockLog())
    mockUpdate.mockResolvedValue(createMockLog())
  })

  it("dispatches a slash command to the matching handler with a resolved context", async () => {
    const handle = jest.fn().mockResolvedValue(undefined)
    const command = createStubCommand(handle)
    const verifyDiscordUser = jest.fn().mockResolvedValue(linkedUser)
    const deps = makeDeps({
      getCommand: jest.fn().mockReturnValue(command),
      verifyDiscordUser,
    })
    const { interaction } = createMockChatInputInteraction({ commandName: "ping" })

    await routeInteraction(interaction, deps)

    expect(deps.getCommand).toHaveBeenCalledWith("ping")
    expect(verifyDiscordUser).toHaveBeenCalledWith("discord-user-123")
    expect(handle).toHaveBeenCalledTimes(1)
    const ctx = handle.mock.calls[0][0]
    expect(ctx).toMatchObject({
      interaction,
      verifiedUser: linkedUser,
      discordUserId: "discord-user-123",
      channelId: "channel-123",
    })
  })

  it("records a SUCCESS audit log when the handler resolves", async () => {
    const deps = makeDeps()
    const { interaction } = createMockChatInputInteraction()

    await routeInteraction(interaction, deps)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        discordUserId: "discord-user-123",
        commandType: "HELP",
        commandName: "ping",
        channelType: "guild",
        guildId: "guild-123",
      })
    )
    expect(mockUpdate).toHaveBeenCalledWith(
      "log-123",
      expect.objectContaining({ status: "SUCCESS" })
    )
  })

  it("records a FAILED audit log and replies with a generic error when the handler throws", async () => {
    const handle = jest.fn().mockRejectedValue(new Error("kaboom"))
    const deps = makeDeps({ getCommand: jest.fn().mockReturnValue(createStubCommand(handle)) })
    const { interaction, reply } = createMockChatInputInteraction()

    await routeInteraction(interaction, deps)

    expect(mockUpdate).toHaveBeenCalledWith(
      "log-123",
      expect.objectContaining({ status: "FAILED", error: "kaboom" })
    )
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("something went wrong") })
    )
  })

  it("uses followUp for the error reply when the interaction was already replied", async () => {
    const handle = jest.fn().mockRejectedValue(new Error("kaboom"))
    const deps = makeDeps({ getCommand: jest.fn().mockReturnValue(createStubCommand(handle)) })
    const { interaction, reply, followUp } = createMockChatInputInteraction({ replied: true })

    await routeInteraction(interaction, deps)

    expect(followUp).toHaveBeenCalledTimes(1)
    expect(reply).not.toHaveBeenCalled()
  })

  it("replies with an ephemeral error for an unknown command and does not audit", async () => {
    const deps = makeDeps({ getCommand: jest.fn().mockReturnValue(undefined) })
    const { interaction, reply } = createMockChatInputInteraction({ commandName: "nope" })

    await routeInteraction(interaction, deps)

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Unknown command") })
    )
    expect(deps.verifyDiscordUser).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("ignores non-chat-input, non-component interactions", async () => {
    const deps = makeDeps()
    const { interaction, reply } = createMockChatInputInteraction({
      isChatInputCommand: false,
      isButton: false,
      isStringSelectMenu: false,
    })

    await routeInteraction(interaction, deps)

    expect(deps.getCommand).not.toHaveBeenCalled()
    expect(reply).not.toHaveBeenCalled()
  })

  it("dispatches a select-menu component to the matching handler by custom_id prefix", async () => {
    const handle = jest.fn().mockResolvedValue(undefined)
    const handler = {
      customIdPrefix: "mark:select:",
      commandType: "SELECTION" as DiscordCommandType,
      handle,
    }
    const getComponentHandler = jest.fn().mockReturnValue(handler)
    const deps = makeDeps({ getComponentHandler })
    const { interaction } = createMockComponentInteraction({
      isStringSelectMenu: true,
      customId: "mark:select:abc123",
    })

    await routeInteraction(interaction, deps)

    expect(getComponentHandler).toHaveBeenCalledWith("mark:select:abc123")
    expect(deps.getCommand).not.toHaveBeenCalled()
    expect(handle).toHaveBeenCalledTimes(1)
    expect(handle).toHaveBeenCalledWith(interaction)
  })

  it("records a SELECTION audit log for a dispatched component", async () => {
    const handler = {
      customIdPrefix: "mark:select:",
      commandType: "SELECTION" as DiscordCommandType,
      handle: jest.fn().mockResolvedValue(undefined),
    }
    const deps = makeDeps({ getComponentHandler: jest.fn().mockReturnValue(handler) })
    const { interaction } = createMockComponentInteraction({ isStringSelectMenu: true })

    await routeInteraction(interaction, deps)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        discordUserId: "discord-user-123",
        commandType: "SELECTION",
        channelType: "guild",
      })
    )
    expect(mockUpdate).toHaveBeenCalledWith(
      "log-123",
      expect.objectContaining({ status: "SUCCESS" })
    )
  })

  it("replies with an ephemeral notice for an unknown component and does not audit", async () => {
    const deps = makeDeps({ getComponentHandler: jest.fn().mockReturnValue(undefined) })
    const { interaction, reply } = createMockComponentInteraction({
      isButton: true,
      isStringSelectMenu: false,
      customId: "orphan:custom:id",
    })

    await routeInteraction(interaction, deps)

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("expired") })
    )
    expect(deps.verifyDiscordUser).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("records a FAILED audit log and replies generically when a component handler throws", async () => {
    const handler = {
      customIdPrefix: "mark:select:",
      commandType: "SELECTION" as DiscordCommandType,
      handle: jest.fn().mockRejectedValue(new Error("kaboom")),
    }
    const deps = makeDeps({ getComponentHandler: jest.fn().mockReturnValue(handler) })
    const { interaction, reply } = createMockComponentInteraction({ isStringSelectMenu: true })

    await routeInteraction(interaction, deps)

    expect(mockUpdate).toHaveBeenCalledWith(
      "log-123",
      expect.objectContaining({ status: "FAILED", error: "kaboom" })
    )
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("something went wrong") })
    )
  })

  it("routes autocomplete interactions to the matching command's autocomplete handler", async () => {
    const autocomplete = jest.fn().mockResolvedValue(undefined)
    const command: SlashCommand = { ...createStubCommand(), autocomplete }
    const getCommand = jest.fn().mockReturnValue(command)
    const deps = makeDeps({ getCommand })
    const { interaction } = createMockAutocompleteInteraction("help")

    await routeInteraction(interaction, deps)

    expect(getCommand).toHaveBeenCalledWith("help")
    expect(autocomplete).toHaveBeenCalledTimes(1)
    expect(autocomplete).toHaveBeenCalledWith(interaction)
    // Autocomplete is not a command invocation → no audit log, no verify.
    expect(mockCreate).not.toHaveBeenCalled()
    expect(deps.verifyDiscordUser).not.toHaveBeenCalled()
  })

  it("ignores an autocomplete interaction whose command has no autocomplete handler", async () => {
    const getCommand = jest.fn().mockReturnValue(createStubCommand())
    const deps = makeDeps({ getCommand })
    const { interaction, respond } = createMockAutocompleteInteraction("ping")

    await routeInteraction(interaction, deps)

    expect(getCommand).toHaveBeenCalledWith("ping")
    expect(respond).not.toHaveBeenCalled()
  })

  it("ignores an autocomplete interaction for an unknown command", async () => {
    const getCommand = jest.fn().mockReturnValue(undefined)
    const deps = makeDeps({ getCommand })
    const { interaction, respond } = createMockAutocompleteInteraction("nope")

    await routeInteraction(interaction, deps)

    expect(respond).not.toHaveBeenCalled()
  })
})
