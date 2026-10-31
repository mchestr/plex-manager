import "server-only"

import { cache } from "react";
import { z } from "zod";
import { testServiceConnection } from "@/lib/connections/connection-test";
import {
  invalidResponse,
  isTransientFailure,
  serviceFetch,
  toConnectionResult,
  withRetry,
  type ServiceErrorCode,
  type ServiceResult,
} from "@/lib/connections/http";
import { tautulliEnvelopeSchema, type TautulliParsed } from "@/lib/validations/tautulli";
import { createLogger } from "@/lib/utils/logger";
import { type ConnectionResult } from "@/types/connection";

const logger = createLogger("TAUTULLI");

/** The URL and API key needed to call Tautulli. */
type TautulliEndpoint = Pick<TautulliParsed, "url" | "apiKey">

/**
 * The Tautulli v2 commands this app calls. Only commands Tautulli's API
 * exposes belong here (RWP-10): "recently watched", "most watched" and "top
 * users" are `get_history` and `get_home_stats` with a `stat_id`.
 */
export type TautulliCommand =
  | "get_activity"
  | "get_children_metadata"
  | "get_history"
  | "get_home_stats"
  | "get_item_user_stats"
  | "get_libraries"
  | "get_libraries_table"
  | "get_library_names"
  | "get_metadata"
  | "get_server_info"
  | "get_tautulli_info"
  | "get_user_watch_time_stats"
  | "get_users"
  | "get_users_table"

type TautulliResult<T> = ServiceResult<T, ServiceErrorCode | "TAUTULLI_ERROR">

type TautulliParams = Record<string, string | number | undefined>

/** The `api/v2` URL. The key stays in the query, because Tautulli requires it there. @internal */
function tautulliUrl(config: TautulliEndpoint, cmd: TautulliCommand, params: TautulliParams): string {
  const query = new URLSearchParams({ apikey: config.apiKey, cmd })
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value))
  }
  return `${config.url.replace(/\/+$/, "")}/api/v2?${query.toString()}`
}

/**
 * The one Tautulli client. Calls `cmd` through `serviceFetch`, unwraps the
 * `{ response: { result, message, data } }` envelope and parses `data` with
 * `schema`.
 *
 * - A `result` other than `"success"` is `TAUTULLI_ERROR`; Tautulli's
 *   `message` is not passed on.
 * - `TAUTULLI_ERROR`, network errors, 429 and 5xx are retried (3 attempts by
 *   default, jittered backoff). A 4xx, such as the 400 Tautulli sends for an
 *   unknown command, and a timeout are not.
 *
 * @example
 * ```ts
 * const users = await tautulliCommand(config, "get_users", {}, z.array(z.unknown()))
 * if (!users.ok) return users.code // "TAUTULLI_ERROR", "TIMEOUT", "HTTP", ...
 * ```
 */
export async function tautulliCommand<T>(
  config: TautulliEndpoint,
  cmd: TautulliCommand,
  params: TautulliParams,
  schema: z.ZodType<T>,
  opts: { timeoutMs?: number; signal?: AbortSignal; attempts?: number } = {}
): Promise<TautulliResult<T>> {
  const url = tautulliUrl(config, cmd, params)
  const once = async (): Promise<TautulliResult<T>> => {
    const result = await serviceFetch({
      service: "Tautulli",
      url,
      schema: tautulliEnvelopeSchema,
      timeoutMs: opts.timeoutMs,
      signal: opts.signal,
    })
    if (!result.ok) return result
    if (result.data.response.result !== "success") {
      logger.warn("Tautulli returned an error result", { cmd })
      return { ok: false, code: "TAUTULLI_ERROR" }
    }
    const parsed = schema.safeParse(result.data.response.data)
    return parsed.success ? { ok: true, data: parsed.data } : invalidResponse("Tautulli", parsed.error, { cmd })
  }
  return withRetry(once, {
    attempts: opts.attempts,
    signal: opts.signal,
    retryOn: (failure) => failure.code === "TAUTULLI_ERROR" || isTransientFailure(failure),
  })
}

/** {@link tautulliCommand} for the chatbot tools: the raw `data`, in the older result shape. */
async function rawCommand(
  config: TautulliEndpoint,
  cmd: TautulliCommand,
  params: TautulliParams = {}
): Promise<ConnectionResult<unknown>> {
  return toConnectionResult("Tautulli", await tautulliCommand(config, cmd, params, z.unknown()))
}

export async function testTautulliConnection(config: TautulliEndpoint): Promise<{ success: boolean; error?: string }> {
  return testServiceConnection("Tautulli", () =>
    tautulliCommand(config, "get_server_info", {}, z.unknown(), { attempts: 1 })
  )
}

export async function getTautulliActivity(config: TautulliEndpoint): Promise<ConnectionResult<unknown>> {
  return rawCommand(config, "get_activity")
}

export async function getTautulliServerInfo(config: TautulliEndpoint): Promise<ConnectionResult<unknown>> {
  return rawCommand(config, "get_server_info")
}

export async function getTautulliLibraryNames(config: TautulliEndpoint): Promise<ConnectionResult<unknown>> {
  return rawCommand(config, "get_library_names")
}

export async function getTautulliLibraryStats(config: TautulliEndpoint): Promise<ConnectionResult<unknown>> {
  return rawCommand(config, "get_libraries_table")
}

export async function getTautulliUsers(config: TautulliEndpoint): Promise<ConnectionResult<unknown>> {
  return rawCommand(config, "get_users")
}

