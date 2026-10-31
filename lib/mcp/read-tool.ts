/**
 * The factory behind every MCP read tool (`lib/mcp/read-tools.ts`,
 * `lib/mcp/read-tools-community.ts`): admin only, `assertAdmin()` before the
 * read, the input parsed with Zod, the result as `{ success, data }` JSON, and
 * `null` from the loader as `NOT_FOUND`.
 *
 * @module lib/mcp/read-tool
 */

import "server-only"

import { z } from "zod"

import { assertAdmin } from "@/lib/admin"
import { publicInviteUrl } from "@/lib/admin/routes"
import { getBaseUrl } from "@/lib/env"
import { toolInputSchema } from "@/lib/mcp/json-schema"
import type { McpTool } from "@/lib/mcp/types"
import { getSeasonState } from "@/lib/wrapped/season"

/** A row id argument. */
export const idArg = z.string().min(1).max(100)

/** A season year argument; {@link seasonYear} fills in the current season. */
export const yearArg = z.number().int().min(2000).max(2100).optional().describe("Season year (default: the current season)")

export const seasonYear = async (year: number | undefined) => year ?? (await getSeasonState()).seasonYear

export const inviteUrl = (code: string) => publicInviteUrl(code, getBaseUrl())

/** `text` cut to `max` characters, with its full length, so a reader knows when it is partial. */
export function clip(text: string | null, max: number): { text: string | null; chars: number; truncated: boolean } {
  const chars = text?.length ?? 0
  return { text: text && text.slice(0, max), chars, truncated: chars > max }
}

interface ReadTool<S extends z.ZodType> {
  name: string
  description: string
  input?: S
  read: (input: z.output<S>) => Promise<unknown>
}

/** A read tool: admin only, its input parsed, its result as JSON (`null` reads as "not found"). */
export function readTool<S extends z.ZodType>({ name, description, input, read }: ReadTool<S>): McpTool {
  const { inputSchema } = toolInputSchema(input ?? null)
  return {
    name,
    description: `${description} Admin only.`,
    inputSchema,
    annotations: { readOnlyHint: true },
    source: "loader",
    allowed: (session) => session.user.isAdmin,
    run: async (args) => {
      await assertAdmin()
      const parsed = input ? input.safeParse(args) : { success: true as const, data: undefined }
      if (!parsed.success) {
        return { text: JSON.stringify({ success: false, code: "VALIDATION", error: parsed.error.issues[0]?.message ?? "Invalid input" }), isError: true }
      }
      const data = await read(parsed.data as z.output<S>)
      if (data === null) return { text: JSON.stringify({ success: false, code: "NOT_FOUND", error: "Not found" }), isError: true }
      return { text: JSON.stringify({ success: true, data }), isError: false }
    },
  }
}
