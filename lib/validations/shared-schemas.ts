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
 * True when a parsed URL uses `http:` or `https:` (SEC-57). Every other
 * scheme, including `javascript:`, `data:` and `ftp:`, is refused. `safeHref`
 * in `lib/ui/markdown.ts` and the public URL schema share this one check.
 *
 * @example
 * ```ts
 * isHttpUrl(new URL("https://example.com")) // true
 * isHttpUrl(new URL("javascript:alert(1)")) // false
 * ```
 */
export function isHttpUrl(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:"
}

/**
 * Parse an admin-entered API base URL: http or https only, with no
 * credentials, query or fragment. Returns origin + path without a trailing
 * slash, or null when the URL is not allowed.
 */
export function normalizeBaseUrl(value: string): string | null {
  const trimmed = value.trim()
  // URL() drops an empty "?" or "#", so check the raw text too
  if (trimmed.includes("?") || trimmed.includes("#")) return null
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
  if (parsed.username || parsed.password) return null
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`
}

/**
 * Schema for an API base URL such as an OpenAI-compatible server's
 * `http://localhost:11434/v1`. Unlike {@link createServerUrlSchema} it keeps
 * the path, because the API lives under it.
 *
 * @example
 * ```ts
 * createBaseUrlSchema().parse("http://localhost:11434/v1/") // "http://localhost:11434/v1"
 * createBaseUrlSchema().safeParse("http://user:pass@host/v1").success // false
 * ```
 */
export function createBaseUrlSchema() {
  return z
    .string()
    .trim()
    .min(1, "Base URL is required")
    .max(2048, "Base URL is too long")
    .refine((url) => normalizeBaseUrl(url) !== null, {
      message: "Enter an http or https URL with no credentials, query or fragment, e.g. http://localhost:11434/v1",
    })
    .transform((url) => normalizeBaseUrl(url) ?? url)
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
      (url) => !url || (URL.canParse(url) && isHttpUrl(new URL(url))),
      { message: `Invalid URL format. Expected format: https://${domainExample}` }
    )
}
