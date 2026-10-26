import "server-only"

import { assertAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"
import { type RegisteredTool } from "../tools/types"
import { mcpCallTool, mcpListTools, type McpEndpoint, type McpToolInfo } from "./client"

const logger = createLogger("MCP_TOOLS")

/** Tool names the model sees start with this; the executor routes on it. */
export const MCP_TOOL_PREFIX = "mcp_"

const CACHE_MS = 60_000
const MAX_NAME_LENGTH = 64
const MAX_DESCRIPTION_LENGTH = 300

const listings = new Map<string, { at: number; tools: McpToolInfo[] }>()

interface Route {
  endpoint: McpEndpoint
  serverId: string
  serverName: string
  tool: string
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")

/**
 * `mcp_<server>_<tool>`: letters, digits and underscores, at most 64 characters.
 *
 * @internal
 */
export function mcpToolName(serverName: string, toolName: string): string {
  const base = `${MCP_TOOL_PREFIX}${slug(serverName)}_${slug(toolName)}`
  return base.slice(0, MAX_NAME_LENGTH)
}

/** Descriptions come from a third party: one short line, so they cannot carry a long instruction. */
function describe(serverName: string, tool: McpToolInfo): string {
  const line = tool.description.replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION_LENGTH)
  return `[${serverName}] ${line || tool.name}`
}

/** A server's tools, cached for a minute so a tool loop does not list them on every call. */
async function listServerTools(id: string, updatedAt: Date, endpoint: McpEndpoint) {
  const key = `${id}:${updatedAt.getTime()}`
  const hit = listings.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return { ok: true as const, data: hit.tools }
  const result = await mcpListTools(endpoint)
  if (result.ok) listings.set(key, { at: Date.now(), tools: result.data })
  return result
}

/**
 * The enabled tools of every active MCP server, as registered tools and the
 * route each name takes. A tool the admin has not turned on, or that the
 * server no longer lists, is absent. An unreachable server is skipped.
 */
export async function loadMcpTools(): Promise<{ tools: RegisteredTool[]; routes: Map<string, Route> }> {
  const servers = await prisma.mcpServer.findMany({ where: { isActive: true, NOT: { enabledTools: { isEmpty: true } } }, orderBy: { name: "asc" } })
  const tools: RegisteredTool[] = []
  const routes = new Map<string, Route>()

  await Promise.all(
    servers.map(async (server) => {
      const endpoint = { url: server.url, authHeaderName: server.authHeaderName, authHeaderSecret: server.authHeaderSecret }
      const listed = await listServerTools(server.id, server.updatedAt, endpoint)
      if (!listed.ok) {
        logger.warn("MCP server tools unavailable", { serverId: server.id, code: listed.code })
        return
      }
      for (const tool of listed.data.filter((t) => server.enabledTools.includes(t.name))) {
        const name = mcpToolName(server.name, tool.name)
        if (routes.has(name)) continue
        routes.set(name, { endpoint, serverId: server.id, serverName: server.name, tool: tool.name })
        tools.push({
          type: "function",
          permission: "assistant:tools:admin",
          function: { name, description: describe(server.name, tool), parameters: tool.inputSchema },
        })
      }
    })
  )
  return { tools: tools.sort((a, b) => a.function.name.localeCompare(b.function.name)), routes }
}

/** Runs one enabled MCP tool and audit-logs it by server and tool, never by arguments or result. */
export async function executeMcpTool(toolName: string, args: Record<string, unknown>, userId?: string): Promise<string> {
  await assertAdmin()
  const route = (await loadMcpTools()).routes.get(toolName)
  if (!route) return "Error: Unknown tool"

  logAuditEvent(AuditEventType.ASSISTANT_MCP_CALL, userId ?? "unknown", { serverId: route.serverId, tool: route.tool })
  const result = await mcpCallTool(route.endpoint, route.tool, args)
  return result.ok ? result.data : `Error: the ${route.serverName} tool failed (${result.code}).`
}
