/**
 * @jest-environment node
 */

/**
 * The stored tool log (spec §3, "Tool log"): credentials are redacted before
 * anything is cut, args are capped at 2 KB, each result at 8 KB and a turn at
 * 32 KB, and the serialized form reads back or reads as null.
 */

import { mockReset } from "jest-mock-extended"

import { buildInvite } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { executeAppDataTool } from "@/lib/chatbot/executors/app-data"
import { REDACTED } from "@/lib/mcp/redact"

import { capToolLog, parseToolLog, serializeToolLog, type ToolLogEntry } from "../tool-log"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/admin/queues", () => ({ listQueueJobs: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({
  AuditEventType: { ASSISTANT_DATA_READ: "ASSISTANT_DATA_READ" },
  logAuditEvent: jest.fn(),
}))

beforeEach(() => mockReset(prismaMock))

const SECRETS = ["key-1", "secret-1", "pass-1", "token-1", "urlkey-1"]

function credentialPayload(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    apiKey: "key-1",
    secret: "secret-1",
    nested: { password: "pass-1", "X-Plex-Token": "token-1" },
    url: "http://s/x?apikey=urlkey-1",
    ...extra,
  })
}

const entry = (overrides: Partial<ToolLogEntry> = {}): ToolLogEntry => ({ tool: "get_sonarr_queue", args: "{}", result: "{}", ok: true, ...overrides })

describe("capToolLog", () => {
  it("redacts before cutting", () => {
    const [cut] = capToolLog([entry({ result: credentialPayload({ filler: "f".repeat(20 * 1024) }) })])

    for (const secret of SECRETS) expect(cut.result).not.toContain(secret)
    expect(cut.result.length).toBeLessThanOrEqual(8192)
    expect(cut.truncated).toBe(true)

    const [whole] = capToolLog([entry({ result: credentialPayload() })])
    expect(whole.truncated).toBeUndefined()
    const parsed = JSON.parse(whole.result)
    expect(parsed.apiKey).toBe(REDACTED)
    expect(parsed.secret).toBe(REDACTED)
    expect(parsed.nested.password).toBe(REDACTED)
    expect(parsed.nested["X-Plex-Token"]).toBe(REDACTED)
    expect(parsed.url).not.toContain("urlkey-1")
  })

  it("redacts and caps args", () => {
    const [cut] = capToolLog([entry({ args: JSON.stringify({ password: "p", note: "n".repeat(3 * 1024) }) })])

    expect(cut.args).not.toContain('"password":"p"')
    expect(cut.args).toContain(`"password":"${REDACTED}"`)
    expect(cut.args.length).toBeLessThanOrEqual(2048)
    expect(cut.truncated).toBe(true)
  })

  it("caps a turn at 32 KB", () => {
    const log = capToolLog(Array.from({ length: 5 }, (_, i) => entry({ tool: `tool_${i}`, result: String(i).repeat(8192) })))

    const total = log.reduce((sum, item) => sum + item.args.length + item.result.length, 0)
    expect(total).toBeLessThanOrEqual(32_768)
    expect(log.map((item) => item.tool)).toEqual(["tool_0", "tool_1", "tool_2", "tool_3", "tool_4"])
    expect(log.slice(0, 3).map((item) => item.truncated)).toEqual([undefined, undefined, undefined])
    expect(log.slice(3).map((item) => item.truncated)).toEqual([true, true])
  })

  it("keeps a short entry as it is", () => {
    expect(capToolLog([entry({ args: '{"limit":5}', result: "Error: Unknown tool", ok: false })])).toEqual([
      { tool: "get_sonarr_queue", args: '{"limit":5}', result: "Error: Unknown tool", ok: false },
    ])
  })

  it("invite codes arrive masked", async () => {
    prismaMock.invite.findMany.mockResolvedValue([buildInvite({ code: "FULLINVITECODE7Q2X" })])

    const output = await executeAppDataTool("get_app_invites", {}, "admin-1")
    const [logged] = capToolLog([entry({ tool: "get_app_invites", result: output })])

    expect(logged.result).not.toContain("FULLINVITECODE7Q2X")
    expect(JSON.parse(logged.result).invites[0].codeEnd).toBe("7Q2X")
  })
})

describe("serializeToolLog and parseToolLog", () => {
  it("stores nothing for a turn without tool calls", () => {
    expect(serializeToolLog(undefined)).toBeNull()
    expect(serializeToolLog([])).toBeNull()
  })

  it("reads back what it stored", () => {
    const log = [entry(), entry({ tool: "get_plex_sessions", ok: false, truncated: true })]

    expect(parseToolLog(serializeToolLog(log))).toEqual(log)
  })

  it("reads a missing or invalid log as null", () => {
    expect(parseToolLog(null)).toBeNull()
    expect(parseToolLog("not json")).toBeNull()
    expect(parseToolLog(JSON.stringify({ tool: "x" }))).toBeNull()
    expect(parseToolLog(JSON.stringify([{ tool: "x", args: "{}", result: "{}", ok: "yes" }]))).toBeNull()
  })
})
