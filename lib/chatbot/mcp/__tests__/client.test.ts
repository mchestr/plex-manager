/**
 * @jest-environment node
 *
 * The MCP client: initialize, list and call over Streamable HTTP, JSON and
 * event-stream replies, the auth header, and fixed failure codes.
 */

import { fetchWithSafeRedirects } from "@/lib/connections/http"

import { mcpCallTool, mcpListTools } from "../client"

jest.mock("@/lib/connections/http", () => ({ fetchWithSafeRedirects: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }) }))

const fetchMock = jest.mocked(fetchWithSafeRedirects)
const ENDPOINT = { url: "https://mcp.example.com/mcp", authHeaderName: "Authorization", authHeaderSecret: "Bearer secret" }

const json = (result: unknown, id: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { headers: { "content-type": "application/json", ...headers } })
const stream = (result: unknown, id: number) =>
  new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id, result })}\n\n`, { headers: { "content-type": "text/event-stream" } })
const accepted = () => new Response(null, { status: 202 })

/** initialize, initialized, then `reply` for the operation (request id 2). */
function script(reply: Response) {
  fetchMock
    .mockResolvedValueOnce(json({ protocolVersion: "2025-03-26" }, 1, { "mcp-session-id": "s1" }))
    .mockResolvedValueOnce(accepted())
    .mockResolvedValueOnce(reply)
}

const sent = (call: number) => {
  const [, init] = fetchMock.mock.calls[call]
  return { headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) }
}

beforeEach(() => fetchMock.mockReset())

describe("mcpListTools", () => {
  it("lists tools, sends the auth header and carries the session id", async () => {
    script(json({ tools: [{ name: "search", description: "Find", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }, { name: "write" }] }, 2))

    const result = await mcpListTools(ENDPOINT)

    expect(result).toEqual({
      ok: true,
      data: [
        { name: "search", description: "Find", inputSchema: { type: "object" }, readOnlyHint: true },
        { name: "write", description: "", inputSchema: { type: "object", properties: {} }, readOnlyHint: false },
      ],
    })
    expect(sent(0).headers.Authorization).toBe("Bearer secret")
    expect(sent(0).body.method).toBe("initialize")
    expect(sent(2).headers["Mcp-Session-Id"]).toBe("s1")
    expect(sent(2).body.method).toBe("tools/list")
  })

  it("reads an event-stream reply", async () => {
    script(stream({ tools: [{ name: "a" }] }, 2))
    expect(await mcpListTools(ENDPOINT)).toMatchObject({ ok: true, data: [{ name: "a" }] })
  })

  it("follows nextCursor", async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 1))
      .mockResolvedValueOnce(accepted())
      .mockResolvedValueOnce(json({ tools: [{ name: "a" }], nextCursor: "c2" }, 2))
      .mockResolvedValueOnce(json({ tools: [{ name: "b" }] }, 3))

    const result = await mcpListTools(ENDPOINT)

    expect(result.ok && result.data.map((tool) => tool.name)).toEqual(["a", "b"])
    expect(sent(3).body.params).toEqual({ cursor: "c2" })
  })

  it.each([
    [401, "UNAUTHORIZED"],
    [403, "UNAUTHORIZED"],
    [500, "UNREACHABLE"],
  ])("maps HTTP %i to %s", async (status, code) => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status }))
    expect(await mcpListTools(ENDPOINT)).toEqual({ ok: false, code })
  })

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"))
    expect(await mcpListTools(ENDPOINT)).toEqual({ ok: false, code: "UNREACHABLE" })
  })

  it("rejects a reply that is not JSON-RPC", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>", { headers: { "content-type": "text/html" } }))
    expect(await mcpListTools(ENDPOINT)).toEqual({ ok: false, code: "PROTOCOL" })
  })

  it("omits the auth header when none is saved", async () => {
    script(json({ tools: [] }, 2))
    await mcpListTools({ url: ENDPOINT.url })
    expect(sent(0).headers).not.toHaveProperty("Authorization")
  })
})

describe("mcpCallTool", () => {
  it("joins the text parts and names other parts without their content", async () => {
    script(json({ content: [{ type: "text", text: "one" }, { type: "image", data: "AAAA" }, { type: "text", text: "two" }] }, 2))

    const result = await mcpCallTool(ENDPOINT, "search", { q: "x" })

    expect(result).toEqual({ ok: true, data: "one\n[image omitted]\ntwo" })
    expect(sent(2).body).toMatchObject({ method: "tools/call", params: { name: "search", arguments: { q: "x" } } })
  })

  it("cuts a long result", async () => {
    script(json({ content: [{ type: "text", text: "x".repeat(50_000) }] }, 2))
    const result = await mcpCallTool(ENDPOINT, "search", {})
    expect(result.ok && result.data).toHaveLength(20_000)
  })

  it("never returns the server's error text", async () => {
    script(json({ content: [{ type: "text", text: "secret stack trace" }], isError: true }, 2))
    expect(await mcpCallTool(ENDPOINT, "search", {})).toEqual({ ok: false, code: "TOOL_ERROR" })
  })
})
