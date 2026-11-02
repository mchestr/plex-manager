/**
 * @jest-environment node
 */

/**
 * The stored tool log (spec §3, "Tool log"): credentials are redacted before
 * anything is cut, a field whose redaction throws is stored empty and listed
 * as withheld, args are capped at 2 KB, each result at 8 KB and a turn at
 * 32 KB, and the serialized form reads back or reads as null.
 */

import { mockReset } from "jest-mock-extended"

import { buildInvite } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { executeAppDataTool } from "@/lib/chatbot/executors/app-data"
import { NOTES } from "@/lib/judge/fence"
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

    it.each<[string, Partial<ToolLogEntry>, Partial<ToolLogEntry>]>([
      ["result", { result: DEEP }, { result: "", withheld: ["result"] }],
      ["args", { args: DEEP }, { args: "", withheld: ["args"] }],
      ["tool name", { tool: DEEP }, { tool: "", withheld: ["tool"] }],
      // A runtime type its caller should never pass: redactText throws a TypeError on it
      ["args that are not text", { args: JSON.stringify(undefined) }, { args: "", withheld: ["args"] }],
    ])("stores the %s empty and lists it as withheld, never its text or a note in its place", (_field, given, stored) => {
      const [logged] = capToolLog([entry(given)])

      expect(logged).toEqual(entry(stored))
      for (const value of DEEP_VALUES) expect(JSON.stringify(logged)).not.toContain(value)
    })

    it("lists every field it withheld, in the entry's order, and keeps the others", () => {
      const [logged] = capToolLog([entry({ result: DEEP, args: '{"limit":5}', tool: DEEP })])

      expect(logged).toEqual({ tool: "", args: '{"limit":5}', result: "", ok: true, withheld: ["tool", "result"] })
    })

    it("leaves the turn's other calls as they are", () => {
      const log = capToolLog([entry({ result: DEEP }), entry({ tool: "get_plex_sessions", args: '{"limit":5}', result: '{"size":2}' })])

      expect(log).toEqual([entry({ result: "", withheld: ["result"] }), entry({ tool: "get_plex_sessions", args: '{"limit":5}', result: '{"size":2}' })])
    })
  })

  it("stores text that reads like the judge prompt's note, or the words capture once stored in place of a field, as the text it is", () => {
    // Only the withheld list marks a field withheld: the judge prompt writes its own note there, and neutralises one in content
    const words = "Not recorded: it could not be checked for credentials"

    expect(capToolLog([entry({ tool: words, args: NOTES.withheld, result: words })])).toEqual([entry({ tool: words, args: NOTES.withheld, result: words })])
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

  it("reads back the fields an entry withheld, and an entry stored without the list as before", () => {
    const log = [entry({ tool: "", result: "", withheld: ["tool", "result"] }), entry()]

    expect(parseToolLog(serializeToolLog(log))).toEqual(log)
    expect(parseToolLog('[{"tool":"x","args":"{}","result":"{}","ok":true}]')).toStrictEqual([{ tool: "x", args: "{}", result: "{}", ok: true }])
  })

  it("reads a log whose withheld list is not a list of an entry's text fields as null", () => {
    expect(parseToolLog(JSON.stringify([{ ...entry(), withheld: ["content"] }]))).toBeNull()
    expect(parseToolLog(JSON.stringify([{ ...entry(), withheld: "result" }]))).toBeNull()
  })
})
