/**
 * The chat action stores the turn's tool log with the answer and never
 * returns it: the reply goes to the browser.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession, type Session } from "next-auth"

import { chatWithAdminBot } from "@/actions/chatbot"
import { asTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { runChatbotForUser } from "@/lib/chatbot/assistant"
import { serializeToolLog } from "@/lib/judge/tool-log"
import { getFormatSettings } from "@/lib/settings/app-settings"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("next/cache", () => ({ ...jest.requireActual<object>("next/cache"), refresh: jest.fn() }))
jest.mock("@/lib/chatbot/assistant", () => ({ runChatbotForUser: jest.fn() }))
jest.mock("@/lib/settings/app-settings", () => ({ getFormatSettings: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
}))

const session: Session = { user: { id: "admin-1", name: "Admin", isAdmin: true }, expires: "2099-01-01T00:00:00.000Z" }
const TOOL_LOG = [{ tool: "get_sonarr_queue", args: "{}", result: '{"records":["Andor S02E01"]}', ok: true }]

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(getServerSession).mockResolvedValue(session)
  jest.mocked(getFormatSettings).mockResolvedValue({ timeZone: "UTC", locale: "en-US" })
  prismaMock.$transaction.mockImplementation((callback) => callback(asTransactionClient(prismaMock)))
  prismaMock.chatConversation.updateMany.mockResolvedValue({ count: 1 })
  jest.mocked(runChatbotForUser).mockResolvedValue({
    response: {
      success: true,
      message: { role: "assistant", content: "Andor is downloading.", timestamp: Date.now() },
      conversationId: "conv-1",
    },
    toolLog: TOOL_LOG,
  })
})

describe("chatWithAdminBot tool log", () => {
  it("the chat action passes toolLog to saveTurn and its result has no toolLog", async () => {
    const result = await chatWithAdminBot({ message: "What's downloading?" })

    expect(result).toEqual({
      success: true,
      data: { message: { role: "assistant", content: "Andor is downloading.", timestamp: expect.any(Number) }, conversationId: "conv-1" },
    })
    expect(JSON.stringify(result)).not.toContain("Andor S02E01")
    expect(prismaMock.chatConversationMessage.createMany).toHaveBeenCalledWith({
      data: [
        expect.not.objectContaining({ toolLog: expect.anything() }),
        expect.objectContaining({ role: "assistant", toolLog: serializeToolLog(TOOL_LOG) }),
      ],
    })
  })
})
