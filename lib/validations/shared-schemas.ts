import { parseServerUrl } from "@/lib/utils"
import { z } from "zod"

/**
 * Pagination schema for server actions
 * Used for listing endpoints that support pagination
 */
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
})

export type PaginationInput = z.infer<typeof paginationSchema>

/**
 * Schema for days parameter (time range queries)
 * Common for analytics and historical data endpoints
 */
export const daysSchema = z.number().int().min(1).max(365)

/**
 * Schema for limit parameter (top N queries)
 */
export const limitSchema = z.number().int().min(1).max(100)

/**
 * Schema for year parameter
 * Restricts to reasonable year range (2010-2100)
 */
export const yearSchema = z.number().int().min(2010).max(2100)

/**
 * Schema for API keys
 * Basic format validation - actual validity is tested by connection tests
 */
export const apiKeySchema = z.string().min(10).max(500)

/**
 * Schema for bulk operation IDs
 * Limits array size to prevent performance issues
 */
export const bulkIdsSchema = z.array(z.string().min(1)).min(1).max(1000)

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
