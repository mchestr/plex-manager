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
 * @module lib/mcp/catalog
 */

import "server-only"

import type { Session } from "next-auth"

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

/** The tools `session` may see and call. */
export function toolsFor(session: Session): McpTool[] {
  return [...allTools().values()].filter((tool) => tool.allowed(session))
}

/** The named tool when `session` may call it. */
export function toolFor(session: Session, name: string): McpTool | undefined {
  const tool = allTools().get(name)
  return tool && tool.allowed(session) ? tool : undefined
}
