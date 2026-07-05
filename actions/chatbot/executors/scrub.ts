/**
 * Discord tool-output scrubber — the PII / data-leak firewall (design §4.4, FR-8).
 *
 * ## Overview
 *
 * In the Discord support context the chatbot must NEVER surface personally
 * identifying information (emails, usernames, user/account ids, IP addresses,
 * tokens, machine/session identifiers tied to a person, etc.). Denylist regexes
 * are a fragile last line of defence — new fields leak the moment an upstream
 * API adds them. This module inverts the model: tool output is projected down
 * to a per-tool ALLOWLIST of explicitly-safe field names BEFORE the LLM ever
 * sees it, so anything not on the list is dropped by construction.
 *
 * ## Algorithm — deep allowlist projection
 *
 * The raw executor output is a JSON string (executors `JSON.stringify` their
 * results) or, defensively, an already-parsed object. Given the allowlist
 * `discordFields` for the tool, we walk the value recursively:
 *
 * ```
 * project(value):
 *   array  -> map project over elements, drop empty results
 *   object -> for each [key, v]:
 *               if key ∈ allowlist        keep project(v)      (safe leaf/subtree)
 *               else if v is a container   r = project(v)       (wrapper: recurse)
 *                                          keep r if non-empty
 *               else                       DROP                 (unlisted scalar)
 *   scalar -> returned as-is (only reachable via an allowlisted key)
 * ```
 *
 * Allowlisting only LEAF field names (not wrapper keys like `response`, `data`,
 * `MediaContainer`, `records`, `status`, `queue`) is what lets a safe field
 * survive through arbitrary wrapper layers while sibling PII scalars at the same
 * or any deeper level are stripped.
 *
 * ## Fail closed (FR-8)
 *
 * If the tool is unknown, is NOT `discordSafe`, or is `discordSafe` but has no
 * (or empty) `discordFields`, we return a redacted marker rather than any raw
 * data. Under-exposing is always preferred to leaking. Malformed / non-JSON
 * executor output (e.g. an `"Error: ..."` string) also fails closed.
 *
 * This function is pure and must never throw on unexpected shapes.
 *
 * @module
 */

import { getRegisteredTool } from "@/actions/chatbot/tools"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("CHATBOT_DISCORD_SCRUB")

/**
 * Emitted (as a JSON string) whenever scrubbing cannot safely surface data.
 * Kept terse so it reads sensibly if the LLM echoes it to the user.
 */
export const DISCORD_REDACTED_MARKER = "[redacted for privacy]"

function redacted(): string {
  return JSON.stringify({ redacted: DISCORD_REDACTED_MARKER })
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * True when a projected value carries no surviving information and should be
 * pruned from its parent (empty object, empty array).
 * @internal
 */
function isEmptyProjection(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0
  if (isPlainRecord(value)) return Object.keys(value).length === 0
  return false
}

/**
 * Recursively project `value` down to the `allow` set of leaf keys.
 * @internal
 */
function project(value: unknown, allow: Set<string>): unknown {
  if (Array.isArray(value)) {
    const mapped = value.map((item) => project(item, allow)).filter((item) => !isEmptyProjection(item))
    return mapped
  }

  if (isPlainRecord(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (allow.has(key)) {
        // Allowlisted subtree: keep it, but still project INTO it so that a
        // nested unsafe field cannot ride along inside an otherwise-safe object.
        out[key] = project(child, allow)
      } else if (Array.isArray(child) || isPlainRecord(child)) {
        // Unlisted wrapper/container: recurse; keep only if something survived.
        const projected = project(child, allow)
        if (!isEmptyProjection(projected)) {
          out[key] = projected
        }
      }
      // Unlisted scalar (string/number/boolean/null): dropped by omission.
    }
    return out
  }

  // Scalar reached only via an allowlisted key — safe to return as-is.
  return value
}

/**
 * Scrub a single tool's raw output for the Discord context.
 *
 * @param toolName - The chatbot tool that produced `rawOutput`.
 * @param rawOutput - The executor result: a JSON string (normal path) or an
 *   already-parsed value (used by tests / defensive callers).
 * @returns A JSON string safe to hand to the LLM in the Discord context. Fails
 *   closed to {@link DISCORD_REDACTED_MARKER} for unknown / unsafe / unmapped
 *   tools and for malformed input.
 *
 * @example
 * ```ts
 * // get_tautulli_status allowlists tautulli_version + stream_count
 * scrubForDiscord(
 *   "get_tautulli_status",
 *   '{"response":{"data":{"tautulli_version":"2.13.4","stream_count":"3","user_id":42}}}'
 * )
 * // => '{"response":{"data":{"tautulli_version":"2.13.4","stream_count":"3"}}}'
 * ```
 */
export function scrubForDiscord(toolName: string, rawOutput: unknown): string {
  const tool = getRegisteredTool(toolName)

  // Fail closed: unknown tool, or a tool that is not Discord-safe at all.
  if (!tool || !tool.discordSafe) {
    logger.warn("Refusing to surface non-safe tool output in Discord context", {
      toolName,
      known: !!tool,
      discordSafe: tool?.discordSafe ?? false,
    })
    return redacted()
  }

  // Plaintext, already-caller-scoped output (e.g. media-marking summaries): pass
  // the string through unchanged. Fail closed if such a tool unexpectedly emits
  // a non-string (structured data it was never meant to return).
  if (tool.discordPlaintext) {
    if (typeof rawOutput === "string") {
      return rawOutput
    }
    logger.warn("discordPlaintext tool returned non-string output; failing closed", { toolName })
    return redacted()
  }

  // Fail closed: discordSafe but no allowlist defined — never pass raw data.
  if (!tool.discordFields || tool.discordFields.length === 0) {
    logger.warn("discordSafe tool has no discordFields allowlist; failing closed", {
      toolName,
    })
    return redacted()
  }

  // Parse the executor output (JSON string) or accept a pre-parsed value.
  let parsed: unknown
  if (typeof rawOutput === "string") {
    try {
      parsed = JSON.parse(rawOutput)
    } catch {
      // Non-JSON output (e.g. an "Error: ..." string) — cannot safely project.
      logger.warn("Tool output was not JSON; failing closed", { toolName })
      return redacted()
    }
  } else {
    parsed = rawOutput
  }

  // Only object/array payloads can be projected. Bare scalars carry no field
  // structure to allowlist against, so fail closed.
  if (!isPlainRecord(parsed) && !Array.isArray(parsed)) {
    return redacted()
  }

  const allow = new Set<string>(tool.discordFields)

  try {
    return JSON.stringify(project(parsed, allow))
  } catch (error) {
    // Extremely defensive: JSON.stringify can throw on circular refs / BigInt.
    logger.error("Failed to serialize scrubbed tool output; failing closed", error, { toolName })
    return redacted()
  }
}
