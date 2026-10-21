/**
 * The admin search contract (P10.16, UI-41): the query `GET
 * /api/admin/search` accepts and the response it returns. Client-safe, so the
 * route validates its query and the command menu validates the response with
 * the same schemas. P10.1's invite lookup reuses the result shape.
 *
 * @module lib/admin/search
 */

import { z } from "zod"

const ADMIN_SEARCH_KINDS = ["users", "invites"] as const

export type AdminSearchKind = (typeof ADMIN_SEARCH_KINDS)[number]

/** The longest query the route accepts. */
export const ADMIN_SEARCH_MAX = 64

export const adminSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(ADMIN_SEARCH_MAX),
  kind: z.enum(ADMIN_SEARCH_KINDS),
})

const adminSearchResultSchema = z.object({
  id: z.string(),
  label: z.string(),
  sub: z.string(),
  href: z.string().startsWith("/admin/"),
})

export type AdminSearchResult = z.infer<typeof adminSearchResultSchema>

export const adminSearchResponseSchema = z.object({ results: z.array(adminSearchResultSchema) })

export type AdminSearchResponse = z.infer<typeof adminSearchResponseSchema>

export function adminSearchUrl(kind: AdminSearchKind, q: string): string {
  return `/api/admin/search?${new URLSearchParams({ kind, q }).toString()}`
}
