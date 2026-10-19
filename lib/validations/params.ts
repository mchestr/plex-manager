/**
 * Schemas for route parameters and search parameters, shared by the route
 * handlers through `lib/actions/route.ts`.
 *
 * @module lib/validations/params
 */

import { z } from "zod"

import { yearSchema } from "@/lib/validations/shared-schemas"

/**
 * A Rewind share token as a URL segment: 43 base64url characters, the 32
 * random bytes `generateShareToken` encodes.
 */
export const shareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid share token")

/** A Plex rating key: digits only, so `../1` never reaches a Plex URL. */
export const ratingKeySchema = z.string().regex(/^\d{1,12}$/, "Invalid rating key")

/**
 * A year as a URL segment or query value: four digits in the yearSchema range,
 * so `abc`, `0x7EA` or `2026.0` is not a second spelling of 2026.
 */
export const yearParamSchema = z
  .string()
  .regex(/^\d{4}$/, "Invalid year")
  .pipe(z.coerce.number<string>().pipe(yearSchema))

/**
 * A row id as a URL segment: what Prisma's `cuid()` makes, and the readable
 * ids seeds and fixtures use, but never `/`, `.` or anything a URL decodes.
 */
export const recordIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid id")
