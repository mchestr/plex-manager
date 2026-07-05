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
  it("should contain help command definition", () => {
    const helpCommand = COMMAND_REGISTRY.find((cmd) => cmd.name === "!help")
    expect(helpCommand).toBeDefined()
    expect(helpCommand?.aliases).toContain("!commands")
    expect(helpCommand?.category).toBe("utility")
  })

  it("should contain assistant command definition", () => {
    const assistantCommand = COMMAND_REGISTRY.find((cmd) => cmd.name === "!assistant")
    expect(assistantCommand).toBeDefined()
    expect(assistantCommand?.aliases).toEqual(["!bot", "!support"])
    expect(assistantCommand?.category).toBe("chat")
  })

  it("should contain clear command definition", () => {
    const clearCommand = COMMAND_REGISTRY.find((cmd) => cmd.name === "!clear")
    expect(clearCommand).toBeDefined()
    expect(clearCommand?.aliases).toEqual(["!reset", "!clearcontext"])
    expect(clearCommand?.category).toBe("context")
  })

  it("should contain all media marking commands", () => {
    const mediaCommands = COMMAND_REGISTRY.filter((cmd) => cmd.category === "media")
    expect(mediaCommands.length).toBeGreaterThan(0)

    // Check for specific media commands
    const finishedCommand = mediaCommands.find((cmd) => cmd.name === "!finished")
    expect(finishedCommand).toBeDefined()
    expect(finishedCommand?.aliases).toContain("!done")
    expect(finishedCommand?.aliases).toContain("!watched")

    const notInterestedCommand = mediaCommands.find((cmd) => cmd.name === "!notinterested")
    expect(notInterestedCommand).toBeDefined()
    expect(notInterestedCommand?.aliases).toContain("!skip")
    expect(notInterestedCommand?.aliases).toContain("!pass")

    const keepCommand = mediaCommands.find((cmd) => cmd.name === "!keep")
    expect(keepCommand).toBeDefined()
    expect(keepCommand?.aliases).toContain("!favorite")
    expect(keepCommand?.aliases).toContain("!fav")

    const rewatchCommand = mediaCommands.find((cmd) => cmd.name === "!rewatch")
    expect(rewatchCommand).toBeDefined()

    const badQualityCommand = mediaCommands.find((cmd) => cmd.name === "!badquality")
    expect(badQualityCommand).toBeDefined()
    expect(badQualityCommand?.aliases).toContain("!lowquality")
  })

  it("should have valid structure for all commands", () => {
    for (const command of COMMAND_REGISTRY) {
      expect(command.name).toBeTruthy()
      expect(command.name.startsWith("!")).toBe(true)
      expect(command.description).toBeTruthy()
      expect(command.syntax).toBeTruthy()
      expect(command.examples.length).toBeGreaterThan(0)
      expect(["chat", "media", "context", "utility"]).toContain(command.category)
      expect(Array.isArray(command.aliases)).toBe(true)
    }
  })
})

