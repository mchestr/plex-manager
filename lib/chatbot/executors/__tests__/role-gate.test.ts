/**
 * The web assistant's per-tool gate (RBAC): a caller outside the permission a
 * tool declares is refused before any executor runs, and a role below admin
 * gets audited calls and scrubbed output. Admins behave as before.
 */

import { executeToolCall } from ".."
import { executeAppDataTool } from "../app-data"
import { executeKnowledgeTool } from "../knowledge"
import { executeMcpTool } from "../../mcp/tools"
import { executeMediaMarkingTool } from "../media-marking"
import { executePlexTool } from "../plex"
import { executeSkillTool } from "../skills"
import { executeTautulliTool } from "../tautulli"
import { DISCORD_SAFE_TOOLS } from "../../tools/registry"
import { permissionsFor } from "@/lib/permissions"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

jest.mock("../tautulli", () => ({ executeTautulliTool: jest.fn() }))
jest.mock("../plex", () => ({ executePlexTool: jest.fn() }))
jest.mock("../sonarr", () => ({ executeSonarrTool: jest.fn() }))
jest.mock("../radarr", () => ({ executeRadarrTool: jest.fn() }))
jest.mock("../overseerr", () => ({ executeOverseerrTool: jest.fn() }))
jest.mock("../media-marking", () => ({ executeMediaMarkingTool: jest.fn() }))
jest.mock("../app-data", () => ({ executeAppDataTool: jest.fn() }))
jest.mock("../knowledge", () => ({ executeKnowledgeTool: jest.fn() }))
jest.mock("../skills", () => ({ executeSkillTool: jest.fn() }))
jest.mock("../../mcp/tools", () => ({ MCP_TOOL_PREFIX: "mcp_", executeMcpTool: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: jest.fn(),
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
}))

const SUPPORT = permissionsFor({ isAdmin: false, role: "support" })
const ADMIN = permissionsFor({ isAdmin: true })
const NOT_PERMITTED = JSON.stringify({ error: "tool not permitted" })

const call = (name: string) => ({ id: "call_1", type: "function" as const, function: { name, arguments: "{}" } })
const denied = jest.mocked(logAuditEvent)

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(executeTautulliTool).mockResolvedValue(JSON.stringify({ users: [{ name: "Sam", email: "sam@example.com" }] }))
  jest.mocked(executePlexTool).mockResolvedValue(JSON.stringify({ server: { name: "Home", accessToken: "plex-secret" } }))
  jest.mocked(executeMediaMarkingTool).mockResolvedValue("Marked")
})

describe("a Support caller", () => {
  it("runs a read tool, with the call audited and credentials and contact details removed", async () => {
    const plex = await executeToolCall(call("get_plex_status"), "support-1", "default", false, undefined, SUPPORT)
    const users = await executeToolCall(call("get_tautulli_users"), "support-1", "default", false, undefined, SUPPORT)

    expect(plex).not.toContain("plex-secret")
    expect(JSON.parse(users)).toEqual({ users: [{ name: "Sam" }] })
    expect(denied).toHaveBeenCalledWith(AuditEventType.ASSISTANT_TOOL_CALLED, "support-1", expect.objectContaining({ toolName: "get_plex_status" }))
  })

  it("replaces an executor's error text with a fixed line", async () => {
    jest.mocked(executePlexTool).mockResolvedValue("Error: connect ECONNREFUSED http://plex:32400/?X-Plex-Token=abc")

    const result = await executeToolCall(call("get_plex_status"), "support-1", "default", false, undefined, SUPPORT)

    expect(result).toBe("Error: that tool isn't available right now.")
  })

  it("is refused a write tool before its executor runs, and the refusal is audited", async () => {
    const result = await executeToolCall(call("mark_media_finished"), "support-1", "default", false, undefined, SUPPORT)

    expect(result).toBe(NOT_PERMITTED)
    expect(executeMediaMarkingTool).not.toHaveBeenCalled()
    expect(denied).toHaveBeenCalledWith(
      AuditEventType.ASSISTANT_TOOL_DENIED,
      "support-1",
      expect.objectContaining({ toolName: "mark_media_finished", reason: "missing_permission", required: "assistant:tools:write" })
    )
  })

  it.each([
    "get_app_member",
    "get_app_invites",
    "get_app_failed_jobs",
    "search_knowledge_base",
    "read_knowledge_doc",
    "load_skill",
    "read_skill_file",
    "mcp_memini_search",
  ])(
    "is refused the admin-only tool %s before any executor runs, and the refusal is audited",
    async (name) => {
      const result = await executeToolCall(call(name), "support-1", "default", false, undefined, SUPPORT)

      expect(result).toBe(NOT_PERMITTED)
      expect(executeAppDataTool).not.toHaveBeenCalled()
      expect(executeKnowledgeTool).not.toHaveBeenCalled()
      expect(executeSkillTool).not.toHaveBeenCalled()
      expect(executeMcpTool).not.toHaveBeenCalled()
      expect(denied).toHaveBeenCalledWith(AuditEventType.ASSISTANT_TOOL_DENIED, "support-1", expect.objectContaining({ toolName: name }))
    }
  )

  it.each(["delete_user", "restart_plex", "set_config", "__proto__", "constructor"])(
    "is refused a hallucinated or injected tool name (%s) and the refusal is audited",
    async (name) => {
      const result = await executeToolCall(call(name), "support-1", "default", false, undefined, SUPPORT)

      expect(result).toBe(NOT_PERMITTED)
      expect(denied).toHaveBeenCalledWith(AuditEventType.ASSISTANT_TOOL_DENIED, "support-1", expect.objectContaining({ toolName: name, reason: "unknown_tool" }))
    }
  )
})

