import "server-only"

import { z } from "zod"

import { fetchWithSafeRedirects } from "@/lib/connections/http"
import { createLogger } from "@/lib/utils/logger"

/**
 * A minimal MCP client for the Streamable HTTP transport: each operation
 * initializes a session, runs `tools/list` or `tools/call` and drops the
 * session. Calls go through `fetchWithSafeRedirects`, so a redirect to another
 * origin never carries the admin's auth header.
 *
 * Failures come back as fixed codes, never the server's text: an MCP server is
 * third-party and its error text can carry anything.
 *
 * @module lib/chatbot/mcp/client
 */

const logger = createLogger("MCP_CLIENT")

const PROTOCOL_VERSION = "2025-03-26"
const TIMEOUT_MS = 15_000
const MAX_PAGES = 5
const MAX_RESULT_CHARS = 20_000

export interface McpEndpoint {
  url: string
  authHeaderName?: string | null
  authHeaderSecret?: string | null
}

export interface McpToolInfo {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  /** The server's own `readOnlyHint`; only a hint, since the server is untrusted. */
  readOnlyHint: boolean
}

export type McpResult<T> = { ok: true; data: T } | { ok: false; code: "UNREACHABLE" | "UNAUTHORIZED" | "PROTOCOL" | "TOOL_ERROR" }

const envelope = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
})

const listResult = z.object({
  tools: z.array(
    z.object({
      name: z.string().min(1).max(128),
      description: z.string().optional(),
      inputSchema: z.record(z.string(), z.unknown()).optional(),
      annotations: z.object({ readOnlyHint: z.boolean().optional() }).partial().optional(),
    })
  ),
  nextCursor: z.string().optional(),
})

const callResult = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).default([]),
  isError: z.boolean().optional(),
})

class McpFailure extends Error {
  constructor(readonly code: Exclude<McpResult<never>, { ok: true }>["code"]) {
    super(code)
  }
}

/** The JSON-RPC message with `id` from a JSON body or a `text/event-stream` body. */
function parseMessage(contentType: string, text: string, id: number): z.infer<typeof envelope> {
  const candidates = contentType.includes("text/event-stream")
    ? text
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
    : [text]
  for (const candidate of candidates) {
    try {
      const parsed = envelope.safeParse(JSON.parse(candidate))
      if (parsed.success && parsed.data.id === id) return parsed.data
    } catch {
      // Not a JSON-RPC message; keep looking
    }
  }
  throw new McpFailure("PROTOCOL")
}

class Session {
  private nextId = 1
  private sessionId: string | null = null

  constructor(private readonly endpoint: McpEndpoint) {}

  private async post(body: unknown): Promise<Response> {
    const { url, authHeaderName, authHeaderSecret } = this.endpoint
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
    }
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId
    if (authHeaderName && authHeaderSecret) headers[authHeaderName] = authHeaderSecret
    try {
      return await fetchWithSafeRedirects(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      throw new McpFailure("UNREACHABLE")
    }
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++
    const response = await this.post({ jsonrpc: "2.0", id, method, params })
    if (response.status === 401 || response.status === 403) throw new McpFailure("UNAUTHORIZED")
    if (!response.ok) throw new McpFailure("UNREACHABLE")
    this.sessionId ??= response.headers.get("mcp-session-id")
    const message = parseMessage(response.headers.get("content-type") ?? "", await response.text(), id)
    if (message.error !== undefined) throw new McpFailure("PROTOCOL")
    return message.result
  }

  async open(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "plex-manager", version: "1.0.0" },
    })
    const response = await this.post({ jsonrpc: "2.0", method: "notifications/initialized" })
    await response.body?.cancel().catch(() => undefined)
  }
}

async function withSession<T>(endpoint: McpEndpoint, run: (session: Session) => Promise<T>): Promise<McpResult<T>> {
  try {
    const session = new Session(endpoint)
    await session.open()
    return { ok: true, data: await run(session) }
  } catch (error) {
    if (error instanceof McpFailure) return { ok: false, code: error.code }
    logger.warn("MCP call failed unexpectedly", { error: String(error) })
    return { ok: false, code: "PROTOCOL" }
  }
}

/** Every tool the server lists (first {@link MAX_PAGES} pages). */
export function mcpListTools(endpoint: McpEndpoint): Promise<McpResult<McpToolInfo[]>> {
  return withSession(endpoint, async (session) => {
    const tools: McpToolInfo[] = []
    let cursor: string | undefined
    for (let page = 0; page < MAX_PAGES; page++) {
      const parsed = listResult.safeParse(await session.request("tools/list", cursor ? { cursor } : {}))
      if (!parsed.success) throw new McpFailure("PROTOCOL")
      for (const tool of parsed.data.tools) {
        tools.push({
          name: tool.name,
          description: tool.description ?? "",
          inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
          readOnlyHint: tool.annotations?.readOnlyHint === true,
        })
      }
      cursor = parsed.data.nextCursor
      if (!cursor) break
    }
    return tools
  })
}

/** The text of a tool call, cut to {@link MAX_RESULT_CHARS}; a tool-reported error is `TOOL_ERROR`. */
export async function mcpCallTool(endpoint: McpEndpoint, name: string, args: Record<string, unknown>): Promise<McpResult<string>> {
  const result = await withSession(endpoint, async (session) => {
    const parsed = callResult.safeParse(await session.request("tools/call", { name, arguments: args }))
    if (!parsed.success) throw new McpFailure("PROTOCOL")
    const text = parsed.data.content.map((part) => (part.type === "text" ? (part.text ?? "") : `[${part.type} omitted]`)).join("\n")
    return { text: text.slice(0, MAX_RESULT_CHARS), isError: parsed.data.isError === true }
  })
  if (!result.ok) return result
  return result.data.isError ? { ok: false, code: "TOOL_ERROR" } : { ok: true, data: result.data.text }
}
