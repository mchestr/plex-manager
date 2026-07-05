/**
 * Tests for the `/assistant` slash command (Step 13).
 *
 * discord.js is stubbed (jsdom can't load the @discordjs/rest → undici stack);
 * the builders record just enough state for assertions. The Discord chat and
 * clear services are mocked so both subcommands are exercised without a live
 * gateway or database.
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
  return {
    MessageFlags: { Ephemeral: 64 },
    SlashCommandBuilder,
  }
})

jest.mock("@/lib/discord/services", () => ({
  handleDiscordChat: jest.fn(),
  clearDiscordChat: jest.fn(),
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))

import { assistantCommand } from "../assistant"
import { handleDiscordChat, clearDiscordChat } from "@/lib/discord/services"
import type { InteractionContext } from "../registry"
import type {
  ClearChatResult,
  DiscordChatResult,
  VerifyDiscordUserResult,
} from "@/lib/discord/services"

const mockChat = handleDiscordChat as jest.MockedFunction<typeof handleDiscordChat>
const mockClear = clearDiscordChat as jest.MockedFunction<typeof clearDiscordChat>

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

const chatSuccess: DiscordChatResult = {
  success: true,
  linked: true,
  message: { role: "assistant", content: "Everything looks healthy.", timestamp: 0 },
  conversationId: "conv-1",
}

const clearSuccess: ClearChatResult = {
  success: true,
  linked: true,
  conversationId: "conv-2",
}

interface MockChatOptions {
  subcommand?: string
  prompt?: string
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
      getSubcommand: () => options.subcommand ?? "ask",
      getString: (_name: string, _required?: boolean) => options.prompt ?? "how is everything?",
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

beforeEach(() => {
  jest.clearAllMocks()
  mockChat.mockResolvedValue(chatSuccess)
  mockClear.mockResolvedValue(clearSuccess)
})

describe("assistantCommand.data", () => {
  it("registers name 'assistant' with `ask` and `reset` subcommands", () => {
    const data = assistantCommand.data as unknown as {
      name: string
      subcommands: { name: string; options: { name: string; required: boolean }[] }[]
    }
    expect(data.name).toBe("assistant")
    expect(data.subcommands.map((s) => s.name).sort()).toEqual(["ask", "reset"])
  })

  it("gives `ask` a required `prompt` option and `reset` no options", () => {
    const data = assistantCommand.data as unknown as {
      subcommands: { name: string; options: { name: string; required: boolean }[] }[]
    }
    const ask = data.subcommands.find((s) => s.name === "ask")!
    const reset = data.subcommands.find((s) => s.name === "reset")!
    expect(ask.options).toHaveLength(1)
    expect(ask.options[0]).toMatchObject({ name: "prompt", required: true })
    expect(reset.options).toHaveLength(0)
  })

  it("uses the CHAT audit type", () => {
    expect(assistantCommand.commandType).toBe("CHAT")
  })
})

describe("assistantCommand.handle — ask", () => {
  it("nudges an unlinked user ephemerally and never chats", async () => {
    const { ctx, reply } = createMockContext({ linked: false })

    await assistantCommand.handle(ctx)

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("link your account"),
        flags: 64,
      })
    )
    expect(mockChat).not.toHaveBeenCalled()
  })

  it("defers ephemerally, runs the chat, and edits the reply with the answer", async () => {
    const { ctx, deferReply, editReply } = createMockContext({
      subcommand: "ask",
      prompt: "is the queue stuck?",
    })

    await assistantCommand.handle(ctx)

    expect(deferReply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }))
    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        discordUserId: "discord-user-1",
        channelId: "channel-1",
        message: "is the queue stuck?",
      })
    )
    const editArg = editReply.mock.calls[0][0]
    expect(editArg.content).toContain("Everything looks healthy.")
    // Points the user to DM the bot for the ongoing conversation.
    expect(editArg.content).toMatch(/DM/i)
  })

  it("nudges via editReply when the chat result reports the user is not linked", async () => {
    mockChat.mockResolvedValue({ success: false, linked: false, error: "not linked" })
    const { ctx, editReply } = createMockContext({ subcommand: "ask" })

    await assistantCommand.handle(ctx)

    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("link your account") })
    )
  })

  it("surfaces a friendly error via editReply when the chat fails", async () => {
    mockChat.mockResolvedValue({ success: false, linked: true, error: "boom" })
    const { ctx, editReply } = createMockContext({ subcommand: "ask" })

    await assistantCommand.handle(ctx)

    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("couldn't reach the assistant") })
    )
  })
})

describe("assistantCommand.handle — reset", () => {
  it("nudges an unlinked user ephemerally and never clears", async () => {
    const { ctx, reply } = createMockContext({ subcommand: "reset", linked: false })

    await assistantCommand.handle(ctx)

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("link your account"),
        flags: 64,
      })
    )
    expect(mockClear).not.toHaveBeenCalled()
  })

  it("clears the chat context and confirms ephemerally", async () => {
    const { ctx, reply } = createMockContext({ subcommand: "reset" })

    await assistantCommand.handle(ctx)

    expect(mockClear).toHaveBeenCalledWith({
      discordUserId: "discord-user-1",
      channelId: "channel-1",
    })
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("cleared"),
        flags: 64,
      })
    )
  })

  it("surfaces a friendly error ephemerally when the clear fails", async () => {
    mockClear.mockResolvedValue({ success: false, linked: true, error: "boom" })
    const { ctx, reply } = createMockContext({ subcommand: "reset" })

    await assistantCommand.handle(ctx)

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("couldn't clear") })
    )
  })
})
