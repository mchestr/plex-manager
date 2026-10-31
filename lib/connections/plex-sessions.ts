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
 * @param headers - Extra headers, such as the container paging ones.
 * @internal
 */
async function plexGet(serverConfig: PlexServerConfig, path: string, headers: Record<string, string> = {}): Promise<PlexResult> {
  const result = await serviceFetch({
    service: "Plex",
    url: `${serverConfig.url}${path}`,
    headers: { "X-Plex-Token": serverConfig.token, ...headers },
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

/** The page size for PMS listings that page with the container headers. */
export const PLEX_PAGE_SIZE = 50

/** `X-Plex-Container-Start` and `X-Plex-Container-Size`, the PMS's paging (GAP-10). */
export function containerPage(size: number, start = 0): Record<string, string> {
  return { "X-Plex-Container-Start": String(start), "X-Plex-Container-Size": String(size) }
}

/**
 * Get recently added content from Plex server, `limit` items from the
 * `start`th newest (0 is the newest), paged with the container headers (the
 * PMS ignores a `?limit=` parameter).
 */
export async function getPlexRecentlyAdded(serverConfig: PlexServerConfig, limit = 20, start = 0): Promise<PlexResult> {
  return plexGet(serverConfig, "/library/recentlyAdded", containerPage(limit, start))
}

/**
 * Get on deck content from Plex server, the first page of 50.
 */
export async function getPlexOnDeck(serverConfig: PlexServerConfig): Promise<PlexResult> {
  return plexGet(serverConfig, "/library/onDeck", containerPage(PLEX_PAGE_SIZE))
}

/** The `User` PMS reports on a session, and the older flat `user_id`. */
export interface PlexSessionUserRef {
  User?: { id?: string | number }
  user_id?: string | number
}

/**
 * Whether a PMS session belongs to a member (GAP-08). The PMS reports the
 * server owner's own streams as user `1`, so the owner (whose `plexUserId`
 * equals `PlexServer.adminPlexUserId`) also matches `User.id === "1"`;
 * everyone else matches by their plex.tv account id.
 */
export function matchesSessionUser(session: PlexSessionUserRef, member: { plexUserId: string; isOwner: boolean }): boolean {
  const ids = [session.User?.id, session.user_id].filter((id) => id !== undefined && id !== null).map(String)
  return ids.includes(member.plexUserId) || (member.isOwner && ids.includes("1"))
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
      ...containerPage(size),
    },
    schema: plexSectionPageSchema,
    timeoutMs,
  })
  if (!result.ok) return result
  const container = result.data.MediaContainer
  return { ok: true, data: { items: container.Metadata ?? [], totalSize: container.totalSize ?? null } }
}
