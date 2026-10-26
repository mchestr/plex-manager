/**
 * The web assistant's per-tool gate (RBAC): a caller outside the permission a
 * tool declares is refused before any executor runs, and a role below admin
 * gets audited calls and scrubbed output. Admins behave as before.
 */

import { executeToolCall } from ".."
import { executeMediaMarkingTool } from "../media-marking"
import { executePlexTool } from "../plex"
import { executeTautulliTool } from "../tautulli"
import { permissionsFor } from "@/lib/permissions"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

jest.mock("../tautulli", () => ({ executeTautulliTool: jest.fn() }))
jest.mock("../plex", () => ({ executePlexTool: jest.fn() }))
jest.mock("../sonarr", () => ({ executeSonarrTool: jest.fn() }))
jest.mock("../radarr", () => ({ executeRadarrTool: jest.fn() }))
jest.mock("../overseerr", () => ({ executeOverseerrTool: jest.fn() }))
jest.mock("../media-marking", () => ({ executeMediaMarkingTool: jest.fn() }))
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

  it("still gets the old message for an unknown tool", async () => {
    expect(await executeToolCall(call("nope"), "admin-1", "default", true, undefined, ADMIN)).toBe("Error: Unknown tool")
  })
})
