import "server-only"

import { XMLParser } from "fast-xml-parser"
import { z } from "zod"

import { fetchWithTimeout, isTimeoutError } from "@/lib/utils/fetch-with-timeout"

import { getClientIdentifier, logger } from "./plex-core"

/**
 * The one reader of plex.tv's `/api/users` (GAP-06): the server owner's
 * friends, Home members and managed users, each with their per-server shares.
 *
 * ## Shape
 *
 * ```
 * <MediaContainer>
 *   <User id username title email home restricted>   one per friend or Home user
 *     <Server id machineIdentifier owned pending/>   one per shared server
 *   </User>
 * </MediaContainer>
 * ```
 *
 * fast-xml-parser's output is validated with Zod. A managed user has
 * `username=""`, so the name falls back to `title` with `||`.
 *
 * ## Failures (Plex's auth guide)
 *
 * Only a 401 says the token is invalid (`invalid_token`). A 429 (with its
 * `Retry-After`), any other status, a timeout, a network error or a body that
 * does not parse is `unavailable`: an error state, never a verdict.
 *
 * The endpoint has no paging, so one call reads every user.
 *
 * @module lib/connections/plex-tv-users
 */

const PLEX_TV_USERS_URL = "https://clients.plex.tv/api/users"
const TIMEOUT_MS = 15_000

export interface PlexTvShare {
  machineIdentifier: string
  /** The `<Server id>` of this share: the id plex.tv's `shared_servers` route deletes. */
  shareId?: string
  owned: boolean
  /** An invite the user has not accepted yet; it grants no access. */
  pending: boolean
}

export interface PlexTvUser {
  id: string
  /** `username`, or `title` when Plex sends an empty username (managed users). */
  username: string
  title: string
  email?: string
  thumb?: string
  home: boolean
  restricted: boolean
  servers: PlexTvShare[]
}

type PlexTvUsersFailure =
  | { ok: false; kind: "invalid_token"; status: 401 }
  | {
      ok: false
      kind: "unavailable"
      reason: "rate_limited" | "http" | "timeout" | "network" | "parse" | "not_configured"
      status?: number
      retryAfterSec?: number
    }

export type PlexTvUsersResult = { ok: true; users: PlexTvUser[] } | PlexTvUsersFailure

const flag = z
  .union([z.string(), z.number(), z.boolean()])
  .optional()
  .transform((value) => value === "1" || value === 1 || value === true || value === "true")

const text = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => (value === undefined ? "" : String(value)))

/** fast-xml-parser gives one child as an object and several as an array. */
const oneOrMany = <T extends z.ZodTypeAny>(item: T) =>
  z
    .union([z.array(item), item])
    .optional()
    .transform((value): z.output<T>[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]))

const shareSchema = z.looseObject({
  "@_id": text,
  "@_machineIdentifier": text,
  "@_owned": flag,
  "@_pending": flag,
})

const userSchema = z.looseObject({
  "@_id": z.union([z.string().min(1), z.number()]).transform(String),
  "@_username": text,
  "@_title": text,
  "@_email": text,
  "@_thumb": text,
  "@_home": flag,
  "@_restricted": flag,
  Server: oneOrMany(shareSchema),
})

const responseSchema = z.object({
  MediaContainer: z.union([z.looseObject({ User: oneOrMany(userSchema) }), z.literal("")]),
})

/**
 * Parse an `/api/users` body. Returns null when it is not the expected XML;
 * a user without a usable name is skipped.
 *
 * @internal
 */
export function parsePlexTvUsers(xml: string): PlexTvUser[] | null {
  let raw: unknown
  try {
    raw = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" }).parse(xml)
  } catch {
    return null
  }
  const parsed = responseSchema.safeParse(raw)
  if (!parsed.success) {
    logger.warn("plex.tv users response did not match the expected shape", {
      issues: parsed.error.issues.slice(0, 10).map((issue) => issue.path.join(".") || "(root)"),
    })
    return null
  }
  const container = parsed.data.MediaContainer
  if (container === "") return []

  const users: PlexTvUser[] = []
  for (const user of container.User) {
    const username = user["@_username"] || user["@_title"]
    if (!username) continue
    users.push({
      id: user["@_id"],
      username,
      title: user["@_title"] || username,
      email: user["@_email"] || undefined,
      thumb: user["@_thumb"] || undefined,
      home: user["@_home"],
      restricted: user["@_restricted"],
      servers: user.Server.filter((share) => share["@_machineIdentifier"]).map((share) => ({
        machineIdentifier: share["@_machineIdentifier"],
        ...(share["@_id"] ? { shareId: share["@_id"] } : {}),
        owned: share["@_owned"],
        pending: share["@_pending"],
      })),
    })
  }
  return users
}

/** Seconds from a `Retry-After` header (delta-seconds or an HTTP date). @internal */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds)
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - now) / 1000))
}

/** One GET of `/api/users` with the server owner's token. Never throws. */
export async function fetchPlexTvUsers(token: string): Promise<PlexTvUsersResult> {
  let clientIdentifier: string
  try {
    clientIdentifier = getClientIdentifier()
  } catch {
    logger.error("PLEX_CLIENT_IDENTIFIER is not configured")
    return { ok: false, kind: "unavailable", reason: "not_configured" }
  }

  let response: Response
  try {
    response = await fetchWithTimeout(PLEX_TV_USERS_URL, {
      method: "GET",
      headers: {
        Accept: "application/xml",
        "X-Plex-Token": token,
        "X-Plex-Client-Identifier": clientIdentifier,
      },
      timeoutMs: TIMEOUT_MS,
      timeoutCoversBody: true,
    })
  } catch (error) {
    const reason = isTimeoutError(error) ? "timeout" : "network"
    logger.warn("plex.tv users request failed", { reason })
    return { ok: false, kind: "unavailable", reason }
  }

  if (response.status === 401) {
    await response.body?.cancel().catch(() => undefined)
    return { ok: false, kind: "invalid_token", status: 401 }
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    const status = response.status
    if (status === 429) {
      const retryAfterSec = parseRetryAfter(response.headers.get("retry-after"))
      logger.warn("plex.tv users request rate limited", { status, retryAfterSec })
      return retryAfterSec === undefined
        ? { ok: false, kind: "unavailable", reason: "rate_limited", status }
        : { ok: false, kind: "unavailable", reason: "rate_limited", status, retryAfterSec }
    }
    logger.warn("plex.tv users request failed", { status })
    return { ok: false, kind: "unavailable", reason: "http", status }
  }

  let body: string
  try {
    body = await response.text()
  } catch (error) {
    return { ok: false, kind: "unavailable", reason: isTimeoutError(error) ? "timeout" : "network" }
  }
  const users = parsePlexTvUsers(body)
  return users ? { ok: true, users } : { ok: false, kind: "unavailable", reason: "parse" }
}

/** A user's live share of this server: present and accepted. */
export function activeShareFor(user: PlexTvUser, machineIdentifier: string): PlexTvShare | undefined {
  return user.servers.find((share) => share.machineIdentifier === machineIdentifier && !share.pending)
}
