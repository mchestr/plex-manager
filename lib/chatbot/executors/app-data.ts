import "server-only"

import { ZodError } from "zod"

import { getAssistantFailedJobs, getAssistantInvites, getAssistantMember } from "@/lib/data/assistant-data"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { formatIsoWithOffset, type FormatSettings } from "@/lib/utils/format"
import { UTC_FORMAT } from "./timestamps"

const APP_DATA_TOOL_NAMES = new Set(["get_app_invites", "get_app_member", "get_app_failed_jobs"])

/**
 * Runs an app-data tool. The loaders check `assertAdmin()` themselves, so a
 * call outside an admin session throws and the executor index reports a
 * failure. Each call is audit-logged by tool name, never by its arguments or
 * result.
 */
export async function executeAppDataTool(
  toolName: string,
  args: Record<string, unknown>,
  userId?: string,
  _context?: string,
  format: FormatSettings = UTC_FORMAT
): Promise<string> {
  if (!APP_DATA_TOOL_NAMES.has(toolName)) return "Error: Unknown tool"

  // Before the read, so a call that fails still leaves its line
  logAuditEvent(AuditEventType.ASSISTANT_DATA_READ, userId ?? "unknown", { toolName })
  let data: unknown
  try {
    data = await read(toolName, args)
  } catch (error) {
    if (error instanceof ZodError) return "Error: Invalid tool arguments"
    throw error
  }
  return JSON.stringify(inZone(data, format.timeZone))
}

async function read(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  switch (toolName) {
    case "get_app_invites":
      return getAssistantInvites(args)
    case "get_app_member":
      return getAssistantMember(args as { query: string })
    case "get_app_failed_jobs":
      return getAssistantFailedJobs(args)
    default:
      throw new Error(`Unhandled app data tool: ${toolName}`)
  }
}

/** `value` with every Date as an ISO string in `timeZone`, offset included, at any depth. */
function inZone(value: unknown, timeZone: string): unknown {
  if (value instanceof Date) return formatIsoWithOffset(value, timeZone)
  if (Array.isArray(value)) return value.map((item) => inZone(item, timeZone))
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, inZone(child, timeZone)]))
}
