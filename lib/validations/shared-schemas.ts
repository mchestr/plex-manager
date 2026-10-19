import { parseServerUrl } from "@/lib/utils"
import { z } from "zod"

/**
 * Schema for days parameter (time range queries)
 * Common for analytics and historical data endpoints
 */
export const daysSchema = z.number().int().min(1).max(365)

/**
 * Schema for limit parameter (top N queries)
 */
export const limitSchema = z.number().int().min(1).max(100)

/** The first and last years a Rewind can be generated or opened for. */
export const YEAR_MIN = 2010
export const YEAR_MAX = 2100

/**
 * Schema for year parameter
 * Restricts to reasonable year range (YEAR_MIN-YEAR_MAX)
 */
export const yearSchema = z.number().int().min(YEAR_MIN).max(YEAR_MAX)

/**
 * A year as a URL segment (`/wrapped/<year>`): four digits in the yearSchema
 * range, so `/wrapped/0x7EA` or `/wrapped/2026.0` is not a second URL for 2026.
 */
export const yearParamSchema = z.string().regex(/^\d{4}$/).pipe(z.coerce.number<string>().pipe(yearSchema))

/**
 * A Rewind share token as a URL segment: 43 base64url characters, the 32
 * random bytes `generateShareToken` encodes.
 */
export const shareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

/**
 * Schema for LLM usage ID validation
 * UUID format expected (cuid is the actual format used by Prisma)
 */
export const llmUsageIdSchema = z.string().min(1).max(100)

/**
 * Schema for user ID validation
 */
export const userIdSchema = z.string().min(1).max(100)

/**
 * Schema for validating and normalizing server URLs.
 * Uses parseServerUrl to validate the URL format and normalizes output.
 *
 * @param examplePort - Example port to show in error message (e.g., "32400" for Plex)
 * @returns Zod schema that validates and transforms server URLs
 */
export function createServerUrlSchema(examplePort?: string) {
  const portExample = examplePort ? `:${examplePort}` : ""

  return z.string()
    .min(1, "Server URL is required")
    .refine(
      (url) => {
        try {
          parseServerUrl(url)
          return true
        } catch {
          return false
        }
      },
      { message: `Invalid URL format. Expected format: http://example.com${portExample}` }
    )
    .transform((url) => {
      const parsed = parseServerUrl(url)
      const defaultPort = parsed.protocol === "https" ? 443 : 80
      if (parsed.port === defaultPort) {
        return `${parsed.protocol}://${parsed.hostname}`
      }
      return `${parsed.protocol}://${parsed.hostname}:${parsed.port}`
    })
}

/**
 * Schema for validating optional public URLs.
 * Used for external access URLs that may be different from internal server URLs.
 *
 * @param exampleDomain - Example domain to show in error message (e.g., "plex.example.com")
 * @returns Zod schema that validates optional public URLs
 */
export function createPublicUrlSchema(exampleDomain?: string) {
  const domainExample = exampleDomain ? exampleDomain : "example.com"

  return z.string()
    .optional()
    .refine(
      (url) => {
        if (!url) return true
        try {
          new URL(url)
          return true
        } catch {
          return false
        }
      },
      { message: `Invalid URL format. Expected format: https://${domainExample}` }
    )
}
