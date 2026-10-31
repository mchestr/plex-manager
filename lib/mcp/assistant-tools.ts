/**
 * The admin assistant's tools (`lib/chatbot/tools`) as MCP tools: the Plex,
 * Tautulli, Sonarr, Radarr and Overseerr lookups, media marking, the app-data
 * reads and the knowledge base. They run through `executeToolCall`, which
 * checks the caller's permissions again and audits a role's calls, exactly as
 * in the assistant.
 *
 * @module lib/mcp/assistant-tools
 */

import "server-only"

import { randomUUID } from "node:crypto"

import { executeToolCall } from "@/lib/chatbot/executors"
import { ALL_TOOLS } from "@/lib/chatbot/tools"
import type { McpTool } from "@/lib/mcp/types"
import { permissionsFor } from "@/lib/permissions"
import { getFormatSettings } from "@/lib/settings/app-settings"

/** Every assistant tool. */
export function assistantTools(): McpTool[] {
  return ALL_TOOLS.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    inputSchema: { type: "object", properties: {}, ...tool.function.parameters },
    annotations: tool.permission === "assistant:tools:write" ? { readOnlyHint: false, destructiveHint: false } : { readOnlyHint: true },
    source: "assistant",
    allowed: (session) => permissionsFor(session.user).has(tool.permission),
    run: async (args, session) => {
      const text = await executeToolCall(
        { id: randomUUID(), type: "function", function: { name: tool.function.name, arguments: JSON.stringify(args) } },
        session.user.id,
        undefined,
        session.user.isAdmin,
        await getFormatSettings(),
        permissionsFor(session.user)
      )
      return { text, isError: text.startsWith("Error") }
    },
  }))
}
