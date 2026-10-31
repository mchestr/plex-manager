/**
 * Every Server Action as an MCP tool, so an MCP client can do anything the
 * admin UI does without a second copy of the logic.
 *
 * A tool is built from what `defineAction` records on each action: its auth
 * requirement (`actionAuthOf`) and its Zod input (`actionInputOf`, turned into
 * JSON Schema). Its description is the action's JSDoc summary
 * (`action-docs.generated.ts`). Calling it calls the action itself inside the
 * token owner's session (`lib/mcp/principal.ts`), so the action's own guard,
 * validation, rate limit and audit entry all apply; the result is the
 * action's `ActionResult` as JSON.
 *
 * ## Left out
 *
 * - Public actions and form adapters (they serve signed-out visitors and forms).
 * - `EXCLUDED_MODULES` (`lib/mcp/action-modules.ts`) and {@link EXCLUDED}:
 *   actions that need a browser (cookies, the setup claim, a Plex PIN), that
 *   only record what a browser showed, or that would let a token reach
 *   further than its owner's own session (making tokens, the assistant itself).
 *
 * A new action is a tool as soon as its module is in `ACTION_MODULES`.
 *
 * @module lib/mcp/action-tools
 */

import "server-only"

import type { Session } from "next-auth"

import { actionAuthOf, actionInputOf } from "@/lib/actions/define-action"
import type { ActionResult } from "@/lib/actions/result"
import { publicInviteUrl } from "@/lib/admin/routes"
import { getBaseUrl } from "@/lib/env"
import { ACTION_DOCS } from "@/lib/mcp/action-docs.generated"
import { ACTION_MODULES } from "@/lib/mcp/action-modules"
import { toolInputSchema } from "@/lib/mcp/json-schema"
import type { McpTool } from "@/lib/mcp/types"
import { hasPermission, type Permission } from "@/lib/permissions"

/**
 * Actions in an included module that are not tools, with the reason.
 *
 * @internal Exported for the catalog test.
 */
export const EXCLUDED: Readonly<Record<string, string>> = {
  adoptBrowserTimezone: "reads the browser's zone",
  chatWithAdminBot: "the assistant itself; the MCP client is the assistant",
  completeSetup: "the setup wizard's last step",
  skipSetupStep: "the setup wizard's step order",
}

/** Actions that return an invite code: their result also carries the link to send. */
const INVITE_RESULTS: ReadonlySet<string> = new Set(["createInvite", "createAffiliateInvite"])

/** Adds `url`, the public invite link, to a successful invite result. */
function withInviteUrl(result: ActionResult<unknown, string>): ActionResult<unknown, string> {
  if (!result.success || typeof result.data !== "object" || result.data === null) return result
  const { code } = result.data as { code?: unknown }
  return typeof code === "string" ? { ...result, data: { ...result.data, url: publicInviteUrl(code, getBaseUrl()) } } : result
}

const READ_PREFIXES = ["get", "list", "preview", "estimate", "discover"]
const DESTRUCTIVE_PREFIXES = ["delete", "remove", "revoke", "unshare", "rollback", "cancel", "disable", "adminCancel"]

/**
 * `createInvite` -> `create_invite`, `saveLLMProvider` -> `save_llm_provider`.
 *
 * @internal Exported for the catalog test.
 */
export function toolName(exportName: string): string {
  return exportName
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
}

/** `createInvite` -> `Create invite.` for an action without a JSDoc summary. */
function fallbackDescription(exportName: string): string {
  const words = toolName(exportName).replace(/_/g, " ")
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`
}

const AUDIENCE: Record<string, string> = {
  admin: "Admin only.",
  setup: "Admin only.",
  member: "Acts on the token owner's own account.",
}

/** Whether `session` meets an action's recorded requirement. */
function meets(auth: string, session: Session): boolean {
  if (auth === "member") return true
  if (auth === "admin" || auth === "setup") return session.user.isAdmin
  if (auth.startsWith("permission:")) return hasPermission(session.user, auth.slice("permission:".length) as Permission)
  return false
}

function startsWithAny(name: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => name.startsWith(prefix) && /[A-Z]/.test(name.charAt(prefix.length)))
}

/** One action as a tool, or null when it is not one. */
function actionTool(exportName: string, value: unknown): McpTool | null {
  const auth = actionAuthOf(value)
  const input = actionInputOf(value)
  if (!auth || auth === "public" || input === undefined || EXCLUDED[exportName]) return null
  const action = value as (input?: unknown) => Promise<ActionResult<unknown, string>>
  const { inputSchema, unwrap } = toolInputSchema(input)
  const summary = ACTION_DOCS[exportName] ?? fallbackDescription(exportName)
  const audience = AUDIENCE[auth] ?? `Needs the ${auth.slice("permission:".length)} permission.`
  const readOnly = startsWithAny(exportName, READ_PREFIXES)

  const link = INVITE_RESULTS.has(exportName) ? " The result's `url` is the link to send." : ""

  return {
    name: toolName(exportName),
    description: `${summary} ${audience}${link}`,
    inputSchema,
    annotations: readOnly ? { readOnlyHint: true } : { readOnlyHint: false, destructiveHint: startsWithAny(exportName, DESTRUCTIVE_PREFIXES) },
    source: "action",
    allowed: (session) => meets(auth, session),
    run: async (args) => {
      const raw = input ? await action(unwrap(args)) : await action()
      const result = INVITE_RESULTS.has(exportName) ? withInviteUrl(raw) : raw
      return { text: JSON.stringify(result), isError: !result.success }
    },
  }
}

/** Every action tool, in module then export order. */
export function actionTools(): McpTool[] {
  return Object.values(ACTION_MODULES).flatMap((module) =>
    Object.entries(module).flatMap(([exportName, value]) => {
      const tool = actionTool(exportName, value)
      return tool ? [tool] : []
    })
  )
}
