import { z } from "zod";

import { testServiceConnection } from "@/lib/connections/connection-test";
import { serviceErrorMessage, serviceFetch, toConnectionResult, type ServiceResult } from "@/lib/connections/http";
import { type OverseerrParsed } from "@/lib/validations/overseerr";
import { createLogger } from "@/lib/utils/logger";
import { type ConnectionResult } from "@/types/connection";

const logger = createLogger("overseerr");

type OverseerrEndpoint = Pick<OverseerrParsed, "url" | "apiKey">

/** One Overseerr API call through `serviceFetch`, authenticated with `X-Api-Key`. */
function overseerrFetch<T>(
  config: OverseerrEndpoint,
  path: string,
  schema: z.ZodType<T>,
  init: { method?: "GET" | "POST"; body?: string } = {}
): Promise<ServiceResult<T>> {
  return serviceFetch({
    service: "Overseerr",
    url: `${config.url}/api/v1${path}`,
    method: init.method,
    body: init.body,
    headers: {
      "X-Api-Key": config.apiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    schema,
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
      requests: z.array(z.looseObject({ id: z.number() })).optional(),
    })
    .nullish(),
})

/**
 * Media status from Overseerr by TMDB ID. `data` is undefined when Overseerr
 * does not know the title (HTTP 404), which is normal for new titles.
 */
async function getOverseerrMediaByTmdbId(
  config: OverseerrEndpoint,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<{ success: boolean; data?: { status: number; requestId?: number } }> {
  const result = await overseerrFetch(config, `/${mediaType}/${tmdbId}`, mediaDetailsSchema)
  if (!result.ok) return { success: result.code === "HTTP" && result.status === 404 }
  return {
    success: true,
    data: {
      status: result.data.mediaInfo?.status ?? OverseerrMediaStatus.UNKNOWN,
      requestId: result.data.mediaInfo?.requests?.[0]?.id,
    },
  }
}

export interface SubmitOverseerrRequestPayload {
  mediaType: "movie" | "tv"
  mediaId: number // TMDB ID
  seasons?: number[] // For TV shows, which seasons to request
  is4k?: boolean
}

export interface SubmitOverseerrRequestResult {
  success: boolean
  requestId?: number
  error?: string
  status: "created" | "already_requested" | "already_available" | "failed"
}

/**
 * Submit a media request to Overseerr
 * @param config Overseerr configuration
 * @param payload Request details (mediaType, mediaId, optional seasons)
 */
export async function submitOverseerrRequest(
  config: OverseerrEndpoint,
  payload: SubmitOverseerrRequestPayload
): Promise<SubmitOverseerrRequestResult> {
  // First check if media already exists/is requested
  const existingStatus = await getOverseerrMediaByTmdbId(config, payload.mediaId, payload.mediaType)

  if (existingStatus.success && existingStatus.data) {
    const status = existingStatus.data.status

    if (status === OverseerrMediaStatus.AVAILABLE || status === OverseerrMediaStatus.PARTIALLY_AVAILABLE) {
      logger.debug("Media already available in Overseerr", {
        tmdbId: payload.mediaId,
        mediaType: payload.mediaType,
        status,
      })
      return { success: true, status: "already_available" }
    }

    if (status === OverseerrMediaStatus.PENDING || status === OverseerrMediaStatus.PROCESSING) {
      logger.debug("Media already requested in Overseerr", {
        tmdbId: payload.mediaId,
        mediaType: payload.mediaType,
        status,
      })
      return { success: true, requestId: existingStatus.data.requestId, status: "already_requested" }
    }
  }

  const body: Record<string, unknown> = {
    mediaType: payload.mediaType,
    mediaId: payload.mediaId,
  }
  if (payload.seasons && payload.seasons.length > 0) body.seasons = payload.seasons
  if (payload.is4k !== undefined) body.is4k = payload.is4k

  const result = await overseerrFetch(config, "/request", z.looseObject({ id: z.number() }), {
    method: "POST",
    body: JSON.stringify(body),
  })

  if (!result.ok) {
    // Overseerr answers 409 when the title already has a request
    if (result.code === "HTTP" && result.status === 409) {
      return { success: true, status: "already_requested" }
    }
    logger.error("Overseerr request submission failed", undefined, {
      code: result.code,
      status: result.status,
      tmdbId: payload.mediaId,
      mediaType: payload.mediaType,
    })
    return { success: false, error: serviceErrorMessage("Overseerr", result), status: "failed" }
  }

  logger.info("Overseerr request submitted successfully", {
    requestId: String(result.data.id),
    tmdbId: payload.mediaId,
    mediaType: payload.mediaType,
  })

  return { success: true, requestId: result.data.id, status: "created" }
}
