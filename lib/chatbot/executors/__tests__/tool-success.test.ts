/**
 * `isToolSuccess`, the tool log's `ok` hint for the judge: it reuses the
 * executors' failure classification, so text beginning "Error" and JSON with
 * a non-null `error` or `success: false` (the role and Discord refusals) are
 * failures.
 */

import { permissionsFor } from "@/lib/permissions"

import { executeToolCall, isToolSuccess } from ".."
import { ROLE_TOOL_NOT_PERMITTED } from "../role-scrub"
import { executeTautulliTool } from "../tautulli"

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
jest.mock("@/lib/security/audit-log", () => ({ AuditEventType: {}, logAuditEvent: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
}))

const ADMIN = permissionsFor({ isAdmin: true })
const call = (name: string) => ({ id: "call_1", type: "function" as const, function: { name, arguments: "{}" } })
const run = (name: string) => executeToolCall(call(name), "admin-1", "default", true, undefined, ADMIN)

beforeEach(() => jest.clearAllMocks())

describe("isToolSuccess", () => {
  it("executeToolCall's failure outputs are not a success and a normal output is", async () => {
    expect(isToolSuccess(await run("delete_all_the_things"))).toBe(false)

    jest.mocked(executeTautulliTool).mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
    expect(isToolSuccess(await run("get_tautulli_status"))).toBe(false)

    jest.mocked(executeTautulliTool).mockResolvedValueOnce(JSON.stringify({ tautulli_version: "2.13.4" }))
    expect(isToolSuccess(await run("get_tautulli_status"))).toBe(true)
  })

  it('a successful output that begins "Error 404" is ok: false', () => {
    // The heuristic's known limit: a result whose text starts "Error" reads as a failure
    expect(isToolSuccess("Error 404 is the most-watched episode title this week")).toBe(false)
  })

  it('ROLE_TOOL_NOT_PERMITTED and {"success": false} outputs are ok: false, and a normal JSON result is ok: true', async () => {
    expect(isToolSuccess(ROLE_TOOL_NOT_PERMITTED)).toBe(false)
    expect(isToolSuccess(JSON.stringify({ success: false, message: "Sonarr is not configured" }))).toBe(false)
    expect(isToolSuccess(JSON.stringify({ error: "Request failed" }))).toBe(false)

    // The real refusal path: a caller without the tool's permission
    const refused = await executeToolCall(call("get_tautulli_status"), "member-1", "default", false, undefined, permissionsFor({ isAdmin: false }))
    expect(refused).toBe(ROLE_TOOL_NOT_PERMITTED)
    expect(isToolSuccess(refused)).toBe(false)

    expect(isToolSuccess(JSON.stringify({ success: true, error: null, data: [] }))).toBe(true)
    expect(isToolSuccess(JSON.stringify([{ title: "Severance" }]))).toBe(true)
  })
})
