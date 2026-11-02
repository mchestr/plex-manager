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
import { isToolError } from "@/lib/chatbot/executors/tool-output"
import { ALL_TOOLS } from "@/lib/chatbot/tools"
import type { McpTool } from "@/lib/mcp/types"
import { permissionsFor } from "@/lib/permissions"
import { getFormatSettings } from "@/lib/settings/app-settings"

/**
 * The assistant tools of the admin tier that only read. `assistant:tools:admin`
 * names an audience, not a promise that a tool only reads, so these are listed
 * by name, and the catalog test fails when an admin-tier tool is missing, so a
 * new one is reviewed before a read token may call it.
 *
 * @internal Exported for the catalog test.
 */
export const ADMIN_READ_TOOLS: ReadonlySet<string> = new Set([
  "get_app_failed_jobs",
  "get_app_invites",
  "get_app_member",
  "read_knowledge_doc",
  "search_knowledge_base",
])

/** Whether an assistant tool only reads: one of the read tier, or a listed admin read. */
function readsOnly(tool: (typeof ALL_TOOLS)[number]): boolean {
  return tool.permission === "assistant:tools:read" || ADMIN_READ_TOOLS.has(tool.function.name)
}

/** Every assistant tool. */
export function assistantTools(): McpTool[] {
  return ALL_TOOLS.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    inputSchema: { type: "object", properties: {}, ...tool.function.parameters },
    annotations: readsOnly(tool) ? { readOnlyHint: true } : { readOnlyHint: false, destructiveHint: false },
    source: "assistant",
    allowed: (session) => permissionsFor(session.user).has(tool.permission),
    run: async (args, { session }) => {
      const text = await executeToolCall(
        { id: randomUUID(), type: "function", function: { name: tool.function.name, arguments: JSON.stringify(args) } },
        session.user.id,
        undefined,
        session.user.isAdmin,
        await getFormatSettings(),
        permissionsFor(session.user)
      )
      // An executor reports a failure as "Error..." text or as JSON with `error` or `success: false`
      return { text, isError: isToolError(text) }
    },
  }))
}
