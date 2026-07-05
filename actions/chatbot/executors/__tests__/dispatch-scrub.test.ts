/**
 * Integration-ish test for the executor dispatch (actions/chatbot/executors/index.ts):
 * the Discord context MUST scrub tool output before returning it to the
 * conversation loop, while the default (admin) context returns it unscrubbed.
 *
 * We mock the underlying service executor so it emits PII, then assert:
 * - context "discord"  -> result is projected to the tool's discordFields; PII gone.
 * - context "default"  -> result is returned verbatim (unscrubbed).
 */

import { executeToolCall } from ".."
import { executeTautulliTool } from "../tautulli"

jest.mock("../tautulli", () => ({ executeTautulliTool: jest.fn() }))
jest.mock("../plex", () => ({ executePlexTool: jest.fn() }))
jest.mock("../sonarr", () => ({ executeSonarrTool: jest.fn() }))
jest.mock("../radarr", () => ({ executeRadarrTool: jest.fn() }))
jest.mock("../overseerr", () => ({ executeOverseerrTool: jest.fn() }))
jest.mock("../media-marking", () => ({ executeMediaMarkingTool: jest.fn() }))

jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  })),
}))

const mockExecuteTautulliTool = executeTautulliTool as jest.MockedFunction<typeof executeTautulliTool>

const PII_STATUS = JSON.stringify({
  response: {
    result: "success",
    data: {
      tautulli_version: "2.13.4",
      stream_count: "2",
      // PII that MUST be scrubbed in Discord context:
      username: "alice",
      email: "alice@example.com",
      user_id: 42,
      ip_address: "10.1.2.3",
    },
  },
})

function toolCall(name: string) {
  return {
    id: "call_1",
    type: "function" as const,
    function: { name, arguments: "{}" },
  }
}

describe("executeToolCall - Discord output scrubbing", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockExecuteTautulliTool.mockResolvedValue(PII_STATUS)
  })

  it("scrubs tool output in the discord context (PII removed, safe fields kept)", async () => {
    const result = await executeToolCall(toolCall("get_tautulli_status"), "user-1", "discord")

    expect(result).toContain("tautulli_version")
    expect(result).toContain("stream_count")
    expect(result).not.toContain("username")
    expect(result).not.toContain("alice")
    expect(result).not.toContain("email")
    expect(result).not.toContain("user_id")
    expect(result).not.toContain("ip_address")
    expect(result).not.toContain("10.1.2.3")
  })

  it("returns unscrubbed output in the default (admin) context", async () => {
    const result = await executeToolCall(toolCall("get_tautulli_status"), "user-1", "default")

    expect(result).toBe(PII_STATUS)
    expect(result).toContain("alice@example.com")
    expect(result).toContain("user_id")
  })

  it("returns unscrubbed output when no context is provided (admin default)", async () => {
    const result = await executeToolCall(toolCall("get_tautulli_status"), "user-1")

    expect(result).toBe(PII_STATUS)
    expect(result).toContain("alice@example.com")
  })
})
