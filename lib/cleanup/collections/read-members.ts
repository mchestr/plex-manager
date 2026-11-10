/**
 * The collection steps of a library read (TS 7.3 steps 5 and 6, 7.8).
 * Server-only: it reads Plex.
 *
 * 1. P7: the collections of every movie and show section go to the builder
 *    (`facts.collections`).
 * 2. P8: the members of the collections whose title is a G13 option name
 *    (trimmed, any case) or one of Kometa's seasonal titles, matched in
 *    every section.
 * 3. `facts.membersRead` lists the titles read in full. A failed P7 or P8
 *    leaves `plex` `ok` but keeps the titles it touches out of
 *    `membersRead`, so G13 is Unknown for them. A G13 name that no
 *    collection carries is read as empty, but only when every P7 call
 *    answered.
 *
 * @module lib/cleanup/collections/read-members
 */

import "server-only"

import { isSeasonalCollectionTitle, normTitle } from "@/lib/cleanup/collections/text"
import type { PlexCollectionRow, PlexSection } from "@/lib/cleanup/schema/upstream"
import type { SnapshotBuilder } from "@/lib/cleanup/snapshot/builder"
import type { CleanupReadOptions } from "@/lib/cleanup/snapshot/rows"
import { listPlexCollectionItems, listPlexCollections, type PlexReadConfig } from "@/lib/connections/plex-library-read"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("CLEANUP_READ")

/** What the collection steps read: the calls that failed. */
export interface CollectionMembersRead {
  failedSections: number
  failedCollections: number
}

/**
 * P7 and P8 for `sections` (movie and show sections only).
 *
 * @param names - The G13 option names (`options.protections.g13.collections`).
 */
export async function readCollectionMembers(
  config: PlexReadConfig,
  sections: readonly PlexSection[],
  names: readonly string[],
  builder: Pick<SnapshotBuilder, "addCollections" | "addCollectionMembers">,
  opts: CleanupReadOptions
): Promise<CollectionMembersRead> {
  const found: PlexCollectionRow[] = []
  let failedSections = 0
  for (const section of sections.filter((s) => s.type === "movie" || s.type === "show")) {
    if (opts.signal?.aborted) return { failedSections: failedSections + 1, failedCollections: 0 }
    const listed = await listPlexCollections(config, section.key, opts)
    if (!listed.ok) {
      failedSections++
      logger.warn("cleanup.read_collections_failed", { sectionId: section.key, code: listed.code })
      continue
    }
    builder.addCollections(section.key, listed.data)
    found.push(...listed.data)
  }

  const wanted = new Set(names.map(normTitle))
  const picked = found.filter((row) => wanted.has(normTitle(row.title)) || isSeasonalCollectionTitle(row.title))
  let failedCollections = 0
  for (const row of picked) {
    const members = opts.signal?.aborted ? null : await listPlexCollectionItems(config, row.ratingKey, opts)
    if (members?.ok) builder.addCollectionMembers(row.title, members.data)
    else {
      failedCollections++
      builder.addCollectionMembers(row.title, null)
    }
  }

  // A title a failed section might hold cannot count as read.
  const pickedTitles = new Set(picked.map((row) => normTitle(row.title)))
  for (const name of names) {
    if (failedSections > 0) builder.addCollectionMembers(name, null)
    else if (!pickedTitles.has(normTitle(name))) builder.addCollectionMembers(name, [])
  }
  if (failedSections > 0) for (const row of picked) builder.addCollectionMembers(row.title, null)
  return { failedSections, failedCollections }
}
