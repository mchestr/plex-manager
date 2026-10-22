/**
 * Plex session and library management functions
 */

import { z } from "zod"

import { serviceErrorMessage, serviceFetch, type ServiceResult } from "@/lib/connections/http"

type PlexServerConfig = { url: string; token: string }
type PlexResult = { success: boolean; data?: any; error?: string }

/**
 * Shared GET helper for Plex server endpoints: sends the token in the
 * `X-Plex-Token` header, asks for JSON, and goes through `serviceFetch`, so
 * errors never carry the token or the URL.
 *
 * @param serverConfig - Plex server URL + token.
 * @param path - Path beginning with `/`, query string already appended.
 * @internal
 */
async function plexGet(serverConfig: PlexServerConfig, path: string): Promise<PlexResult> {
  const result = await serviceFetch({
    service: "Plex",
    url: `${serverConfig.url}${path}`,
    headers: { "X-Plex-Token": serverConfig.token },
    schema: z.unknown(),
  })
  return result.ok ? { success: true, data: result.data } : { success: false, error: serviceErrorMessage("Plex", result) }
}

/**
 * Fetches current sessions from Plex server
 * Uses the Plex server API /status/sessions endpoint
 */
export async function getPlexSessions(serverConfig: PlexServerConfig): Promise<PlexResult> {
  return plexGet(serverConfig, "/status/sessions")
}

/**
 * Get library sections from Plex server
 */
export async function getPlexLibrarySections(serverConfig: PlexServerConfig): Promise<PlexResult> {
  return plexGet(serverConfig, "/library/sections")
}

/**
 * Get recently added content from Plex server
 */
export async function getPlexRecentlyAdded(serverConfig: PlexServerConfig, limit = 20): Promise<PlexResult> {
  return plexGet(serverConfig, `/library/recentlyAdded?limit=${limit}`)
}

/**
 * Get on deck content from Plex server
 */
export async function getPlexOnDeck(serverConfig: PlexServerConfig): Promise<PlexResult> {
  return plexGet(serverConfig, "/library/onDeck")
}

/** One title in a section listing; Plex sends many more fields. */
const plexSectionItemSchema = z.looseObject({
  ratingKey: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).transform(String),
  title: z.string(),
  year: z.number().int().optional(),
  addedAt: z.number(),
  /** Seasons, on a show. */
  childCount: z.number().int().optional(),
})

const plexSectionPageSchema = z.object({
  MediaContainer: z.looseObject({
    totalSize: z.number().int().nonnegative().optional(),
    Metadata: z.array(plexSectionItemSchema).optional(),
  }),
})

export type PlexSectionItem = z.infer<typeof plexSectionItemSchema>

export interface PlexSectionPage {
  items: PlexSectionItem[]
  /** Every match in the section, or null when the server does not say. */
  totalSize: number | null
}

export interface SectionRecentOptions {
  /** `movie` reads films (`type=1`), `show` reads series (`type=2`). */
  type: "movie" | "show"
  /** Page size, sent as `X-Plex-Container-Size`; 0 asks for the count only. */
  size: number
  /** Only titles added at or after this time (`addedAt>>=`). */
  addedSince?: Date
  timeoutMs?: number
}

/**
 * The newest titles of one library section, newest first:
 * `/library/sections/{id}/all?sort=addedAt:desc&type=1|2`, paged with the
 * `X-Plex-Container-Start` and `X-Plex-Container-Size` headers (P10.12).
 */
export async function getPlexSectionRecent(
  serverConfig: PlexServerConfig,
  sectionId: string,
  { type, size, addedSince, timeoutMs }: SectionRecentOptions
): Promise<ServiceResult<PlexSectionPage>> {
  const params = new URLSearchParams({ sort: "addedAt:desc", type: type === "movie" ? "1" : "2" })
  if (addedSince) params.set("addedAt>>", String(Math.floor(addedSince.getTime() / 1000)))
  const result = await serviceFetch({
    service: "Plex",
    url: `${serverConfig.url}/library/sections/${encodeURIComponent(sectionId)}/all?${params}`,
    headers: {
      "X-Plex-Token": serverConfig.token,
      "X-Plex-Container-Start": "0",
      "X-Plex-Container-Size": String(size),
    },
    schema: plexSectionPageSchema,
    timeoutMs,
  })
  if (!result.ok) return result
  const container = result.data.MediaContainer
  return { ok: true, data: { items: container.Metadata ?? [], totalSize: container.totalSize ?? null } }
}
