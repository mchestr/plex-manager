import { z } from "zod";

import { testServiceConnection } from "@/lib/connections/connection-test";
import {
  invalidResponse,
  serviceErrorMessage,
  serviceFetch,
  toConnectionResult,
  type ServiceErrorCode,
  type ServiceFetchOptions,
  type ServiceResult,
} from "@/lib/connections/http";
import { type OverseerrParsed } from "@/lib/validations/overseerr";
import { createLogger } from "@/lib/utils/logger";
import { type ConnectionResult } from "@/types/connection";

const logger = createLogger("overseerr");

type OverseerrEndpoint = Pick<OverseerrParsed, "url" | "apiKey">

/**
 * One Overseerr API call through `serviceFetch`, authenticated with `X-Api-Key`.
 * `asUser` adds `X-Api-User`, so Overseerr acts as that user: their
 * permissions, auto-approve rules and quotas apply, and they are the requester.
 */
function overseerrFetch<T>(
  config: OverseerrEndpoint,
  path: string,
  schema: z.ZodType<T>,
  init: Pick<ServiceFetchOptions<T>, "body" | "signal" | "onResponse" | "readErrorMessage"> & {
    method?: "GET" | "POST"
    asUser?: number
  } = {}
): Promise<ServiceResult<T>> {
  return serviceFetch({
    service: "Overseerr",
    url: `${config.url.replace(/\/+$/, "")}/api/v1${path}`,
    method: init.method,
    body: init.body,
    headers: {
      "X-Api-Key": config.apiKey,
      ...(init.asUser === undefined ? {} : { "X-Api-User": String(init.asUser) }),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    schema,
    signal: init.signal,
    onResponse: init.onResponse,
    readErrorMessage: init.readErrorMessage,
  })
}

/** The raw JSON of a GET, for the chatbot tools. */
async function overseerrGet(config: OverseerrEndpoint, path: string): Promise<ConnectionResult<unknown>> {
  return toConnectionResult("Overseerr", await overseerrFetch(config, path, z.unknown()))
}

/** `/auth/me` answers 200 with a `statusCode` body on some proxy errors. */
const authMeSchema = z
  .looseObject({ statusCode: z.number().optional() })
  .refine((body) => body.statusCode === undefined || body.statusCode < 400)

export async function testOverseerrConnection(config: OverseerrEndpoint): Promise<{ success: boolean; error?: string }> {
  return testServiceConnection("Overseerr", () => overseerrFetch(config, "/auth/me", authMeSchema))
}

export async function getOverseerrRequests(config: OverseerrEndpoint, limit = 10): Promise<ConnectionResult<unknown>> {
  return overseerrGet(config, `/request?take=${limit}&sort=added&filter=processing`)
}

export async function getOverseerrStatus(config: OverseerrEndpoint): Promise<ConnectionResult<unknown>> {
  return overseerrGet(config, "/settings/about")
}

export async function getOverseerrDiscoverMovies(
  config: OverseerrEndpoint,
  page = 1,
  sortBy = "popularity.desc"
): Promise<ConnectionResult<unknown>> {
  // sortBy originates from LLM tool-call args; encode it so reserved characters
  // cannot inject additional query parameters into the outbound request.
  return overseerrGet(config, `/discover/movies?page=${page}&sortBy=${encodeURIComponent(sortBy)}`)
}

export async function getOverseerrDiscoverTV(
  config: OverseerrEndpoint,
  page = 1,
  sortBy = "popularity.desc"
): Promise<ConnectionResult<unknown>> {
  // See getOverseerrDiscoverMovies: encode caller-supplied sortBy.
  return overseerrGet(config, `/discover/tv?page=${page}&sortBy=${encodeURIComponent(sortBy)}`)
}

export async function getOverseerrMediaDetails(
  config: OverseerrEndpoint,
  mediaId: number,
  mediaType: "movie" | "tv"
): Promise<ConnectionResult<unknown>> {
  return overseerrGet(config, `/${mediaType}/${mediaId}`)
}

export async function getOverseerrUsers(config: OverseerrEndpoint): Promise<ConnectionResult<unknown>> {
  return overseerrGet(config, "/user")
}

export async function getAllOverseerrRequests(
  config: OverseerrEndpoint,
  limit = 20,
  sortBy = "added"
): Promise<ConnectionResult<unknown>> {
  return overseerrGet(config, `/request?take=${limit}&sort=${encodeURIComponent(sortBy)}`)
}

const USER_PAGE_SIZE = 100
const MAX_USER_PAGES = 50
const USER_INDEX_TTL_MS = 10 * 60 * 1000

/** One page of `/user?take=&skip=`: ids and Plex ids only, so no email is kept. */
const userPageSchema = z.object({
  pageInfo: z.looseObject({ page: z.number(), pages: z.number() }),
  results: z.array(z.object({ id: z.number().int(), plexId: z.number().int().nullish() })),
})

/** Overseerr user id by the numeric Plex account id (`plexId`). */
export type OverseerrUserIndex = ReadonlyMap<number, number>

const userIndexCache = new Map<string, { index: OverseerrUserIndex; expiresAt: number }>()

/**
 * Every Overseerr user with a Plex account, as a map from the numeric
 * `plexId` to the Overseerr user id. Pages `/user?take=100&skip=n`, at most 50
 * pages; hitting the cap is `PAGE_LIMIT`, never a partial index, so a member
 * past the cap is not reported as unmatched. A built index is cached in
 * process for 10 minutes per server, so a batch builds it once.
 */
export async function buildOverseerrUserIndex(
  config: OverseerrEndpoint,
  { signal }: { signal?: AbortSignal } = {}
): Promise<ServiceResult<OverseerrUserIndex, ServiceErrorCode | "PAGE_LIMIT">> {
  const cacheKey = `${config.url}\n${config.apiKey}`
  const cached = userIndexCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return { ok: true, data: cached.index }

  const index = new Map<number, number>()
  for (let page = 0; page < MAX_USER_PAGES; page++) {
    const path = `/user?take=${USER_PAGE_SIZE}&skip=${page * USER_PAGE_SIZE}`
    const result = await overseerrFetch(config, path, userPageSchema, { signal })
    if (!result.ok) return result
    for (const user of result.data.results) {
      if (user.plexId != null) index.set(user.plexId, user.id)
    }
    if (result.data.results.length === 0 || result.data.pageInfo.page >= result.data.pageInfo.pages) {
      userIndexCache.set(cacheKey, { index, expiresAt: Date.now() + USER_INDEX_TTL_MS })
      return { ok: true, data: index }
    }
  }
  return { ok: false, code: "PAGE_LIMIT" }
}

/** The Overseerr user id for a member's `plexUserId` (a string of digits), or `null`. */
export function findOverseerrUserId(index: OverseerrUserIndex, plexUserId: string): number | null {
  const plexId = Number(plexUserId)
  if (!/^\d+$/.test(plexUserId) || !Number.isSafeInteger(plexId)) return null
  return index.get(plexId) ?? null
}

/** Forget every cached index. @internal */
export function clearOverseerrUserIndexCache(): void {
  userIndexCache.clear()
}

// Overseerr media status codes
const OverseerrMediaStatus = {
  UNKNOWN: 1,
  PENDING: 2,
  PROCESSING: 3,
  PARTIALLY_AVAILABLE: 4,
  AVAILABLE: 5,
} as const

const mediaDetailsSchema = z.looseObject({
  mediaInfo: z
    .looseObject({
      status: z.number().optional(),
      status4k: z.number().optional(),
      requests: z.array(z.looseObject({ id: z.number() })).optional(),
    })
    .nullish(),
})

/**
 * Media status from Overseerr by TMDB ID, the 4K status when `is4k` is set.
 * `data` is undefined when Overseerr does not know the title (HTTP 404),
 * which is normal for new titles.
 */
async function getOverseerrMediaByTmdbId(
  config: OverseerrEndpoint,
  tmdbId: number,
  mediaType: "movie" | "tv",
  is4k: boolean
): Promise<{ success: boolean; data?: { status: number; requestId?: number } }> {
  const result = await overseerrFetch(config, `/${mediaType}/${tmdbId}`, mediaDetailsSchema)
  if (!result.ok) return { success: result.code === "HTTP" && result.status === 404 }
  const mediaInfo = result.data.mediaInfo
  return {
    success: true,
    data: {
      status: (is4k ? mediaInfo?.status4k : mediaInfo?.status) ?? OverseerrMediaStatus.UNKNOWN,
      requestId: mediaInfo?.requests?.[0]?.id,
    },
  }
}

export interface SubmitOverseerrRequestPayload {
  mediaType: "movie" | "tv"
  mediaId: number // TMDB ID
  /** TV only: the seasons to request; every season when left out. */
  seasons?: number[]
  is4k?: boolean
}

export interface SubmitOverseerrRequestResult {
  success: boolean
  requestId?: number
  error?: string
  status: "created" | "already_requested" | "already_available" | "not_permitted" | "failed"
}

/** The 201 body: a `MediaRequest`. */
const mediaRequestSchema = z.looseObject({ id: z.number().int().positive(), status: z.number().int().optional() })

const NOT_PERMITTED_FALLBACK = "Overseerr did not allow this request"

/**
 * Submit a media request to Overseerr as the member's own Overseerr user.
 *
 * The POST carries `X-Api-User: <overseerrUserId>` beside the API key, so
 * Overseerr applies that user's permissions, auto-approve rules and quotas and
 * lists them as the requester. The user id is required: there is no fallback
 * to the API key's admin (SEC-27).
 *
 * ## Body
 *
 * A TV request always carries `seasons`, `"all"` unless a list is given:
 * without it Overseerr throws a TypeError and answers 500 (GAP-03).
 *
 * ## Replies (`server/routes/request.ts`)
 *
 * | Reply | Result |
 * |---|---|
 * | 201 with a `MediaRequest` | `created`, with its id |
 * | 202 (no seasons left to request) | `already_requested`, no id |
 * | 409 (duplicate) | `already_requested` |
 * | 403 (quota or permission) | `not_permitted`, Overseerr's message cut to 200 characters |
 * | 5xx, anything else | `failed` |
 *
 * The status pre-check reads `mediaInfo.status4k` when `is4k` is set.
 *
 * @param config Overseerr configuration
 * @param payload Request details (mediaType, mediaId, optional seasons)
 * @param requester The member's Overseerr user id (see {@link buildOverseerrUserIndex})
 */
export async function submitOverseerrRequest(
  config: OverseerrEndpoint,
  payload: SubmitOverseerrRequestPayload,
  requester: { overseerrUserId: number }
): Promise<SubmitOverseerrRequestResult> {
  const is4k = payload.is4k ?? false
  const meta = { tmdbId: payload.mediaId, mediaType: payload.mediaType, is4k }
  const existingStatus = await getOverseerrMediaByTmdbId(config, payload.mediaId, payload.mediaType, is4k)

  if (existingStatus.success && existingStatus.data) {
    const status = existingStatus.data.status

    if (status === OverseerrMediaStatus.AVAILABLE || status === OverseerrMediaStatus.PARTIALLY_AVAILABLE) {
      logger.debug("Media already available in Overseerr", { ...meta, status })
      return { success: true, status: "already_available" }
    }

    if (status === OverseerrMediaStatus.PENDING || status === OverseerrMediaStatus.PROCESSING) {
      logger.debug("Media already requested in Overseerr", { ...meta, status })
      return { success: true, requestId: existingStatus.data.requestId, status: "already_requested" }
    }
  }

  const body: Record<string, unknown> = { mediaType: payload.mediaType, mediaId: payload.mediaId }
  if (payload.mediaType === "tv") {
    body.seasons = payload.seasons && payload.seasons.length > 0 ? payload.seasons : "all"
  }
  if (payload.is4k !== undefined) body.is4k = payload.is4k

  let replyStatus = 0
  const result = await overseerrFetch(config, "/request", z.unknown(), {
    method: "POST",
    body: JSON.stringify(body),
    asUser: requester.overseerrUserId,
    readErrorMessage: true,
    onResponse: ({ status }) => {
      replyStatus = status
    },
  })

  if (!result.ok) {
    if (result.code === "HTTP" && result.status === 409) return { success: true, status: "already_requested" }
    if (result.code === "HTTP" && result.status === 403) {
      logger.info("Overseerr refused the request", meta)
      return { success: false, status: "not_permitted", error: result.message ?? NOT_PERMITTED_FALLBACK }
    }
    logger.error("Overseerr request submission failed", undefined, { ...meta, code: result.code, status: result.status })
    return { success: false, error: serviceErrorMessage("Overseerr", result), status: "failed" }
  }

  // Overseerr's NoSeasonsAvailableError: every season is already requested
  if (replyStatus === 202) {
    logger.debug("Overseerr had no seasons left to request", meta)
    return { success: true, status: "already_requested" }
  }

  const created = mediaRequestSchema.safeParse(result.data)
  if (!created.success) {
    invalidResponse("Overseerr", created.error, { where: "/api/v1/request" })
    return { success: false, error: "Overseerr sent an unexpected response", status: "failed" }
  }

  logger.info("Overseerr request submitted successfully", { ...meta, requestId: String(created.data.id) })
  return { success: true, requestId: created.data.id, status: "created" }
}