describe("fail closed", () => {
  it("refuses every tool when no permissions are passed, even to a caller flagged as admin-less", async () => {
    const result = await executeToolCall(call("get_plex_status"), "user-1", "default", false)

    expect(result).toBe(NOT_PERMITTED)
    expect(executePlexTool).not.toHaveBeenCalled()
  })

  it("refuses a caller with an empty permission set", async () => {
    expect(await executeToolCall(call("get_plex_status"), "user-1", "default", false, undefined, new Set())).toBe(NOT_PERMITTED)
  })
})

describe("an admin", () => {
  it("runs read and write tools with unscrubbed output and no per-call audit", async () => {
    const plex = await executeToolCall(call("get_plex_status"), "admin-1", "default", true, undefined, ADMIN)
    const mark = await executeToolCall(call("mark_media_finished"), "admin-1", "default", true, undefined, ADMIN)

    expect(JSON.parse(plex)).toEqual({ server: { name: "Home", accessToken: "plex-secret" } })
    expect(mark).toBe("Marked")
    expect(denied).not.toHaveBeenCalled()
  })

  it("runs the admin-only app data, knowledge base and MCP tools", async () => {
    jest.mocked(executeAppDataTool).mockResolvedValue("invites")
    jest.mocked(executeKnowledgeTool).mockResolvedValue("docs")
    jest.mocked(executeMcpTool).mockResolvedValue("mcp")

    expect(await executeToolCall(call("get_app_invites"), "admin-1", "default", true, undefined, ADMIN)).toBe("invites")
    expect(await executeToolCall(call("search_knowledge_base"), "admin-1", "default", true, undefined, ADMIN)).toBe("docs")
    expect(await executeToolCall(call("mcp_memini_search"), "admin-1", "default", true, undefined, ADMIN)).toBe("mcp")
  })

  it("runs the skill tools", async () => {
    jest.mocked(executeSkillTool).mockResolvedValue("skill")

    expect(await executeToolCall(call("load_skill"), "admin-1", "default", true, undefined, ADMIN)).toBe("skill")
    expect(await executeToolCall(call("read_skill_file"), "admin-1", "default", true, undefined, ADMIN)).toBe("skill")
    expect(executeSkillTool).toHaveBeenCalledWith("load_skill", {}, "admin-1", "default", undefined)
    expect(executeSkillTool).toHaveBeenCalledWith("read_skill_file", {}, "admin-1", "default", undefined)
  })

  it("still gets the old message for an unknown tool", async () => {
    expect(await executeToolCall(call("nope"), "admin-1", "default", true, undefined, ADMIN)).toBe("Error: Unknown tool")
  })
})

describe("Discord", () => {
  it("offers neither skill tool", () => {
    const names = DISCORD_SAFE_TOOLS.map((tool) => tool.function.name)

    expect(names).not.toContain("load_skill")
    expect(names).not.toContain("read_skill_file")
  })

  it.each(["load_skill", "read_skill_file"])("refuses %s even to an admin, before the executor runs", async (name) => {
    expect(await executeToolCall(call(name), "admin-1", "discord", true)).toBe(NOT_PERMITTED)
    expect(executeSkillTool).not.toHaveBeenCalled()
    expect(denied).toHaveBeenCalledWith(AuditEventType.DISCORD_COMMAND_DENIED, "admin-1", expect.objectContaining({ toolName: name }))
  })
})
