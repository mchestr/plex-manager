/**
 * Renames a Discord channel with `PATCH /channels/{id}` and the bot token.
 *
 * Discord allows two renames per channel in ten minutes and answers `429` with
 * `retry_after` beyond that. A `429` is not waited out: the channel is left as
 * it was and the next run tries again.
 *
 * @module lib/discord/channel-stats/rename
 */

import { z } from "zod"

import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("DISCORD_CHANNEL_RENAME")

const DISCORD_API = "https://discord.com/api/v10"

export type RenameResult =
  | { ok: true }
  | { ok: false; code: "RATE_LIMITED"; retryAfterSec: number; global: boolean }
  | { ok: false; code: "FORBIDDEN" | "NOT_FOUND" | "FAILED" }

const rateLimitSchema = z.looseObject({ retry_after: z.number().optional(), global: z.boolean().optional() })

export async function renameChannel(
  token: string,
  channelId: string,
  name: string,
  { signal }: { signal?: AbortSignal } = {}
): Promise<RenameResult> {
  const timeout = AbortSignal.timeout(10_000)
  try {
    const response = await fetch(`${DISCORD_API}/channels/${encodeURIComponent(channelId)}`, {
      method: "PATCH",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", "X-Audit-Log-Reason": "Server stats" },
      body: JSON.stringify({ name }),
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    })
    if (response.ok) return { ok: true }
    if (response.status === 429) {
      const body = rateLimitSchema.safeParse(await response.json().catch(() => null))
      const retryAfterSec = body.success ? (body.data.retry_after ?? Number(response.headers.get("retry-after") ?? 0)) : 0
      return { ok: false, code: "RATE_LIMITED", retryAfterSec, global: body.success && body.data.global === true }
    }
    logger.warn("Discord refused a channel rename", { status: response.status })
    if (response.status === 403) return { ok: false, code: "FORBIDDEN" }
    return { ok: false, code: response.status === 404 ? "NOT_FOUND" : "FAILED" }
  } catch {
    logger.warn("Discord channel rename failed")
    return { ok: false, code: "FAILED" }
  }
}