describe("findCommand", () => {
  it("should find command by exact name", () => {
    const command = findCommand("!help")
    expect(command).toBeDefined()
    expect(command?.name).toBe("!help")
  })

  it("should find command by name without prefix", () => {
    const command = findCommand("help")
    expect(command).toBeDefined()
    expect(command?.name).toBe("!help")
  })

  it("should find command by alias", () => {
    const command = findCommand("!commands")
    expect(command).toBeDefined()
    expect(command?.name).toBe("!help")
  })

  it("should find command by alias without prefix", () => {
    const command = findCommand("commands")
    expect(command).toBeDefined()
    expect(command?.name).toBe("!help")
  })

  it("should be case insensitive", () => {
    const command1 = findCommand("HELP")
    const command2 = findCommand("!HELP")
    const command3 = findCommand("Help")
    expect(command1).toBeDefined()
    expect(command2).toBeDefined()
    expect(command3).toBeDefined()
    expect(command1?.name).toBe("!help")
    expect(command2?.name).toBe("!help")
    expect(command3?.name).toBe("!help")
  })

  it("should find media commands by alias", () => {
    const doneCommand = findCommand("done")
    expect(doneCommand).toBeDefined()
    expect(doneCommand?.name).toBe("!finished")

    const skipCommand = findCommand("skip")
    expect(skipCommand).toBeDefined()
    expect(skipCommand?.name).toBe("!notinterested")

    const favCommand = findCommand("fav")
    expect(favCommand).toBeDefined()
    expect(favCommand?.name).toBe("!keep")
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

  it("should include all category headers", () => {
    expect(helpMessage).toContain("**Utility**")
    expect(helpMessage).toContain("**Chat & Assistant**")
    expect(helpMessage).toContain("**Context Management**")
    expect(helpMessage).toContain("**Media Marking**")
  })

  it("should include command syntax in code blocks", () => {
    expect(helpMessage).toContain("`!help [command]`")
    expect(helpMessage).toContain("`!assistant <message>`")
    expect(helpMessage).toContain("`!clear`")
    expect(helpMessage).toContain("`!finished <title>`")
  })

  it("should include aliases for commands with aliases", () => {
    expect(helpMessage).toContain("(or !commands)")
    expect(helpMessage).toContain("(or !bot, !support)")
    expect(helpMessage).toContain("(or !done, !watched)")
  })

  it("should include command descriptions", () => {
    expect(helpMessage).toContain("Display available commands and usage information")
    expect(helpMessage).toContain("Start a conversation with the AI assistant")
    expect(helpMessage).toContain("Clear your conversation context and start fresh")
    expect(helpMessage).toContain("Mark media as finished watching")
  })

  it("should include tips section", () => {
    expect(helpMessage).toContain("**Tips:**")
    expect(helpMessage).toContain("Use `!help <command>` for detailed info")
    expect(helpMessage).toContain("DM me directly")
    expect(helpMessage).toContain("@mention")
    expect(helpMessage).toContain("Media commands search your Plex library")
  })

  it("should have proper formatting with newlines", () => {
    const lines = helpMessage.split("\n")
    expect(lines.length).toBeGreaterThan(10)
  })
})

describe("buildCommandHelpMessage", () => {
  it("should build detailed help for a command with aliases", () => {
    const helpCommand = COMMAND_REGISTRY.find((cmd) => cmd.name === "!help")!
    const message = buildCommandHelpMessage(helpCommand)

    expect(message).toContain("**Command: !help**")
    expect(message).toContain("Display available commands and usage information")
    expect(message).toContain("**Syntax:** `!help [command]`")
    expect(message).toContain("**Aliases:** `!commands`")
    expect(message).toContain("**Examples:**")
    expect(message).toContain("`!help`")
    expect(message).toContain("`!help finished`")
    expect(message).toContain("**Category:**")
    expect(message).toContain("Utility")
  })

  it("should build detailed help for a command without aliases", () => {
    const rewatchCommand = COMMAND_REGISTRY.find((cmd) => cmd.name === "!rewatch")!
    const message = buildCommandHelpMessage(rewatchCommand)

    expect(message).toContain("**Command: !rewatch**")
    expect(message).toContain("Mark media as a rewatch candidate")
    expect(message).toContain("**Syntax:** `!rewatch <title>`")
    expect(message).not.toContain("**Aliases:**")
    expect(message).toContain("`!rewatch Friends`")
    expect(message).toContain("Media Marking")
  })

  it("should include all examples for a command", () => {
    const finishedCommand = COMMAND_REGISTRY.find((cmd) => cmd.name === "!finished")!
    const message = buildCommandHelpMessage(finishedCommand)

    for (const example of finishedCommand.examples) {
      expect(message).toContain(`\`${example}\``)
    }
  })

  it("should use category emoji", () => {
    const mediaCommand = COMMAND_REGISTRY.find((cmd) => cmd.category === "media")!
    const chatCommand = COMMAND_REGISTRY.find((cmd) => cmd.category === "chat")!
    const contextCommand = COMMAND_REGISTRY.find((cmd) => cmd.category === "context")!
    const utilityCommand = COMMAND_REGISTRY.find((cmd) => cmd.category === "utility")!

    // Category emojis should appear in the full help message with category labels
    const fullHelpMessage = buildFullHelpMessage()
    expect(fullHelpMessage).toMatch(/[🎬💬🔄🛠️]/)
  })
})

describe("command registry consistency with bot commands", () => {
  it("should document all chat trigger prefixes", () => {
    // These are from bot.ts: CHAT_TRIGGER_PREFIXES = ["!assistant", "!bot", "!support"]
    const assistantCommand = COMMAND_REGISTRY.find((cmd) => cmd.name === "!assistant")
    expect(assistantCommand).toBeDefined()
    expect(assistantCommand?.aliases).toContain("!bot")
    expect(assistantCommand?.aliases).toContain("!support")
  })

  it("should document all clear commands", () => {
    // These are from bot.ts: CLEAR_COMMANDS = ["!clear", "!reset", "!clearcontext"]
    const clearCommand = COMMAND_REGISTRY.find((cmd) => cmd.name === "!clear")
    expect(clearCommand).toBeDefined()
    expect(clearCommand?.aliases).toContain("!reset")
    expect(clearCommand?.aliases).toContain("!clearcontext")
  })

  it("should document all media marking commands", () => {
    // The legacy `!`-prefixed media aliases the registry documents for /help.
    const expectedMediaCommands = [
      "!finished",
      "!done",
      "!watched",
      "!notinterested",
      "!skip",
      "!pass",
      "!keep",
      "!favorite",
      "!fav",
      "!rewatch",
      "!badquality",
      "!lowquality",
    ]

    for (const expectedCmd of expectedMediaCommands) {
      const found = findCommand(expectedCmd)
      expect(found).toBeDefined()
    }
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

function createMockChatInteraction(commandOption: string | null) {
  const reply = jest.fn().mockResolvedValue(undefined)
  const interaction = {
    options: { getString: jest.fn().mockReturnValue(commandOption) },
    reply,
  }
  const ctx = {
    interaction,
    verifiedUser: { linked: false },
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
      expect(fieldNames).toContain("Context Management")
      expect(fieldNames).toContain("Media Marking")

      const allValues = embed.fields.map((f) => f.value).join("\n")
      expect(allValues).toContain("!help [command]")
      expect(allValues).toContain("Display available commands and usage information")
      expect(allValues).toContain("(or !done, !watched)")
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
      const { ctx, reply } = createMockChatInteraction("finished")

      await helpCommand.handle(ctx)

      expect(reply).toHaveBeenCalledTimes(1)
      const call = reply.mock.calls[0][0]
      expect(call.flags).toBe(64)
      const embed = getEmbedData(reply)
      expect(embed.title).toBe("Command: !finished")
      expect(embed.description).toContain("Mark media as finished watching")

      const byName = Object.fromEntries(embed.fields.map((f) => [f.name, f.value]))
      expect(byName["Syntax"]).toBe("`!finished <title>`")
      expect(byName["Examples"]).toContain("`!finished The Office`")
      expect(byName["Aliases"]).toContain("`!done`")
      expect(byName["Category"]).toContain("Media Marking")
    })

    it("resolves a command by alias", async () => {
      const { ctx, reply } = createMockChatInteraction("done")

      await helpCommand.handle(ctx)

      const embed = getEmbedData(reply)
      expect(embed.title).toBe("Command: !finished")
    })

    it("omits the Aliases field for a command without aliases", async () => {
      const { ctx, reply } = createMockChatInteraction("rewatch")

      await helpCommand.handle(ctx)

      const embed = getEmbedData(reply)
      expect(embed.title).toBe("Command: !rewatch")
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
      const { interaction, respond } = createMockAutocompleteInteraction("fin")

      await helpCommand.autocomplete!(interaction)

      expect(respond).toHaveBeenCalledTimes(1)
      const choices = respond.mock.calls[0][0] as { name: string; value: string }[]
      expect(choices).toContainEqual({ name: "finished", value: "finished" })
      expect(choices.every((c) => c.name.startsWith("fin"))).toBe(true)
    })

    it("ignores a leading ! in the typed value", async () => {
      const { interaction, respond } = createMockAutocompleteInteraction("!kee")

      await helpCommand.autocomplete!(interaction)

      const choices = respond.mock.calls[0][0] as { name: string; value: string }[]
      expect(choices).toContainEqual({ name: "keep", value: "keep" })
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
