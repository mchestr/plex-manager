/**
 * Every MCP tool and the ones a caller may see.
 *
 * ```
 * actionTools()     every Server Action   (lib/mcp/action-tools.ts)
 * readTools()       the admin page reads  (lib/mcp/read-tools.ts)
 * assistantTools()  the assistant's tools (lib/mcp/assistant-tools.ts)
 * ```
 *
 * Names are unique across the three; the catalog throws at first use when
 * they are not, which `lib/mcp/__tests__/catalog.test.ts` catches first.
 *
 * A caller sees the tools its session may use; a `read` token, only those of
 * them that read (`readOnlyHint`: the admin reads, the reviewed read-only
 * actions and the assistant's read tools).
 *
 * @module lib/mcp/catalog
 */

import "server-only"

import type { Session } from "next-auth"

import type { ApiTokenScope } from "@/lib/generated/prisma/client"

import { actionTools } from "@/lib/mcp/action-tools"
import { assistantTools } from "@/lib/mcp/assistant-tools"
import { readTools } from "@/lib/mcp/read-tools"
import type { McpTool } from "@/lib/mcp/types"

let catalog: ReadonlyMap<string, McpTool> | null = null

/**
 * Every tool by name, built once per process.
 *
 * @internal Exported for the catalog test.
 */
export function allTools(): ReadonlyMap<string, McpTool> {
  if (catalog) return catalog
  const tools = new Map<string, McpTool>()
  for (const tool of [...actionTools(), ...readTools(), ...assistantTools()]) {
    if (tools.has(tool.name)) throw new Error(`Two MCP tools are named ${tool.name}`)
    tools.set(tool.name, tool)
  }
  catalog = tools
  return tools
}

/** Whether a caller with `session` and a token of `scope` may see and call `tool`. */
function usable(tool: McpTool, session: Session, scope: ApiTokenScope): boolean {
  return tool.allowed(session) && (scope === "full" || tool.annotations.readOnlyHint)
}

/** The tools `session` may see and call with a token of `scope`. */
export function toolsFor(session: Session, scope: ApiTokenScope): McpTool[] {
  return [...allTools().values()].filter((tool) => usable(tool, session, scope))
}

/** Whether the named tool is one `session` may use but a token of `scope` may not: a change, for a read token. */
export function blockedByScope(session: Session, name: string, scope: ApiTokenScope): boolean {
  const tool = allTools().get(name)
  return Boolean(tool && tool.allowed(session) && !usable(tool, session, scope))
}

/** The named tool when `session` may call it with a token of `scope`. */
export function toolFor(session: Session, name: string, scope: ApiTokenScope): McpTool | undefined {
  const tool = allTools().get(name)
  return tool && usable(tool, session, scope) ? tool : undefined
}
