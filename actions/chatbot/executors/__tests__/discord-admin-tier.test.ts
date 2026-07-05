/**
 * Step 19 / Part C — Discord admin authorization tier (FR-14).
 *
 * Server-wide download queue/history tools are `discordAdminOnly`. In the
 * Discord context they must be REFUSED (fail-closed) for a non-admin member and
 * audited (DISCORD_COMMAND_DENIED); an admin Discord user is allowed. Member-ok
 * tools (userScoped + lightweight *_status) work for non-admins. The admin WEB
 * (default) context path is unaffected — full access regardless of the flag.
 */

import { executeToolCall } from ".."
import { executeSonarrTool } from "../sonarr"
import { executeTautulliTool } from "../tautulli"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { DISCORD_ADMIN_ONLY_TOOL_NAMES, DISCORD_SAFE_TOOL_NAMES } from "../../tools/registry"

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
  createLogger: jest.fn(() => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
}))

const mockExecuteSonarrTool = executeSonarrTool as jest.MockedFunction<typeof executeSonarrTool>
const mockExecuteTautulliTool = executeTautulliTool as jest.MockedFunction<typeof executeTautulliTool>
const mockLogAuditEvent = logAuditEvent as jest.MockedFunction<typeof logAuditEvent>

function toolCall(name: string) {
  return { id: "call_1", type: "function" as const, function: { name, arguments: "{}" } }
}

const ADMIN_ONLY_TOOL = "get_sonarr_queue" // discordSafe + discordAdminOnly
const MEMBER_OK_STATUS_TOOL = "get_tautulli_status" // discordSafe, not admin-only
const NOT_PERMITTED = JSON.stringify({ error: "tool not permitted" })

describe("executeToolCall - Discord admin tier (FR-14)", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockExecuteSonarrTool.mockResolvedValue(JSON.stringify({ records: [] }))
    mockExecuteTautulliTool.mockResolvedValue(
      JSON.stringify({ response: { result: "success", data: { tautulli_version: "2.13.4" } } })
    )
  })

  it("fixtures: the admin-only tool is discordSafe AND discordAdminOnly", () => {
    expect(DISCORD_SAFE_TOOL_NAMES.has(ADMIN_ONLY_TOOL)).toBe(true)
    expect(DISCORD_ADMIN_ONLY_TOOL_NAMES.has(ADMIN_ONLY_TOOL)).toBe(true)
    expect(DISCORD_ADMIN_ONLY_TOOL_NAMES.has(MEMBER_OK_STATUS_TOOL)).toBe(false)
    // Exactly the four server-wide queue/history tools.
    expect([...DISCORD_ADMIN_ONLY_TOOL_NAMES].sort()).toEqual(
      ["get_radarr_history", "get_radarr_queue", "get_sonarr_history", "get_sonarr_queue"].sort()
    )
  })

  it("refuses an admin-only tool for a NON-admin Discord user (executor not called) and audits it", async () => {
    const result = await executeToolCall(toolCall(ADMIN_ONLY_TOOL), "user-1", "discord", false)

    expect(result).toBe(NOT_PERMITTED)
    expect(mockExecuteSonarrTool).not.toHaveBeenCalled()
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      AuditEventType.DISCORD_COMMAND_DENIED,
      "user-1",
      expect.objectContaining({ toolName: ADMIN_ONLY_TOOL, reason: "admin_only" })
    )
  })

  it("allows an admin-only tool for an ADMIN Discord user (executor called, no denial)", async () => {
    const result = await executeToolCall(toolCall(ADMIN_ONLY_TOOL), "user-1", "discord", true)

    expect(mockExecuteSonarrTool).toHaveBeenCalledTimes(1)
    expect(mockLogAuditEvent).not.toHaveBeenCalled()
    expect(result).not.toBe(NOT_PERMITTED)
  })

  it("allows a member-ok tool for a NON-admin Discord user", async () => {
    const result = await executeToolCall(toolCall(MEMBER_OK_STATUS_TOOL), "user-1", "discord", false)

    expect(mockExecuteTautulliTool).toHaveBeenCalledTimes(1)
    expect(mockLogAuditEvent).not.toHaveBeenCalled()
    expect(result).toContain("tautulli_version")
  })

  it("admin WEB (default) context is unaffected: admin-only flag does not restrict, even with isAdmin omitted", async () => {
    const result = await executeToolCall(toolCall(ADMIN_ONLY_TOOL), "user-1", "default")

    expect(mockExecuteSonarrTool).toHaveBeenCalledTimes(1)
    expect(mockLogAuditEvent).not.toHaveBeenCalled()
    expect(result).not.toBe(NOT_PERMITTED)
  })

  it("defaults to non-admin in the discord context when isAdmin is omitted (fail-closed)", async () => {
    const result = await executeToolCall(toolCall(ADMIN_ONLY_TOOL), "user-1", "discord")

    expect(result).toBe(NOT_PERMITTED)
    expect(mockExecuteSonarrTool).not.toHaveBeenCalled()
  })
})
