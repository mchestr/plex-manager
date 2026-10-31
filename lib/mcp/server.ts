/**
 * The MCP server: one JSON-RPC message in, one response (or none) out.
 *
 * ## Protocol
 *
 * Streamable HTTP without streams: each POST carries one message and gets a
 * plain JSON reply, which the transport allows. The server keeps no session
 * between requests, so there is no `Mcp-Session-Id` and no GET stream.
 *
 * | Method | Reply |
 * |---|---|
 * | `initialize` | protocol version, the `tools` capability, server info, instructions |
 * | `ping` | `{}` |
 * | `tools/list` | the caller's tools (`toolsFor`), one page |
 * | `tools/call` | the tool's text, `isError` on a refusal or failure |
 * | `notifications/*` | nothing (the route answers 202) |
 *
 * ## Tool calls
 *
 * A call runs inside the token owner's session (`runAsPrincipal`) and a log
 * context with their id. A thrown error becomes `isError` with fixed text,
 * never the error's message. A credential string in the result is redacted
 * (`lib/mcp/redact.ts`), and a result over the size cap (`lib/mcp/result-limit.ts`)
 * becomes a `RESULT_TOO_LARGE` refusal, or for a tool that changes something,
 * its outcome without the result. A `read` token lists and calls only the
 * tools that read. Every call writes `MCP_TOOL_CALLED` with the
 * tool, its source, the token's row id (`credentialId`) and the outcome, never arguments or output.
 *
 * @module lib/mcp/server
 */

import "server-only"

import { z } from "zod"

import { serverName } from "@/lib/brand"
import { toolFor, toolsFor } from "@/lib/mcp/catalog"
import { runAsPrincipal } from "@/lib/mcp/principal"
import { redactCredentials } from "@/lib/mcp/redact"
import { limitResult, MAX_RESULT_CHARS } from "@/lib/mcp/result-limit"
import type { TokenPrincipal } from "@/lib/mcp/tokens"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { runWithRequestContext } from "@/lib/utils/log-context"
import { createLogger } from "@/lib/utils/logger"
import packageJson from "@/package.json"

const logger = createLogger("MCP_SERVER")

/** Newest first; an unknown version from the client gets the newest. */
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26"] as const

const TOOL_FAILED = "The tool failed. Check the server log for its request id."

const requestId = z.union([z.string(), z.number()])

const messageSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: requestId.optional(),
  method: z.string().min(1).max(200),
  params: z.record(z.string(), z.unknown()).optional(),
})

const callParamsSchema = z.object({
  name: z.string().min(1).max(200),
  arguments: z.record(z.string(), z.unknown()).optional(),
})

type JsonRpcId = z.infer<typeof requestId> | null

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string } }

export const PARSE_ERROR = -32700
export const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602

export function rpcError(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } }
}

/**
 * What the client loads before any tool: Claude Code defers the tool
 * definitions and finds them by searching names and descriptions, so this
 * says what the tools cover and how to ask for less.
 */
async function instructions(principal: TokenPrincipal): Promise<string> {
  const name = principal.session.user.name ?? "the token's owner"
  return [
    `Plex Manager for ${await serverName()}. Every tool acts as ${name}, with their permissions, and is audited.`,
    "The tools cover invites (create_invite, list_invites, delete_invite), members and their access (list_users, get_user,",
    "set_user_role, set_user_disabled, remove_member, subscriptions), settings and connections, announcements, affiliates,",
    "Rewind (season, generation, sharing), job queues, LLM usage, Discord, and lookups in Plex, Tautulli, Sonarr, Radarr",
    "and Overseerr. Search for a tool by what you want to do.",
    "Read tools (`list_*`, `get_*`) give the ids that the other tools take; list tools take `page` and `pageSize`, and",
    "lookups take a search, filter or limit.",
    "Results are JSON, `{ success: true, data }` or `{ success: false, code, error }`, of at most",
    `${MAX_RESULT_CHARS} characters: a larger result is refused with RESULT_TOO_LARGE, so ask for less.`,
    "An invite's `url` is the link to send to the invitee.",
    ...(principal.scope === "read" ? ["This token is read-only: it lists and calls only the tools that read."] : []),
  ].join(" ")
}

async function callTool(id: JsonRpcId, principal: TokenPrincipal, requestIdValue: string, params: unknown): Promise<JsonRpcResponse> {
  const parsed = callParamsSchema.safeParse(params)
  if (!parsed.success) return rpcError(id, INVALID_PARAMS, "Invalid tool call")
  const { session, tokenId, scope } = principal
  const tool = toolFor(session, parsed.data.name, scope)
  if (!tool) return rpcError(id, INVALID_PARAMS, `Unknown tool: ${parsed.data.name}`)

  let outcome: { text: string; isError: boolean }
  try {
    outcome = await runWithRequestContext(requestIdValue, session.user.id, () =>
      runAsPrincipal(session, () => tool.run(parsed.data.arguments ?? {}, session))
    )
  } catch (error) {
    logger.error("MCP tool failed", error, { tool: tool.name, credentialId: tokenId })
    outcome = { text: TOOL_FAILED, isError: true }
  }
  const clean = redactCredentials(outcome.text)
  if (clean.redacted) logger.warn("MCP tool result carried a credential; it was redacted", { tool: tool.name })
  const limited = limitResult({ ...outcome, text: clean.text }, { readOnly: tool.annotations.readOnlyHint, limit: tool.maxResultChars })
  if (limited.tooLarge) logger.warn("MCP tool result over the size limit", { tool: tool.name, chars: clean.text.length })
  outcome = limited
  logAuditEvent(AuditEventType.MCP_TOOL_CALLED, session.user.id, {
    tool: tool.name,
    source: tool.source,
    // "token" in a key is redacted from logs, so the row id goes by another name
    credentialId: tokenId,
    ok: !outcome.isError,
    ...(limited.tooLarge ? { tooLarge: true } : {}),
  })
  return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: outcome.text }], isError: outcome.isError } }
}

/**
 * The response to one JSON-RPC message, or null for a notification.
 * `requestIdValue` is the HTTP request's id, for the logs.
 */
export async function handleMessage(body: unknown, principal: TokenPrincipal, requestIdValue: string): Promise<JsonRpcResponse | null> {
  const parsed = messageSchema.safeParse(body)
  if (!parsed.success) {
    const id = typeof body === "object" && body !== null && "id" in body ? requestId.safeParse(body.id) : null
    return rpcError(id?.success ? id.data : null, INVALID_REQUEST, "Invalid request")
  }
  const { id, method, params } = parsed.data
  if (id === undefined) return null

  switch (method) {
    case "initialize": {
      const asked = typeof params?.protocolVersion === "string" ? params.protocolVersion : ""
      const protocolVersion = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : SUPPORTED_PROTOCOL_VERSIONS[0]
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "plex-manager", version: packageJson.version },
          instructions: await instructions(principal),
        },
      }
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} }
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: toolsFor(principal.session, principal.scope).map(({ name, description, inputSchema, annotations }) => ({
            name,
            description,
            inputSchema,
            annotations,
          })),
        },
      }
    case "tools/call":
      return callTool(id, principal, requestIdValue, params)
    default:
      return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${method}`)
  }
}