/** Newest plays first (Tautulli's default order), optionally for one Tautulli user. */
export async function getTautulliHistory(
  config: TautulliEndpoint,
  userId?: number,
  limit = 20
): Promise<ConnectionResult<unknown>> {
  return rawCommand(config, "get_history", { length: limit, user_id: userId })
}

/** One `get_home_stats` card: `top_movies`, `top_tv` or `top_users`. */
export async function getTautulliHomeStat(
  config: TautulliEndpoint,
  statId: "top_movies" | "top_tv" | "top_users",
  count: number,
  statsType: "plays" | "duration" = "plays"
): Promise<ConnectionResult<unknown>> {
  return rawCommand(config, "get_home_stats", { stat_id: statId, stats_count: count, stats_type: statsType })
}

const tautulliInfoSchema = z.object({ tautulli_version: z.string() }).loose()

/**
 * Tautulli's own version (`get_tautulli_info`), such as `"2.17.0"`, without
 * the leading `v`. The season preflight warns below 2.17 (P7.8).
 */
export async function getTautulliInfo(
  config: TautulliEndpoint,
  opts: { signal?: AbortSignal } = {}
): Promise<TautulliResult<{ version: string }>> {
  const result = await tautulliCommand(config, "get_tautulli_info", {}, tautulliInfoSchema, { attempts: 1, timeoutMs: 5000, ...opts })
  return result.ok ? { ok: true, data: { version: result.data.tautulli_version.replace(/^v/i, "") } } : result
}

export async function getTautulliUserWatchTimeStats(
  config: TautulliEndpoint,
  userId?: number
): Promise<ConnectionResult<unknown>> {
  return rawCommand(config, "get_user_watch_time_stats", { user_id: userId })
}

/** The Plex identity used to find a member in Tautulli's user list. */
export interface TautulliUserIdentity {
  /** The plex.tv account ID (`User.plexUserId`). */
  plexUserId: string
}

const tautulliUserRowSchema = z.object({
  user_id: z.number().int(),
  username: z.string().nullish(),
  /** 1 for a managed (restricted) Plex Home account; Rewind leaves those out by default (P5.9). */
  is_restricted: z.number().int().nullish(),
})

/** The `get_users` fields the lookup relies on. Other fields are stripped. */
export type TautulliUserRow = z.infer<typeof tautulliUserRowSchema>

/**
 * `get_users` at most once per server render for one Tautulli. The home page
 * checks Rewind eligibility and reads the first-watch date, and both find the
 * member through {@link findTautulliUser} (P0.17). The URL and API key are the
 * key, as strings, because `cache` compares object arguments by identity.
 * Outside a React render it calls straight through. The call has
 * `serviceFetch`'s default 10-second budget per attempt: the home page and
 * `requestRewindGeneration` wait on it before a member's rate limit is checked.
 */
const getTautulliUsersOncePerRender = cache((url: string, apiKey: string) =>
  tautulliCommand({ url, apiKey }, "get_users", {}, z.array(z.unknown()))
)

/** On a miss, `candidates` is the size of Tautulli's user list, for count-only logging. */
export type FindTautulliUserResult =
  | { ok: true; user: TautulliUserRow }
  | { ok: false; code: "TAUTULLI_USER_NOT_FOUND"; candidates: number }
  | { ok: false; code: "TAUTULLI_ERROR" }

/**
 * Find a member in Tautulli's `get_users` rows by plex.tv account ID.
 *
 * Tautulli's `user_id` is the plex.tv account ID on every row, so
 * `user_id === plexUserId` is the only match. There is deliberately no
 * fallback on `username`, `email` or `friendly_name`: when no row carries the
 * member's own ID, any row a name matches belongs to a different plex.tv
 * account (a managed user titled "Kids", Tautulli's built-in "Local" user, or
 * a stale row after a rename), and matching it would hand that person's watch
 * history to the member.
 *
 * @returns The matching row, or `null` when none matches.
 *
 * @example
 * ```ts
 * const users = [{ user_id: 1, username: "alice" }, { user_id: 2, username: "Bob" }]
 * matchTautulliUser(users, { plexUserId: "2" })?.user_id // 2
 * matchTautulliUser(users, { plexUserId: "9" })          // null
 * ```
 */
export function matchTautulliUser<T extends TautulliUserRow>(
  users: readonly T[],
  identity: TautulliUserIdentity
): T | null {
  return users.find((u) => String(u.user_id) === identity.plexUserId) ?? null
}

/**
 * Fetch Tautulli's user list and find the member in it with
 * {@link matchTautulliUser}.
 *
 * The rows are validated with Zod, and only `user_id` and `username` survive
 * the parse, so no other member's email or name can leak through the result.
 * A miss is logged at debug with a candidate count, never the candidates: this
 * runs on every home-page render and Discord activity call, so callers that
 * treat a miss as a failure log it themselves.
 */
export async function findTautulliUser(
  config: TautulliEndpoint,
  identity: TautulliUserIdentity
): Promise<FindTautulliUserResult> {
  const result = await getTautulliUsersOncePerRender(config.url, config.apiKey)
  if (!result.ok) {
    logger.warn("Tautulli get_users request failed", { code: result.code, status: result.status })
    return { ok: false, code: "TAUTULLI_ERROR" }
  }

  const users = result.data.flatMap((row) => {
    const user = tautulliUserRowSchema.safeParse(row)
    return user.success ? [user.data] : []
  })

  const user = matchTautulliUser(users, identity)
  if (!user) {
    logger.debug("Tautulli user not found", { plexUserId: identity.plexUserId, candidates: users.length })
    return { ok: false, code: "TAUTULLI_USER_NOT_FOUND", candidates: users.length }
  }
  return { ok: true, user }
}
