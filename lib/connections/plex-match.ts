/**
 * The Plex calls Fix the Plex match makes with the owner token
 * (docs/problem-reports.md, "Fix the Plex match"):
 *
 * - {@link getPlexSectionAgent}: a library section's agent and language
 *   (`GET /library/sections`), which a match search needs;
 * - {@link searchPlexMatches}: the titles the agent finds for a search
 *   (`GET /library/metadata/<ratingKey>/matches?manual=1`);
 * - {@link matchPlexItem}: match the item to one of them
 *   (`PUT /library/metadata/<ratingKey>/match?guid=&name=`). Plex answers at
 *   once and matches in the background, and matching to a guid another item
 *   in the section has merges the two items, so callers check that first.
 *
 * Plex can match only movies and shows. Each call answers `null` or `false`
 * when Plex can't be read, and never throws.
 *
 * @module lib/connections/plex-match
 */

import "server-only"

import { z } from "zod"

import { serviceFetch } from "@/lib/connections/http"
import { ratingKeySchema } from "@/lib/validations/params"

type PlexServer = { url: string; token: string }

const READ_TIMEOUT_MS = 5000
/** The agent asks its own sources, which can be slow. */
const SEARCH_TIMEOUT_MS = 30_000

const sectionsSchema = z.looseObject({
  MediaContainer: z.looseObject({
    Directory: z
      .array(z.looseObject({ key: z.union([z.string(), z.number()]).transform(String), agent: z.string().optional().catch(undefined), language: z.string().optional().catch(undefined) }))
      .optional()
      .catch(undefined),
  }),
})

const searchResultSchema = z.looseObject({
  guid: z.string().min(1),
  name: z.string(),
  year: z.number().int().optional().catch(undefined),
  score: z.number().optional().catch(undefined),
})

const matchesSchema = z.looseObject({ MediaContainer: z.looseObject({ SearchResult: z.array(z.unknown()).optional().catch(undefined) }) })

/** A title an agent found, as Plex matches an item to it. */
export type PlexMatchResult = z.infer<typeof searchResultSchema>

/** The agent and language of a library section; null when Plex can't be read or has no such section. */
export async function getPlexSectionAgent(server: PlexServer, sectionId: string): Promise<{ agent: string; language: string } | null> {
  const result = await serviceFetch({ service: "Plex", url: `${server.url}/library/sections`, headers: { "X-Plex-Token": server.token }, schema: sectionsSchema, timeoutMs: READ_TIMEOUT_MS })
  if (!result.ok) return null
  const section = (result.data.MediaContainer.Directory ?? []).find((directory) => directory.key === sectionId)
  return section?.agent && section.language ? { agent: section.agent, language: section.language } : null
}

/** The titles the section's agent finds for `title` (and `year`), best first as Plex orders them; null when Plex can't be read. */
export async function searchPlexMatches(
  server: PlexServer,
  ratingKey: string,
  search: { title: string; year?: number | null; agent: string; language: string }
): Promise<PlexMatchResult[] | null> {
  if (!ratingKeySchema.safeParse(ratingKey).success) return null
  const params = new URLSearchParams({ manual: "1", title: search.title, agent: search.agent, language: search.language })
  if (search.year) params.set("year", String(search.year))
  const result = await serviceFetch({
    service: "Plex",
    url: `${server.url}/library/metadata/${encodeURIComponent(ratingKey)}/matches?${params}`,
    headers: { "X-Plex-Token": server.token },
    schema: matchesSchema,
    timeoutMs: SEARCH_TIMEOUT_MS,
  })
  if (!result.ok) return null
  return (result.data.MediaContainer.SearchResult ?? []).flatMap((entry) => {
    const parsed = searchResultSchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

/** Matches the item to `match`; true once Plex took the request, which it carries out in the background. */
export async function matchPlexItem(server: PlexServer, ratingKey: string, match: { guid: string; name: string }): Promise<boolean> {
  if (!ratingKeySchema.safeParse(ratingKey).success || !match.guid) return false
  const params = new URLSearchParams({ guid: match.guid, name: match.name })
  const result = await serviceFetch({
    service: "Plex",
    url: `${server.url}/library/metadata/${encodeURIComponent(ratingKey)}/match?${params}`,
    method: "PUT",
    headers: { "X-Plex-Token": server.token },
    schema: z.string(),
    responseType: "text",
    timeoutMs: READ_TIMEOUT_MS,
  })
  return result.ok
}
