import { z } from "zod"

import { createPublicUrlSchema, createServerUrlSchema } from "./shared-schemas"

export const overseerrSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  url: createServerUrlSchema("5055"),
  apiKey: z.string().min(1, "API key is required"),
  publicUrl: createPublicUrlSchema("requests.example.com"),
})

export type OverseerrInput = z.input<typeof overseerrSchema>
export type OverseerrParsed = z.output<typeof overseerrSchema>


/**
 * Overseerr API response shapes used by the Rewind statistics.
 *
 * Enum values come from Overseerr's `server/constants/media.ts` (the same in
 * Jellyseerr and Seerr). The schemas are loose objects: they check the fields
 * we read and keep everything else.
 */

/**
 * `MediaRequest.status`: the state of one request. The schema accepts any
 * integer, so a status a later release adds does not fail the whole page; it
 * counts as neither pending nor approved.
 */
export enum MediaRequestStatus {
  PENDING = 1,
  APPROVED = 2,
  DECLINED = 3,
  FAILED = 4,
  COMPLETED = 5,
}

/**
 * `Media.status`: whether the requested title is on the server. Overseerr
 * also sends 6 (deleted); Seerr sends 6 (blocklisted) and 7 (deleted). Any
 * value other than the ones below counts as not available.
 */
export enum MediaStatus {
  UNKNOWN = 1,
  PENDING = 2,
  PROCESSING = 3,
  PARTIALLY_AVAILABLE = 4,
  AVAILABLE = 5,
}

/** One page of `GET /api/v1/user?take=&skip=`. */
export const overseerrUserPageSchema = z.looseObject({
  pageInfo: z.looseObject({
    pages: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    results: z.number().int().nonnegative(),
  }),
  results: z.array(
    z.looseObject({
      id: z.number().int(),
      email: z.string().nullish(),
      plexId: z.number().int().nullable().optional(),
    })
  ),
})

/** One page of `GET /api/v1/request?take=&skip=&sort=added&filter=all`. */
export const overseerrRequestPageSchema = z.looseObject({
  pageInfo: z.looseObject({
    pages: z.number().int().nonnegative(),
    page: z.number().int().positive(),
  }),
  results: z.array(
    z.looseObject({
      id: z.number().int(),
      status: z.number().int(),
      type: z.enum(["movie", "tv"]),
      is4k: z.boolean().optional(),
      createdAt: z.string(),
      requestedBy: z.looseObject({ id: z.number().int() }).nullable(),
      media: z.looseObject({
        status: z.number().int(),
        status4k: z.number().int().optional(),
        tmdbId: z.number().int().optional(),
      }),
    })
  ),
})

export type OverseerrRequest = z.infer<typeof overseerrRequestPageSchema>["results"][number]
