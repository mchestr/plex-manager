/**
 * @jest-environment node
 */

/**
 * runConversationLoop keeps a log of the turn's tool calls for the judge,
 * redacted and capped before it leaves the loop. The model itself still gets
 * each output whole.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { chatWithTools, type ChatToolCall, type ChatWithToolsResult } from "@/lib/llm/chat"

import { runConversationLoop } from "../conversation"
import { executeToolCall } from "../executors"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/llm/chat", () => ({ chatWithTools: jest.fn() }))
jest.mock("../executors", () => ({ ...jest.requireActual<object>("../executors"), executeToolCall: jest.fn() }))
jest.mock("@/lib/data/assistant-data", () => ({}))
jest.mock("@/lib/admin/queues", () => ({ listQueueJobs: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
}))

function turn(partial: Partial<Extract<ChatWithToolsResult, { ok: true }>>): ChatWithToolsResult {
  return {
    ok: true,
    content: "",
    toolCalls: [],
    responseMessages: [{ role: "assistant", content: partial.content ?? "" }],
    usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1, reasoningTokens: 0 },
    modelId: "gpt-4o",
    ...partial,
  }
}

const toolCall = (id: string, name: string, args: string): ChatToolCall => ({ id, type: "function", function: { name, arguments: args } })

const CONFIG = { userId: "admin-1", conversationId: "conv-1", isAdmin: true, systemPrompt: "system", format: { timeZone: "UTC", locale: "en-US" } }
const QUEUE = JSON.stringify({ apiKey: "sonarr-key-1", records: "r".repeat(20 * 1024) })

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(chatWithTools).mockReset()
  jest.mocked(executeToolCall).mockReset()
  prismaMock.lLMUsage.aggregate.mockResolvedValue({ _sum: { cost: 0 } } as Awaited<ReturnType<typeof prismaMock.lLMUsage.aggregate>>)
})

describe("runConversationLoop tool log", () => {
  it('runConversationLoop returns a capped toolLog, and an "Error: …" output is ok: false', async () => {
    jest
      .mocked(chatWithTools)
      .mockResolvedValueOnce(
        turn({
          toolCalls: [toolCall("call-1", "get_sonarr_queue", '{"password":"hunter2"}'), toolCall("call-2", "get_made_up", "{}")],
        })
      )
      .mockResolvedValueOnce(turn({ content: "One item is downloading." }))
    jest.mocked(executeToolCall).mockImplementation(async (call) => (call.function.name === "get_sonarr_queue" ? QUEUE : "Error: Unknown tool"))

    const result = await runConversationLoop([{ role: "user", content: "What's downloading?", timestamp: 0 }], CONFIG)

    expect(result.success).toBe(true)
    expect(result.toolLog).toHaveLength(2)
    const [queue, unknown] = result.toolLog ?? []
    expect(queue).toMatchObject({ tool: "get_sonarr_queue", ok: true, truncated: true })
    expect(queue.args).not.toContain("hunter2")
    expect(queue.result).not.toContain("sonarr-key-1")
    expect(queue.result.length).toBeLessThanOrEqual(8192)
    expect(unknown).toEqual({ tool: "get_made_up", args: "{}", result: "Error: Unknown tool", ok: false })
    // The log never rides on the message the browser and Discord receive
    expect(result.message).not.toHaveProperty("toolLog")

    // The model read the output whole: the log is a copy, not what the loop sent
    const sent = JSON.stringify(jest.mocked(chatWithTools).mock.calls[1][0].messages)
    expect(sent).toContain("sonarr-key-1")
  })

  it("gathers the calls of every step in the turn", async () => {
    jest
      .mocked(chatWithTools)
      .mockResolvedValueOnce(turn({ toolCalls: [toolCall("call-1", "get_plex_sessions", "{}")] }))
      .mockResolvedValueOnce(turn({ toolCalls: [toolCall("call-2", "get_tautulli_activity", "{}")] }))
      .mockResolvedValueOnce(turn({ content: "Two streams." }))
    jest.mocked(executeToolCall).mockResolvedValue('{"size":2}')

    const result = await runConversationLoop([{ role: "user", content: "Who is streaming?", timestamp: 0 }], CONFIG)

    expect(result.toolLog?.map((entry) => entry.tool)).toEqual(["get_plex_sessions", "get_tautulli_activity"])
  })

  it("returns an empty tool log for a turn without tool calls", async () => {
    jest.mocked(chatWithTools).mockResolvedValueOnce(turn({ content: "Hello." }))

    const result = await runConversationLoop([{ role: "user", content: "Hi", timestamp: 0 }], CONFIG)

    expect(result.success).toBe(true)
    expect(result.toolLog).toEqual([])
  })

  it("a non-string executor output does not break the turn", async () => {
    jest
      .mocked(chatWithTools)
      .mockResolvedValueOnce(turn({ toolCalls: [toolCall("call-1", "get_plex_status", "{}"), toolCall("call-2", "get_plex_sessions", "{}")] }))
      .mockResolvedValueOnce(turn({ content: "Plex is up." }))
    // JSON.stringify(undefined) is undefined at runtime, whatever its type says
    jest.mocked(executeToolCall).mockResolvedValueOnce(JSON.stringify(undefined)).mockResolvedValueOnce(JSON.stringify({ size: 0 }))

    const result = await runConversationLoop([{ role: "user", content: "Is Plex up?", timestamp: 0 }], CONFIG)

    expect(result.success).toBe(true)
    expect(result.message?.content).toBe("Plex is up.")
    expect(result.toolLog).toEqual([
      { tool: "get_plex_status", args: "{}", result: "", ok: true },
      { tool: "get_plex_sessions", args: "{}", result: '{"size":0}', ok: true },
    ])
  })

  describe("a call nested too deep to redact", () => {
    // 200,000 levels: walking them, or writing them out again, overflows the stack whatever the JIT or frame size,
    // though JSON.parse, which does not recurse, still parses them
    const deep = (value: object) => `${"[".repeat(200_000)}${JSON.stringify(value)}${"]".repeat(200_000)}`

    it("still answers when a tool result is, and logs the result empty, as withheld", async () => {
      jest
        .mocked(chatWithTools)
        .mockResolvedValueOnce(turn({ toolCalls: [toolCall("call-1", "mcp_files_read_file", '{"path":"keys.json"}')] }))
        .mockResolvedValueOnce(turn({ content: "The file holds one key." }))
      jest.mocked(executeToolCall).mockResolvedValueOnce(deep({ apiKey: "deep-key-1" }))

      const result = await runConversationLoop([{ role: "user", content: "What is in keys.json?", timestamp: 0 }], CONFIG)

      expect(result.success).toBe(true)
      expect(result.message?.content).toBe("The file holds one key.")
      expect(result.toolLog).toEqual([{ tool: "mcp_files_read_file", args: '{"path":"keys.json"}', result: "", ok: true, withheld: ["result"] }])
      // The model still read the output
      expect(JSON.stringify(jest.mocked(chatWithTools).mock.calls[1][0].messages)).toContain("deep-key-1")
    })

    it("still answers when the model's args are, and logs the args empty, as withheld", async () => {
      jest
        .mocked(chatWithTools)
        .mockResolvedValueOnce(turn({ toolCalls: [toolCall("call-1", "get_plex_sessions", deep({ password: "deep-pass-1" }))] }))
        .mockResolvedValueOnce(turn({ content: "Nothing is playing." }))
      jest.mocked(executeToolCall).mockResolvedValueOnce('{"size":0}')

      const result = await runConversationLoop([{ role: "user", content: "What's playing?", timestamp: 0 }], CONFIG)

      expect(result.success).toBe(true)
      expect(result.message?.content).toBe("Nothing is playing.")
      expect(result.toolLog).toEqual([{ tool: "get_plex_sessions", args: "", result: '{"size":0}', ok: true, withheld: ["args"] }])
    })
  })
})
