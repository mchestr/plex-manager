/**
 * @jest-environment node
 */

/**
 * A Discord chat stores its turns as plaintext JSON on its session, so the
 * judge's tool log must never reach it: handleDiscordChat reads only the
 * run's response.
 */

import { mockReset } from "jest-mock-extended"

import { buildConfig } from "@/__tests__/helpers/factories"
import { asTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { runChatbotForUser } from "@/lib/chatbot/assistant"
import { getOrCreateSession } from "@/lib/discord/chat-session"
import { handleDiscordChat } from "@/lib/discord/services"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/chatbot/assistant", () => ({ runChatbotForUser: jest.fn() }))
jest.mock("@/lib/discord/chat-session", () => ({
  ...jest.requireActual<object>("@/lib/discord/chat-session"),
  getOrCreateSession: jest.fn(),
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
}))

const TOOL_RESULT = '{"records":["Andor S02E01"],"downloadUrl":"http://indexer/get?id=1"}'

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.discordConnection.findUnique.mockResolvedValue({
    id: "connection-1",
    discordUserId: "discord-1",
    userId: "user-1",
    revokedAt: null,
    user: { id: "user-1", isAdmin: false, isExempt: false, disabledAt: null, timezone: null, subscription: null },
  } as never)
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled: false }))
  prismaMock.$transaction.mockImplementation((callback) => callback(asTransactionClient(prismaMock)))
  prismaMock.discordChatSession.findUnique.mockResolvedValue(null)
  jest.mocked(getOrCreateSession).mockResolvedValue({ id: "session-1", chatConversationId: "conv-1", history: [], created: false })
  jest.mocked(runChatbotForUser).mockResolvedValue({
    response: {
      success: true,
      message: { role: "assistant", content: "Andor is downloading.", timestamp: Date.now() },
      conversationId: "conv-1",
    },
    toolLog: [{ tool: "get_sonarr_queue", args: "{}", result: TOOL_RESULT, ok: true }],
  })
})

describe("handleDiscordChat tool log", () => {
  it("a Discord session's stored messages JSON has no toolLog", async () => {
    const result = await handleDiscordChat({ discordUserId: "discord-1", channelId: "channel-1", message: "What's downloading?" })

    expect(result).toMatchObject({ success: true, message: { content: "Andor is downloading." } })
    expect(prismaMock.discordChatSession.update).toHaveBeenCalledTimes(1)
    const stored = JSON.stringify(prismaMock.discordChatSession.update.mock.calls[0][0].data.messages)
    expect(stored).toContain("Andor is downloading.")
    expect(stored).not.toContain("toolLog")
    expect(stored).not.toContain("Andor S02E01")
    expect(JSON.stringify(result)).not.toContain("toolLog")
  })
})
