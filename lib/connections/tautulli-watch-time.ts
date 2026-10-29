/**
 * Tautulli reads for the request-tier sync and affiliate tiers: every user's
 * id, and one user's watch time in hours.
 *
 * @module lib/connections/tautulli-watch-time
 */

import { z } from "zod"

import { tautulliCommand } from "@/lib/connections/tautulli"
import type { TautulliParsed } from "@/lib/validations/tautulli"

type Endpoint = Pick<TautulliParsed, "url" | "apiKey">

const usersSchema = z.array(z.looseObject({ user_id: z.number().int() }))

/** The Tautulli `user_id` (the plex.tv account id) of every user. */
export async function listTautulliUserIds(config: Endpoint, opts: { signal?: AbortSignal } = {}) {
  const result = await tautulliCommand(config, "get_users", {}, usersSchema, opts)
  return result.ok ? { ok: true as const, data: result.data.map((user) => user.user_id) } : result
}

const watchTimeSchema = z.array(z.looseObject({ query_days: z.coerce.number().optional(), total_time: z.coerce.number() }))

/** All-time watch time (`query_days=0`) in hours. */
export async function getAllTimeWatchHours(config: Endpoint, userId: number, opts: { signal?: AbortSignal } = {}) {
  const result = await tautulliCommand(config, "get_user_watch_time_stats", { user_id: userId, query_days: 0 }, watchTimeSchema, opts)
  if (!result.ok) return result
  const row = result.data.find((entry) => entry.query_days === 0) ?? result.data[0]
  return { ok: true as const, data: (row?.total_time ?? 0) / 3600 }
}

/** All-time and last-30-days watch time in hours, from one `query_days=30,0` call. */
export async function getWatchHours(config: Endpoint, userId: number, opts: { signal?: AbortSignal } = {}) {
  const result = await tautulliCommand(config, "get_user_watch_time_stats", { user_id: userId, query_days: "30,0" }, watchTimeSchema, opts)
  if (!result.ok) return result
  const hours = (days: number) => (result.data.find((entry) => entry.query_days === days)?.total_time ?? 0) / 3600
  return { ok: true as const, data: { allTime: hours(0), last30Days: hours(30) } }
}
