/**
 * `isToolSuccess`, the tool log's `ok` hint for the judge: the executors
 * report a failure only as text beginning "Error", so that is what it reads.
 */

import { permissionsFor } from "@/lib/permissions"

import { executeToolCall, isToolSuccess } from ".."
import { executeTautulliTool } from "../tautulli"

jest.mock("../tautulli", () => ({ executeTautulliTool: jest.fn() }))
jest.mock("../plex", () => ({ executePlexTool: jest.fn() }))
jest.mock("../sonarr", () => ({ executeSonarrTool: jest.fn() }))
jest.mock("../radarr", () => ({ executeRadarrTool: jest.fn() }))
jest.mock("../overseerr", () => ({ executeOverseerrTool: jest.fn() }))
jest.mock("../media-marking", () => ({ executeMediaMarkingTool: jest.fn() }))
jest.mock("../app-data", () => ({ executeAppDataTool: jest.fn() }))
jest.mock("../knowledge", () => ({ executeKnowledgeTool: jest.fn() }))
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
})
