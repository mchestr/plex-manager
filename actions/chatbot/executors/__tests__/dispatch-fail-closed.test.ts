/**
 * Fail-closed dispatch test (actions/chatbot/executors/index.ts, FR-9):
 * in the Discord context a tool that is NOT in the resolved Discord-safe set
 * MUST be refused — the executor is never called — and the refusal is audited.
 * Admin/default context may call any registered tool.
 */

import { executeToolCall } from ".."
import { executeTautulliTool } from "../tautulli"
import { executePlexTool } from "../plex"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { DISCORD_SAFE_TOOL_NAMES } from "../../tools/registry"

jest.mock("../tautulli", () => ({ executeTautulliTool: jest.fn() }))
jest.mock("../plex", () => ({ executePlexTool: jest.fn() }))
jest.mock("../sonarr", () => ({ executeSonarrTool: jest.fn() }))
jest.mock("../radarr", () => ({ executeRadarrTool: jest.fn() }))
jest.mock("../overseerr", () => ({ executeOverseerrTool: jest.fn() }))
jest.mock("../media-marking", () => ({ executeMediaMarkingTool: jest.fn() }))

jest.mock("@/lib/security/audit-log", () => ({
  AuditEventType: { DISCORD_COMMAND_DENIED: "DISCORD_COMMAND_DENIED" },
  logAuditEvent: jest.fn(),
}))

jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  })),
}))

const mockExecuteTautulliTool = executeTautulliTool as jest.MockedFunction<typeof executeTautulliTool>
const mockExecutePlexTool = executePlexTool as jest.MockedFunction<typeof executePlexTool>
const mockLogAuditEvent = logAuditEvent as jest.MockedFunction<typeof logAuditEvent>

function toolCall(name: string) {
  return {
    id: "call_1",
    type: "function" as const,
    function: { name, arguments: "{}" },
  }
}

// Sanity: the tools we lean on must actually be (un)safe as this test assumes.
const UNSAFE_TOOL = "get_sonarr_root_folders" // registered but not Discord-safe
const SAFE_TOOL = "get_tautulli_status" // Discord-safe with an allowlist

describe("executeToolCall - Discord fail-closed dispatch (FR-9)", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockExecuteTautulliTool.mockResolvedValue(
      JSON.stringify({ response: { result: "success", data: { tautulli_version: "2.13.4" } } })
    )
    mockExecutePlexTool.mockResolvedValue(JSON.stringify({ MediaContainer: { size: 0 } }))
  })

  it("test fixtures pick tools that match their intended safe/unsafe status", () => {
    expect(DISCORD_SAFE_TOOL_NAMES.has(SAFE_TOOL)).toBe(true)
    expect(DISCORD_SAFE_TOOL_NAMES.has(UNSAFE_TOOL)).toBe(false)
  })

  it("refuses a non-Discord-safe tool in the discord context (executor NOT called) and audits it", async () => {
    const result = await executeToolCall(toolCall(UNSAFE_TOOL), "user-1", "discord")

    expect(result).toBe(JSON.stringify({ error: "tool not permitted" }))
    // No service executor should ever run for a refused tool.
    expect(mockExecuteTautulliTool).not.toHaveBeenCalled()
    expect(mockExecutePlexTool).not.toHaveBeenCalled()

    expect(mockLogAuditEvent).toHaveBeenCalledTimes(1)
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      AuditEventType.DISCORD_COMMAND_DENIED,
      "user-1",
      expect.objectContaining({ toolName: UNSAFE_TOOL, context: "discord" })
    )
  })

  it("refuses an unknown (hallucinated) tool name in the discord context and audits it", async () => {
    const result = await executeToolCall(toolCall("delete_all_the_things"), "user-1", "discord")

    expect(result).toBe(JSON.stringify({ error: "tool not permitted" }))
    expect(mockExecuteTautulliTool).not.toHaveBeenCalled()
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      AuditEventType.DISCORD_COMMAND_DENIED,
      "user-1",
      expect.objectContaining({ toolName: "delete_all_the_things" })
    )
  })

  it("runs a Discord-safe tool in the discord context (executor called, no denial audit)", async () => {
    const result = await executeToolCall(toolCall(SAFE_TOOL), "user-1", "discord")

    expect(mockExecuteTautulliTool).toHaveBeenCalledTimes(1)
    expect(mockLogAuditEvent).not.toHaveBeenCalled()
    // Output is scrubbed but still carries the allowlisted safe field.
    expect(result).toContain("tautulli_version")
  })

  it("runs ANY registered tool in the admin (default) context — no denial", async () => {
    const result = await executeToolCall(toolCall(UNSAFE_TOOL), "user-1", "default")

    expect(mockLogAuditEvent).not.toHaveBeenCalled()
    expect(result).not.toBe(JSON.stringify({ error: "tool not permitted" }))
  })

  it("runs ANY registered tool when no context is provided — no denial", async () => {
    await executeToolCall(toolCall(UNSAFE_TOOL), "user-1")

    expect(mockLogAuditEvent).not.toHaveBeenCalled()
  })
})
