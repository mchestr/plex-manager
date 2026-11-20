/**
 * What a member may see of Leaving soon (TS 13.1): which library sections
 * the server shares with them, and for a filtered share, which labels hide a
 * title. Server-only: it reads the plex.tv share list.
 *
 * {@link memberCleanupAccess} has three results:
 *
 * 1. `"all"`: the server owner (`adminPlexUserId`), or a share of every
 *    library with no filter.
 * 2. A map from section id to `null` (no filter: every title shows) or the
 *    set of labels that hide a title (a `label!=A,B` filter, parsed by
 *    `parseLabelFilter`). A section with any other filter form is left out,
 *    so it is hidden, as the poster route hides every filtered section.
 * 3. `null`: plex.tv did not answer in `timeoutMs`. The caller then cannot
 *    tell what the member sees: the shell hides the nav item, the page shows
 *    the plex.tv alert, and the Keep action refuses.
 *
 * The budget is the caller's (E29): the shell passes 300 ms, the page, the
 * Home row and the Keep action 1500 ms. The share list itself loads once
 * with a fixed 3 s budget and fills the cache for the next caller.
 *
 * {@link canSeeItem} applies the result to one title. A label filter counts
 * only in sections whose listing carried `Label` tags (`facts.labelsRead`):
 * elsewhere a title's labels are not known, so the title is hidden.
 *
 * @module lib/cleanup/member/access
 */

import "server-only"

import { getSharedSectionFilters } from "@/lib/connections/plex-shared-sections"

import { parseLabelFilter } from "./label-filter"

/** The active Plex server, as the share list lookup needs it. */
interface MemberServer {
  url: string
  token: string
  /** The owner's plex.tv account id. The owner sees every library. */
  adminPlexUserId: string | null
}

/** Section id to `null` (no filter) or the labels that hide a title in it. */
export type MemberSectionAccess = ReadonlyMap<string, ReadonlySet<string> | null>

/** `"all"`, or the sections the member sees. Hidden sections are not in the map. */
export type MemberCleanupAccess = "all" | MemberSectionAccess

/** A title as the visibility check reads it. `labels` is null when the title is not in the library data. */
interface VisibilityFacts {
  sectionId: string
  labels: readonly string[] | null
}

/**
 * The sections that the server shares with a member, with their label
 * filters (TS 13.1).
 *
 * @param server - The active Plex server
 * @param plexUserId - The member's plex.tv account id
 * @param options.timeoutMs - How long this caller waits for plex.tv
 * @returns `"all"`, the section map, or `null` when plex.tv did not answer
 */
export async function memberCleanupAccess(
  server: MemberServer,
  plexUserId: string,
  { timeoutMs }: { timeoutMs: number }
): Promise<MemberCleanupAccess | null> {
  if (server.adminPlexUserId && plexUserId === server.adminPlexUserId) return "all"
  const shared = await getSharedSectionFilters(server, plexUserId, { timeoutMs })
  if (shared === null) return null
  if (shared === "all") return "all"
  const sections = new Map<string, ReadonlySet<string> | null>()
  for (const [sectionId, text] of shared) {
    if (text === null) {
      sections.set(sectionId, null)
      continue
    }
    const labels = parseLabelFilter(text)
    if (labels) sections.set(sectionId, labels)
  }
  return sections
}

/**
 * Whether the member may see a title: its section is shared, and under a
 * label filter, its section carried labels and the title holds none of the
 * hidden ones.
 */
export function canSeeItem(access: MemberCleanupAccess, item: VisibilityFacts, labelsRead: ReadonlySet<string>): boolean {
  if (access === "all") return true
  if (!access.has(item.sectionId)) return false
  const hidden = access.get(item.sectionId)
  if (!hidden) return true
  if (!labelsRead.has(item.sectionId) || item.labels === null) return false
  return !item.labels.some((label) => hidden.has(label.toLowerCase()))
}
