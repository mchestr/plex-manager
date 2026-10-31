import "server-only"

import { z } from "zod"

/**
 * The building blocks of the Overseerr tools' replies (`overseerr.ts`): status
 * codes as words, display names without emails, links without credentials,
 * and requests cut down to the fields an answer needs.
 *
 * A field Overseerr leaves out, sends as null or sends with another type
 * reads as absent rather than failing the whole reply.
 *
 * @module
 */

// `.optional()` so a missing key is allowed: Zod 4 rejects an absent key whose schema is not optional
export const optNumber = z
  .unknown()
  .transform((value) => (typeof value === "number" && Number.isFinite(value) ? value : undefined))
  .optional()
export const optString = z
  .unknown()
  .transform((value) => (typeof value === "string" && value !== "" ? value : undefined))
  .optional()
export const optBoolean = z
  .unknown()
  .transform((value) => (typeof value === "boolean" ? value : undefined))
  .optional()

/** `schema`, or `undefined` when the field is missing, null or of another shape. */
export function optObject<T extends z.ZodType>(schema: T) {
  return schema.optional().catch(undefined)
}

/** Overseerr's `MediaStatus` (`server/constants/media.ts`) from 1: a title's availability. */
const MEDIA_STATUS = ["unknown", "pending", "processing", "partially available", "available"]
/** Overseerr's `MediaRequestStatus` from 1. */
const REQUEST_STATUS = ["pending approval", "approved", "declined", "failed", "completed"]

function label(names: readonly string[], code: number | undefined): string | undefined {
  if (code === undefined) return undefined
  return names[code - 1] ?? `status ${code}`
}

export const mediaStatus = (code: number | undefined) => label(MEDIA_STATUS, code)
const requestStatus = (code: number | undefined) => label(REQUEST_STATUS, code)

/** `text` cut to `max` characters, ending in an ellipsis when cut. */
export function bounded(text: string, max: number): string
export function bounded(text: string | undefined, max: number): string | undefined
export function bounded(text: string | undefined, max: number): string | undefined {
  if (text === undefined || text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

/** The longest display name the model sees; members choose it, so it is untrusted text (SEC-42). */
const DISPLAY_NAME_MAX = 64
/** Overseerr's display name is the email of a user with no username (`User.setDisplayName`). */
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/

const userSchema = z.looseObject({ id: z.number(), displayName: optString })

/** A user's display name, bounded, or `user <id>` where Overseerr would show their email. */
export function displayName(user: z.infer<typeof userSchema>): string {
  const name = user.displayName?.trim()
  return !name || EMAIL.test(name) ? `user ${user.id}` : name.slice(0, DISPLAY_NAME_MAX)
}

/** A query parameter whose value is a credential. */
const SECRET_PARAM = /token|api[_-]?key|secret|passw|auth|signature/i

/** An http(s) link without userinfo or credential parameters; anything else is left out. */
export function safeLink(value: string | undefined): string | undefined {
  if (!value) return undefined
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
  const secrets = [...url.searchParams.keys()].filter((key) => SECRET_PARAM.test(key))
  if (!url.username && !url.password && secrets.length === 0) return value
  url.username = ""
  url.password = ""
  for (const key of secrets) url.searchParams.delete(key)
  return url.toString()
}

export const mediaSchema = z.looseObject({
  mediaType: optString,
  tmdbId: optNumber,
  tvdbId: optNumber,
  imdbId: optString,
  status: optNumber,
  status4k: optNumber,
  externalServiceId: optNumber,
  externalServiceId4k: optNumber,
  externalServiceSlug: optString,
  externalServiceSlug4k: optString,
})

/**
 * A title's availability in HD and 4K and, once Overseerr sent it to Sonarr
 * or Radarr, the `seriesId` or `movieId` the Sonarr and Radarr tools take and
 * its `titleSlug`.
 */
export function mediaAvailability(media: z.infer<typeof mediaSchema>, type: string | undefined) {
  const id = type === "tv" ? "seriesId" : type === "movie" ? "movieId" : "externalServiceId"
  return {
    status: mediaStatus(media.status),
    status4k: mediaStatus(media.status4k),
    [id]: media.externalServiceId,
    [`${id}4k`]: media.externalServiceId4k,
    titleSlug: media.externalServiceSlug ?? media.externalServiceSlug4k,
  }
}

export const requestSchema = z.looseObject({
  id: z.number(),
  status: optNumber,
  type: optString,
  is4k: optBoolean,
  isAutoRequest: optBoolean,
  createdAt: optString,
  updatedAt: optString,
  media: optObject(mediaSchema),
  seasons: z.array(z.looseObject({ seasonNumber: z.number(), status: optNumber })).catch([]),
  requestedBy: optObject(userSchema),
  modifiedBy: optObject(userSchema),
})

type OverseerrRequest = z.infer<typeof requestSchema>

/** Ascending season numbers as runs: `[1, 2, 3, 5]` is "1-3, 5". */
function runs(numbers: number[]): string {
  const parts: string[] = []
  for (let start = 0; start < numbers.length; ) {
    let end = start
    while (end + 1 < numbers.length && numbers[end + 1] === numbers[end] + 1) end++
    parts.push(end === start ? `${numbers[start]}` : `${numbers[start]}-${numbers[end]}`)
    start = end + 1
  }
  return parts.join(", ")
}

/** The requested seasons by their request status, as `{ "approved": "1-3, 5" }`; none for a movie. */
function seasonsByStatus(seasons: OverseerrRequest["seasons"]): Record<string, string> | undefined {
  if (seasons.length === 0) return undefined
  const grouped = new Map<string, Set<number>>()
  for (const season of [...seasons].sort((a, b) => a.seasonNumber - b.seasonNumber)) {
    const status = requestStatus(season.status) ?? "unknown"
    grouped.set(status, (grouped.get(status) ?? new Set()).add(season.seasonNumber))
  }
  return Object.fromEntries([...grouped].map(([status, numbers]) => [status, runs([...numbers])]))
}

/** A request in brief: what a title's details list under its requests. */
export function requestBrief(request: OverseerrRequest) {
  return {
    id: request.id,
    status: requestStatus(request.status),
    is4k: request.is4k ?? false,
    seasons: seasonsByStatus(request.seasons),
    requestedBy: request.requestedBy && displayName(request.requestedBy),
    createdAt: request.createdAt,
  }
}

/**
 * A request with what an answer needs: its status, the title's ids and
 * availability, the seasons asked for and who asked. No emails, and none of
 * the profile, folder or server settings it was sent with. Overseerr keeps no
 * title on a request; the details tool looks one up by `media.tmdbId`.
 */
export function projectRequest(request: OverseerrRequest) {
  const type = request.type ?? request.media?.mediaType
  return {
    id: request.id,
    type,
    status: requestStatus(request.status),
    is4k: request.is4k ?? false,
    ...(request.isAutoRequest ? { isAutoRequest: true } : {}),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    media: request.media && {
      tmdbId: request.media.tmdbId,
      tvdbId: request.media.tvdbId,
      imdbId: request.media.imdbId,
      ...mediaAvailability(request.media, type),
    },
    seasons: seasonsByStatus(request.seasons),
    requestedBy: request.requestedBy && displayName(request.requestedBy),
    modifiedBy: request.modifiedBy && displayName(request.modifiedBy),
  }
}
