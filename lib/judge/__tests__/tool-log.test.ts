/**
 * @jest-environment node
 */

/**
 * The stored tool log (spec §3, "Tool log"): credentials are redacted before
 * anything is cut, a field whose redaction throws is stored as a fixed note,
 * args are capped at 2 KB, each result at 8 KB and a turn at 32 KB, and the
 * serialized form reads back or reads as null.
 */

import { mockReset } from "jest-mock-extended"

import { buildInvite } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { executeAppDataTool } from "@/lib/chatbot/executors/app-data"
import { NOTES, neutralise, TRUNCATED } from "@/lib/judge/fence"
import { REDACTED } from "@/lib/mcp/redact"

import { capToolLog, NOT_RECORDED, parseToolLog, serializeToolLog, type ToolLogEntry } from "../tool-log"

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

  it("a 300-character tool name is cut to 100 and redacted", () => {
    // The model chooses the name, so it is treated like the text it returned
    const [logged] = capToolLog([entry({ tool: `token=name-secret-1 ${"t".repeat(300)}` })])

    expect(logged.tool).toHaveLength(100)
    expect(logged.tool).not.toContain("name-secret-1")
    expect(logged.tool.startsWith(`token=${REDACTED}`)).toBe(true)
    expect(logged.truncated).toBe(true)
  })

  it("invite codes arrive masked", async () => {
    prismaMock.invite.findMany.mockResolvedValue([buildInvite({ code: "FULLINVITECODE7Q2X" })])

    const output = await executeAppDataTool("get_app_invites", {}, "admin-1")
    const [logged] = capToolLog([entry({ tool: "get_app_invites", result: output })])

    expect(logged.result).not.toContain("FULLINVITECODE7Q2X")
    expect(JSON.parse(logged.result).invites[0].codeEnd).toBe("7Q2X")
  })

  describe("a field whose redaction throws", () => {
    // Walking JSON nested 200,000 levels deep overflows the stack whatever the JIT or frame size, so redactCredentials
    // throws a RangeError; JSON.parse, which does not recurse, still parses it
    const DEEP_VALUES = ["deep-key-1", "deep-title-1"]
    const DEEP = `${"[".repeat(200_000)}${JSON.stringify({ apiKey: "deep-key-1", title: "deep-title-1" })}${"]".repeat(200_000)}`

    it.each([
      ["result", { result: DEEP }, { result: NOT_RECORDED }],
      ["args", { args: DEEP }, { args: NOT_RECORDED }],
      ["tool name", { tool: DEEP }, { tool: NOT_RECORDED }],
      // A runtime type its caller should never pass: redactText throws a TypeError on it
      ["args that are not text", { args: JSON.stringify(undefined) }, { args: NOT_RECORDED }],
    ] as const)("is stored as a fixed note in place of the %s, never as its text", (_field, given, stored) => {
      const [logged] = capToolLog([entry(given)])

      expect(logged).toEqual(entry(stored))
      for (const value of DEEP_VALUES) expect(JSON.stringify(logged)).not.toContain(value)
    })

    it("leaves the turn's other calls as they are", () => {
      const log = capToolLog([entry({ result: DEEP }), entry({ tool: "get_plex_sessions", args: '{"limit":5}', result: '{"size":2}' })])

      expect(log).toEqual([entry({ result: NOT_RECORDED }), entry({ tool: "get_plex_sessions", args: '{"limit":5}', result: '{"size":2}' })])
    })

    it("is a note that cannot pass for the judge prompt's notes or marks, and that redaction and neutralising leave as it is", () => {
      expect(NOT_RECORDED).not.toMatch(/^[([]/)
      expect([...Object.values(NOTES), TRUNCATED, REDACTED]).not.toContain(NOT_RECORDED)
      expect(neutralise(NOT_RECORDED)).toBe(NOT_RECORDED)
      expect(capToolLog([entry({ result: NOT_RECORDED })])).toEqual([entry({ result: NOT_RECORDED })])
    })
  })
})

describe("serializeToolLog and parseToolLog", () => {
  it("a turn that called no tools stores '[]', and parseToolLog('[]') is []", () => {
    expect(serializeToolLog([])).toBe("[]")
    expect(parseToolLog("[]")).toEqual([])
    // Null is kept for "no log was captured", a turn from before the tool log
    expect(serializeToolLog(undefined)).toBeNull()
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
