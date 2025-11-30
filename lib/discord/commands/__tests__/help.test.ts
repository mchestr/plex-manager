import { type Message } from "discord.js"
import {
  COMMAND_REGISTRY,
  HELP_COMMANDS,
  findCommand,
  buildFullHelpMessage,
  buildCommandHelpMessage,
  handleHelpCommand,
  type CommandDefinition,
} from "../help"

// Mock Discord.js Message
function createMockMessage(overrides: Partial<Message> = {}): Message {
  const mockReply = jest.fn().mockResolvedValue({})

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
    reply: mockReply,
    ...overrides,
  } as unknown as Message
}

describe("HELP_COMMANDS", () => {
  it("should include !help and !commands", () => {
    expect(HELP_COMMANDS).toContain("!help")
    expect(HELP_COMMANDS).toContain("!commands")
  })
})

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

describe("handleHelpCommand", () => {
  let mockMessage: Message

  beforeEach(() => {
    jest.clearAllMocks()
    mockMessage = createMockMessage()
  })

  describe("full help (no arguments)", () => {
    it("should reply with full help message when no args provided", async () => {
      await handleHelpCommand(mockMessage, [])

      expect(mockMessage.reply).toHaveBeenCalledTimes(1)
      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("**Available Commands**"),
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should include all category sections in reply", async () => {
      await handleHelpCommand(mockMessage, [])

      const replyCall = (mockMessage.reply as jest.Mock).mock.calls[0][0]
      expect(replyCall.content).toContain("**Utility**")
      expect(replyCall.content).toContain("**Chat & Assistant**")
      expect(replyCall.content).toContain("**Context Management**")
      expect(replyCall.content).toContain("**Media Marking**")
    })
  })

  describe("command-specific help", () => {
    it("should reply with specific command help when valid command provided", async () => {
      await handleHelpCommand(mockMessage, ["finished"])

      expect(mockMessage.reply).toHaveBeenCalledTimes(1)
      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("**Command: !finished**"),
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should find command with ! prefix", async () => {
      await handleHelpCommand(mockMessage, ["!finished"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("**Command: !finished**"),
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should find command by alias", async () => {
      await handleHelpCommand(mockMessage, ["done"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("**Command: !finished**"),
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should be case insensitive", async () => {
      await handleHelpCommand(mockMessage, ["FINISHED"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("**Command: !finished**"),
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should reply with not found message for unknown command", async () => {
      await handleHelpCommand(mockMessage, ["unknowncommand"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: "Command not found: `unknowncommand`. Use `!help` to see all available commands.",
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should include examples in specific command help", async () => {
      await handleHelpCommand(mockMessage, ["assistant"])

      const replyCall = (mockMessage.reply as jest.Mock).mock.calls[0][0]
      expect(replyCall.content).toContain("**Examples:**")
      expect(replyCall.content).toContain("`!assistant How do I request a movie?`")
    })

    it("should include syntax in specific command help", async () => {
      await handleHelpCommand(mockMessage, ["keep"])

      const replyCall = (mockMessage.reply as jest.Mock).mock.calls[0][0]
      expect(replyCall.content).toContain("**Syntax:** `!keep <title>`")
    })

    it("should include aliases in specific command help", async () => {
      await handleHelpCommand(mockMessage, ["notinterested"])

      const replyCall = (mockMessage.reply as jest.Mock).mock.calls[0][0]
      expect(replyCall.content).toContain("**Aliases:** `!skip`, `!pass`")
    })
  })

  describe("help command variations", () => {
    it("should work with help command itself", async () => {
      await handleHelpCommand(mockMessage, ["help"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("**Command: !help**"),
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should work with commands alias", async () => {
      await handleHelpCommand(mockMessage, ["commands"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("**Command: !help**"),
        allowedMentions: { users: ["test-user-id"] },
      })
    })
  })

  describe("all registered commands", () => {
    it("should be able to get help for every command in registry", async () => {
      for (const command of COMMAND_REGISTRY) {
        jest.clearAllMocks()
        mockMessage = createMockMessage()

        // Test with command name
        const nameWithoutPrefix = command.name.replace(/^!/, "")
        await handleHelpCommand(mockMessage, [nameWithoutPrefix])

        expect(mockMessage.reply).toHaveBeenCalledWith({
          content: expect.stringContaining(`**Command: ${command.name}**`),
          allowedMentions: { users: ["test-user-id"] },
        })
      }
    })

    it("should be able to find help via any alias", async () => {
      for (const command of COMMAND_REGISTRY) {
        for (const alias of command.aliases) {
          jest.clearAllMocks()
          mockMessage = createMockMessage()

          const aliasWithoutPrefix = alias.replace(/^!/, "")
          await handleHelpCommand(mockMessage, [aliasWithoutPrefix])

          expect(mockMessage.reply).toHaveBeenCalledWith({
            content: expect.stringContaining(`**Command: ${command.name}**`),
            allowedMentions: { users: ["test-user-id"] },
          })
        }
      }
    })
  })

  describe("edge cases", () => {
    it("should handle empty string in args array", async () => {
      await handleHelpCommand(mockMessage, [""])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("Command not found"),
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should only use first argument for command lookup", async () => {
      await handleHelpCommand(mockMessage, ["finished", "extra", "args"])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("**Command: !finished**"),
        allowedMentions: { users: ["test-user-id"] },
      })
    })

    it("should handle whitespace in argument", async () => {
      await handleHelpCommand(mockMessage, ["  finished  ".trim()])

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("**Command: !finished**"),
        allowedMentions: { users: ["test-user-id"] },
      })
    })
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
    // These are from media-marking.ts MARK_COMMANDS
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
