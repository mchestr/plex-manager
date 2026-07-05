// Stub discord.js so help.ts (which now imports EmbedBuilder / SlashCommandBuilder
// / MessageFlags at runtime) loads under jsdom without pulling in the
// @discordjs/rest → undici stack (needs Node web streams). The stubs record
// enough state (title / description / fields / option builder) for assertions.
jest.mock("discord.js", () => {
  class EmbedBuilder {
    data: { title?: string; description?: string; fields: { name: string; value: string }[] } = {
      fields: [],
    }
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

  class SlashCommandStringOption {
    name = ""
    description = ""
    autocomplete = false
    setName(name: string) {
      this.name = name
      return this
    }
    setDescription(description: string) {
      this.description = description
      return this
    }
    setAutocomplete(value: boolean) {
      this.autocomplete = value
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

  return {
    MessageFlags: { Ephemeral: 64 },
    EmbedBuilder,
    SlashCommandBuilder,
  }
})

// help.ts now gates via requireLinkedUser, which imports lib/discord/config →
// lib/prisma. Stub the portal-URL helper so the module graph loads under jsdom.
jest.mock("@/lib/discord/config", () => ({
  getDiscordPortalUrl: () => "https://example.com/discord/link",
}))

import { type AutocompleteInteraction } from "discord.js"
import {
  COMMAND_REGISTRY,
  findCommand,
  buildFullHelpMessage,
  buildCommandHelpMessage,
  helpCommand,
  type CommandDefinition,
} from "../help"
import type { InteractionContext } from "../registry"

describe("COMMAND_REGISTRY", () => {
  it("should contain the /help command definition", () => {
    const helpEntry = COMMAND_REGISTRY.find((cmd) => cmd.name === "/help")
    expect(helpEntry).toBeDefined()
    expect(helpEntry?.category).toBe("utility")
    expect(helpEntry?.syntax).toBe("/help [command]")
  })

  it("should contain the /assistant command definition (ask + reset)", () => {
    const assistantCommand = COMMAND_REGISTRY.find((cmd) => cmd.name === "/assistant")
    expect(assistantCommand).toBeDefined()
    expect(assistantCommand?.category).toBe("chat")
    // Reset is folded into the assistant entry (there is no standalone /clear).
    expect(assistantCommand?.syntax).toContain("/assistant ask prompt:")
    expect(assistantCommand?.syntax).toContain("/assistant reset")
  })

  it("should contain the /mystats and /watching chat commands", () => {
    const myStats = COMMAND_REGISTRY.find((cmd) => cmd.name === "/mystats")
    expect(myStats).toBeDefined()
    expect(myStats?.category).toBe("chat")

    const watching = COMMAND_REGISTRY.find((cmd) => cmd.name === "/watching")
    expect(watching).toBeDefined()
    expect(watching?.category).toBe("chat")
  })

  it("should NOT contain a standalone context/clear command", () => {
    expect(COMMAND_REGISTRY.find((cmd) => cmd.name === "/clear")).toBeUndefined()
    expect(COMMAND_REGISTRY.some((cmd) => cmd.category === ("context" as never))).toBe(false)
  })

  it("should contain /mymarks and all /mark subcommands", () => {
    const mediaCommands = COMMAND_REGISTRY.filter((cmd) => cmd.category === "media")
    expect(mediaCommands.length).toBeGreaterThan(0)

    const myMarks = mediaCommands.find((cmd) => cmd.name === "/mymarks")
    expect(myMarks).toBeDefined()
    expect(myMarks?.syntax).toBe("/mymarks [type]")

    for (const sub of [
      "/mark finished",
      "/mark keep",
      "/mark notinterested",
      "/mark rewatch",
      "/mark badquality",
    ]) {
      const entry = mediaCommands.find((cmd) => cmd.name === sub)
      expect(entry).toBeDefined()
      expect(entry?.syntax).toContain("title:<name>")
    }
  })

  it("should have valid structure for all commands", () => {
    for (const command of COMMAND_REGISTRY) {
      expect(command.name).toBeTruthy()
      expect(command.name.startsWith("/")).toBe(true)
      expect(command.description).toBeTruthy()
      expect(command.syntax).toBeTruthy()
      expect(command.examples.length).toBeGreaterThan(0)
      expect(["chat", "media", "utility"]).toContain(command.category)
      // Slash commands have no aliases; the field is retained but always empty.
      expect(command.aliases).toEqual([])
    }
  })
})

describe("findCommand", () => {
  it("should find command by exact name (with leading slash)", () => {
    const command = findCommand("/help")
    expect(command).toBeDefined()
    expect(command?.name).toBe("/help")
  })

  it("should find command by name without the leading slash", () => {
    const command = findCommand("help")
    expect(command).toBeDefined()
    expect(command?.name).toBe("/help")
  })

  it("should find a /mark subcommand by its full name", () => {
    const command = findCommand("mark finished")
    expect(command).toBeDefined()
    expect(command?.name).toBe("/mark finished")

    const withSlash = findCommand("/mark keep")
    expect(withSlash?.name).toBe("/mark keep")
  })

  it("should be case insensitive", () => {
    const command1 = findCommand("HELP")
    const command2 = findCommand("/HELP")
    const command3 = findCommand("Help")
    expect(command1?.name).toBe("/help")
    expect(command2?.name).toBe("/help")
    expect(command3?.name).toBe("/help")

    const markCmd = findCommand("MARK FINISHED")
    expect(markCmd?.name).toBe("/mark finished")
  })

  it("should return undefined for unknown commands", () => {
    const command = findCommand("unknown")
    expect(command).toBeUndefined()
  })

  it("should return undefined for empty string", () => {
    const command = findCommand("")
    expect(command).toBeUndefined()
  })
})

describe("buildFullHelpMessage", () => {
  let helpMessage: string

  beforeAll(() => {
    helpMessage = buildFullHelpMessage()
  })

  it("should include title", () => {
    expect(helpMessage).toContain("**Available Commands**")
  })

  it("should include all non-empty category headers", () => {
    expect(helpMessage).toContain("**Utility**")
    expect(helpMessage).toContain("**Chat & Assistant**")
    expect(helpMessage).toContain("**Media**")
    // The context/clear category is gone.
    expect(helpMessage).not.toContain("Context Management")
  })

  it("should include command syntax in code blocks", () => {
    expect(helpMessage).toContain("`/help [command]`")
    expect(helpMessage).toContain("`/assistant ask prompt:<text> | /assistant reset`")
    expect(helpMessage).toContain("`/mymarks [type]`")
    expect(helpMessage).toContain("`/mark finished title:<name>`")
  })

  it("should include command descriptions", () => {
    expect(helpMessage).toContain("Show available commands and how to use them")
    expect(helpMessage).toContain("Ask the AI assistant a question")
    expect(helpMessage).toContain("Mark media as finished watching")
  })

  it("should include tips section", () => {
    expect(helpMessage).toContain("**Tips:**")
    expect(helpMessage).toContain("Use `/help command:<name>` for detailed info")
    expect(helpMessage).toContain("DM me directly")
    expect(helpMessage).toContain("Media commands search your Plex library")
  })

  it("should have proper formatting with newlines", () => {
    const lines = helpMessage.split("\n")
    expect(lines.length).toBeGreaterThan(10)
  })
})

describe("buildCommandHelpMessage", () => {
  it("should build detailed help for the /help command", () => {
    const helpEntry = COMMAND_REGISTRY.find((cmd) => cmd.name === "/help")!
    const message = buildCommandHelpMessage(helpEntry)

    expect(message).toContain("**Command: /help**")
    expect(message).toContain("Show available commands and how to use them")
    expect(message).toContain("**Syntax:** `/help [command]`")
    // Slash commands have no aliases.
    expect(message).not.toContain("**Aliases:**")
    expect(message).toContain("**Examples:**")
    expect(message).toContain("`/help`")
    expect(message).toContain("`/help mark finished`")
    expect(message).toContain("**Category:**")
    expect(message).toContain("Utility")
  })

  it("should build detailed help for a /mark subcommand", () => {
    const rewatchCommand = COMMAND_REGISTRY.find((cmd) => cmd.name === "/mark rewatch")!
    const message = buildCommandHelpMessage(rewatchCommand)

    expect(message).toContain("**Command: /mark rewatch**")
    expect(message).toContain("Mark media as a rewatch candidate")
    expect(message).toContain("**Syntax:** `/mark rewatch title:<name>`")
    expect(message).not.toContain("**Aliases:**")
    expect(message).toContain("`/mark rewatch title:Friends`")
    expect(message).toContain("Media")
  })

  it("should include all examples for a command", () => {
    const finishedCommand = COMMAND_REGISTRY.find((cmd) => cmd.name === "/mark finished")!
    const message = buildCommandHelpMessage(finishedCommand)

    for (const example of finishedCommand.examples) {
      expect(message).toContain(`\`${example}\``)
    }
  })

  it("should use category emoji", () => {
    // Category emojis should appear in the full help message with category labels
    const fullHelpMessage = buildFullHelpMessage()
    expect(fullHelpMessage).toMatch(/[🎬💬🛠️]/)
  })
})

describe("command registry consistency with the slash-command surface", () => {
  it("should document every top-level slash command", () => {
    // The final slash surface (see the mark/assistant/mystats/mymarks/watching
    // command modules). Each must be discoverable via /help.
    const expectedTopLevel = [
      "/help",
      "/assistant",
      "/mystats",
      "/mymarks",
      "/watching",
    ]

    for (const name of expectedTopLevel) {
      expect(findCommand(name)).toBeDefined()
    }
  })

  it("should document every /mark subcommand", () => {
    // Mirrors MARK_SUBCOMMANDS in commands/mark/index.ts.
    const expectedMarkSubcommands = [
      "/mark finished",
      "/mark keep",
      "/mark notinterested",
      "/mark rewatch",
      "/mark badquality",
    ]

    for (const name of expectedMarkSubcommands) {
      expect(findCommand(name)).toBeDefined()
    }
  })

  it("should fold assistant reset into the /assistant entry (no standalone /clear)", () => {
    expect(findCommand("/clear")).toBeUndefined()
    const assistant = findCommand("/assistant")
    expect(assistant?.description).toMatch(/reset/i)
  })
})

// ---------------------------------------------------------------------------
// Slash-command surface (`/help`)
// ---------------------------------------------------------------------------

interface EmbedData {
  title?: string
  description?: string
  fields: { name: string; value: string }[]
}

function getEmbedData(reply: jest.Mock): EmbedData {
  const call = reply.mock.calls[0][0]
  return (call.embeds[0] as { data: EmbedData }).data
}

function createMockChatInteraction(
  commandOption: string | null,
  opts: { linked?: boolean; entitled?: boolean } = {}
) {
  const reply = jest.fn().mockResolvedValue(undefined)
  const interaction = {
    options: { getString: jest.fn().mockReturnValue(commandOption) },
    reply,
  }
  // Default to a linked + entitled user so the help-rendering tests exercise the
  // real output; the gate itself is covered by a dedicated test below.
  const linked = opts.linked ?? true
  const entitled = opts.entitled ?? true
  const verifiedUser = linked
    ? {
        linked: true,
        entitled,
        user: {
          id: "user-1",
          name: "Test User",
          email: "t@example.com",
          plexUserId: "plex-1",
          isAdmin: false,
        },
      }
    : { linked: false, entitled: false }
  const ctx = {
    interaction,
    verifiedUser,
    discordUserId: "discord-user-id",
    channelId: "channel-id",
  } as unknown as InteractionContext
  return { ctx, interaction, reply }
}

function createMockAutocompleteInteraction(focused: string) {
  const respond = jest.fn().mockResolvedValue(undefined)
  const interaction = {
    commandName: "help",
    options: { getFocused: jest.fn().mockReturnValue(focused) },
    respond,
  } as unknown as AutocompleteInteraction
  return { interaction, respond }
}

describe("helpCommand (slash)", () => {
  it("registers as /help with an autocompleting command option", () => {
    expect(helpCommand.data.name).toBe("help")
    expect(helpCommand.commandType).toBe("HELP")
    const option = (helpCommand.data as unknown as {
      options: { name: string; autocomplete: boolean }[]
    }).options[0]
    expect(option.name).toBe("command")
    expect(option.autocomplete).toBe(true)
    expect(typeof helpCommand.autocomplete).toBe("function")
  })

  describe("handle - entitlement gate", () => {
    it("nudges an unlinked user with the portal link and renders no help embed", async () => {
      const { ctx, reply } = createMockChatInteraction(null, { linked: false })

      await helpCommand.handle(ctx)

      expect(reply).toHaveBeenCalledTimes(1)
      const call = reply.mock.calls[0][0]
      expect(call.flags).toBe(64) // ephemeral
      expect(call.content).toContain("link your account")
      expect(call.embeds).toBeUndefined()
    })

    it("nudges a linked-but-unentitled user about membership", async () => {
      const { ctx, reply } = createMockChatInteraction(null, {
        linked: true,
        entitled: false,
      })

      await helpCommand.handle(ctx)

      expect(reply).toHaveBeenCalledTimes(1)
      expect(reply.mock.calls[0][0].content).toContain("active membership")
      expect(reply.mock.calls[0][0].embeds).toBeUndefined()
    })
  })

  describe("handle - no command argument", () => {
    it("replies ephemerally with a full-help embed grouped by category", async () => {
      const { ctx, reply } = createMockChatInteraction(null)

      await helpCommand.handle(ctx)

      expect(reply).toHaveBeenCalledTimes(1)
      const call = reply.mock.calls[0][0]
      expect(call.flags).toBe(64) // MessageFlags.Ephemeral
      const embed = getEmbedData(reply)
      expect(embed.title).toBe("Available Commands")

      const fieldNames = embed.fields.map((f) => f.name).join(" ")
      expect(fieldNames).toContain("Utility")
      expect(fieldNames).toContain("Chat & Assistant")
      expect(fieldNames).toContain("Media")
      expect(fieldNames).not.toContain("Context Management")

      const allValues = embed.fields.map((f) => f.value).join("\n")
      expect(allValues).toContain("/help [command]")
      expect(allValues).toContain("Show available commands and how to use them")
      expect(allValues).toContain("/mark finished title:<name>")
    })

    it("respects Discord embed structural limits", async () => {
      const { ctx, reply } = createMockChatInteraction(null)

      await helpCommand.handle(ctx)

      const embed = getEmbedData(reply)
      expect(embed.fields.length).toBeLessThanOrEqual(25)
      let total = (embed.title?.length ?? 0) + (embed.description?.length ?? 0)
      for (const field of embed.fields) {
        expect(field.value.length).toBeLessThanOrEqual(1024)
        total += field.name.length + field.value.length
      }
      expect(total).toBeLessThanOrEqual(6000)
    })
  })

  describe("handle - specific command argument", () => {
    it("replies ephemerally with a detailed embed for a known command", async () => {
      const { ctx, reply } = createMockChatInteraction("mark finished")

      await helpCommand.handle(ctx)

      expect(reply).toHaveBeenCalledTimes(1)
      const call = reply.mock.calls[0][0]
      expect(call.flags).toBe(64)
      const embed = getEmbedData(reply)
      expect(embed.title).toBe("Command: /mark finished")
      expect(embed.description).toContain("Mark media as finished watching")

      const byName = Object.fromEntries(embed.fields.map((f) => [f.name, f.value]))
      expect(byName["Syntax"]).toBe("`/mark finished title:<name>`")
      expect(byName["Examples"]).toContain("`/mark finished title:The Office`")
      expect(byName["Category"]).toContain("Media")
    })

    it("resolves a command without its leading slash", async () => {
      const { ctx, reply } = createMockChatInteraction("mystats")

      await helpCommand.handle(ctx)

      const embed = getEmbedData(reply)
      expect(embed.title).toBe("Command: /mystats")
    })

    it("omits the Aliases field (slash commands have no aliases)", async () => {
      const { ctx, reply } = createMockChatInteraction("mark rewatch")

      await helpCommand.handle(ctx)

      const embed = getEmbedData(reply)
      expect(embed.title).toBe("Command: /mark rewatch")
      expect(embed.fields.map((f) => f.name)).not.toContain("Aliases")
    })

    it("replies ephemerally with a not-found message for an unknown command", async () => {
      const { ctx, reply } = createMockChatInteraction("bogus")

      await helpCommand.handle(ctx)

      expect(reply).toHaveBeenCalledWith({
        content: expect.stringContaining("Command not found: `bogus`"),
        flags: 64,
      })
    })
  })

  describe("autocomplete", () => {
    it("returns command-name matches filtered by the typed prefix", async () => {
      const { interaction, respond } = createMockAutocompleteInteraction("my")

      await helpCommand.autocomplete!(interaction)

      expect(respond).toHaveBeenCalledTimes(1)
      const choices = respond.mock.calls[0][0] as { name: string; value: string }[]
      expect(choices).toContainEqual({ name: "mystats", value: "mystats" })
      expect(choices).toContainEqual({ name: "mymarks", value: "mymarks" })
      expect(choices.every((c) => c.name.startsWith("my"))).toBe(true)
    })

    it("matches /mark subcommands by their full (space-separated) name", async () => {
      const { interaction, respond } = createMockAutocompleteInteraction("mark f")

      await helpCommand.autocomplete!(interaction)

      const choices = respond.mock.calls[0][0] as { name: string; value: string }[]
      expect(choices).toContainEqual({ name: "mark finished", value: "mark finished" })
    })

    it("ignores a leading / in the typed value", async () => {
      const { interaction, respond } = createMockAutocompleteInteraction("/help")

      await helpCommand.autocomplete!(interaction)

      const choices = respond.mock.calls[0][0] as { name: string; value: string }[]
      expect(choices).toContainEqual({ name: "help", value: "help" })
    })

    it("returns every command (no prefix) but never more than 25 choices", async () => {
      const { interaction, respond } = createMockAutocompleteInteraction("")

      await helpCommand.autocomplete!(interaction)

      const choices = respond.mock.calls[0][0] as { name: string; value: string }[]
      expect(choices.length).toBe(COMMAND_REGISTRY.length)
      expect(choices.length).toBeLessThanOrEqual(25)
    })

    it("returns an empty list when nothing matches", async () => {
      const { interaction, respond } = createMockAutocompleteInteraction("zzz")

      await helpCommand.autocomplete!(interaction)

      expect(respond).toHaveBeenCalledWith([])
    })
  })
})
