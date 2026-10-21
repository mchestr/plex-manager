import { z } from "zod"

import { createPublicUrlSchema, createServerUrlSchema } from "./shared-schemas"

export const tautulliSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  url: createServerUrlSchema("8181"),
  apiKey: z.string().min(1, "API key is required"),
  publicUrl: createPublicUrlSchema("tautulli.example.com"),
})

export type TautulliInput = z.input<typeof tautulliSchema>
export type TautulliParsed = z.output<typeof tautulliSchema>

/**
 * Tautulli API response schemas: the envelope and the rows the v2 Rewind
 * reads. They are lenient on purpose (`looseObject`, and optional fields that
 * fall back to `undefined` on a bad value), so a Tautulli upgrade cannot crash
 * the v2 pipeline; P2.4 owns the strict v3 history row.
 *
 * Based on https://docs.tautulli.com/extending-tautulli/api-reference
 */

const optionalNumber = z.number().nullish().catch(undefined)
const optionalString = z.string().nullish().catch(undefined)
const numberOrString = z.union([z.number(), z.string()]).nullish().catch(undefined)

/** Every Tautulli v2 response: `{ response: { result, message, data } }`. */
export const tautulliEnvelopeSchema = z.looseObject({
  response: z.looseObject({
    result: z.string(),
    message: z.string().nullish(),
    data: z.unknown().optional(),
  }),
})

/** One `get_history` row, as the v2 statistics read it. */
export const tautulliHistoryItemSchema = z.looseObject({
  /** Unix seconds when the play happened. */
  date: z.number(),
  /** Unix seconds when playback started. */
  started: optionalNumber,
  /** Seconds. */
  duration: optionalNumber,
  /** Not a real Tautulli field; v2 still falls back on it until P5.9. */
  viewed_duration: optionalNumber,
  /** `movie`, `episode`, `track`, ... */
  media_type: z.string(),
  title: optionalString,
  grandparent_title: optionalString,
  year: optionalNumber,
  original_year: optionalNumber,
  rating: optionalNumber,
  user_rating: optionalNumber,
  rating_key: numberOrString,
  parent_rating_key: numberOrString,
  grandparent_rating_key: numberOrString,
  user_id: optionalNumber,
  user: optionalString,
})
export type TautulliHistoryItem = z.infer<typeof tautulliHistoryItemSchema>

/** `get_history` data: a page object, or a bare array on some builds. */
export const tautulliHistoryPageSchema = z.union([
  z.array(z.unknown()),
  z.looseObject({
    recordsTotal: optionalNumber,
    recordsFiltered: optionalNumber,
    data: z.array(z.unknown()),
  }),
])
