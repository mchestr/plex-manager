/**
 * Discord command audit wrapper.
 *
 * ## Overview
 *
 * Encapsulates the create → run → SUCCESS / catch → FAILED audit lifecycle that
 * previously lived duplicated (~5x) across the branches of the legacy
 * `MessageCreate` handler in `bot.ts`. Every slash-command handler dispatched by
 * the interaction router is wrapped by this helper so a `DiscordCommandLog` row
 * is always opened when work begins and closed with the correct terminal status.
 *
 * ## Lifecycle → DiscordCommandLog mapping
 *
 * ```
 * withAuditLog(params, fn)
 *   │
 *   ├─ createCommandLog(params)      → row.status = PENDING, startedAt = now
 *   │
 *   ├─ fn()  ──────── resolves ────► updateCommandLog(id, SUCCESS,  responseTimeMs, completedAt)
 *   │           │
 *   │           └──── throws ──────► updateCommandLog(id, FAILED, error, responseTimeMs, completedAt)
 *   │                                then the error is re-thrown to the caller
 * ```
 *
 * The audit log itself is best-effort: `createCommandLog` returns `null` when the
 * database write fails, in which case the wrapped `fn` still runs and no update is
 * attempted. Failures inside `fn` are always propagated after the FAILED log is
 * written, so the router can perform its own user-facing error handling.
 */

import { createCommandLog, updateCommandLog, type CreateCommandLogParams } from "../audit"
import type { DiscordCommandStatus } from "@/lib/generated/prisma"

/**
 * Run `fn` inside the audit-log lifecycle.
 *
 * @param params - The create-log parameters describing the command being run.
 * @param fn - The command work to execute. Its resolved value is returned.
 * @returns Whatever `fn` resolves to.
 * @throws Re-throws any error `fn` throws, after recording a FAILED audit log.
 */
export async function withAuditLog<T>(
  params: CreateCommandLogParams,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now()
  const log = await createCommandLog(params)

  try {
    const result = await fn()
    if (log) {
      await updateCommandLog(log.id, {
        status: "SUCCESS" as DiscordCommandStatus,
        responseTimeMs: Date.now() - startTime,
      })
    }
    return result
  } catch (error) {
    if (log) {
      await updateCommandLog(log.id, {
        status: "FAILED" as DiscordCommandStatus,
        error: error instanceof Error ? error.message : "Unknown error",
        responseTimeMs: Date.now() - startTime,
      })
    }
    throw error
  }
}
