/**
 * Parses plex.tv's `shared_servers` document: which library sections a
 * server shares with each Plex account (SEC-21).
 *
 * ## Response shape
 *
 * ```xml
 * <MediaContainer machineIdentifier="..." size="2">
 *   <SharedServer userID="1001" allLibraries="0" filterMovies="" filterTelevision="" ...>
 *     <Section key="1" type="movie" shared="1" ... />
 *     <Section key="2" type="show" shared="0" ... />
 *   </SharedServer>
 *   <SharedServer userID="1002" allLibraries="1" ... />
 * </MediaContainer>
 * ```
 *
 * ## Special cases
 *
 * - Entries without a `userID` (invites not yet tied to an account) are skipped.
 * - Malformed entries and sections are skipped one by one, so one bad item
 *   never empties everyone's list; a skipped item only takes access away.
 * - Several entries for one user are merged (union).
 * - A share with a content filter (`filterAll`, or the filter for the
 *   section's type, e.g. `filterMovies` for a movie section) loses that
 *   section: the filter limits which items the member sees, and items are not
 *   checked against it here. Such a share is never `'all'`.
 *
 * @module
 */

import { XMLParser } from "fast-xml-parser"
import { z } from "zod"

/** Section keys a member may browse: every library, or a set of local section keys. */
export type SharedSectionKeys = "all" | ReadonlySet<string>

type FilterAttribute =
  | "@_filterAll"
  | "@_filterMovies"
  | "@_filterTelevision"
  | "@_filterMusic"
  | "@_filterPhotos"

const FILTER_ATTRIBUTES: readonly FilterAttribute[] = [
  "@_filterAll",
  "@_filterMovies",
  "@_filterTelevision",
  "@_filterMusic",
  "@_filterPhotos",
]

/** The filter attribute that applies to each section type. */
const TYPE_FILTERS = new Map<string, FilterAttribute>([
  ["movie", "@_filterMovies"],
  ["show", "@_filterTelevision"],
  ["artist", "@_filterMusic"],
  ["photo", "@_filterPhotos"],
])

const documentSchema = z.object({
  MediaContainer: z.object({ SharedServer: z.array(z.unknown()).optional() }),
})

const sectionSchema = z.object({
  "@_key": z.string().min(1),
  "@_type": z.string().optional(),
  "@_shared": z.string().optional(),
})

const shareSchema = z.object({
  "@_userID": z.string().optional(),
  "@_allLibraries": z.string().optional(),
  "@_filterAll": z.string().optional(),
  "@_filterMovies": z.string().optional(),
  "@_filterTelevision": z.string().optional(),
  "@_filterMusic": z.string().optional(),
  "@_filterPhotos": z.string().optional(),
  Section: z.array(z.unknown()).optional(),
})

type Share = z.infer<typeof shareSchema>

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  isArray: (name) => name === "SharedServer" || name === "Section",
})

function hasAnyFilter(share: Share): boolean {
  return FILTER_ATTRIBUTES.some((name) => Boolean(share[name]))
}

/** Whether a content filter applies to a section of this type (any filter, when the type is unknown). */
function isFiltered(share: Share, sectionType: string | undefined): boolean {
  if (share["@_filterAll"]) return true
  const attribute = sectionType ? TYPE_FILTERS.get(sectionType) : undefined
  return attribute ? Boolean(share[attribute]) : hasAnyFilter(share)
}

function sharedKeysOf(share: Share): SharedSectionKeys {
  const allLibraries = share["@_allLibraries"] === "1"
  if (allLibraries && !hasAnyFilter(share)) return "all"

  const keys = new Set<string>()
  for (const item of share.Section ?? []) {
    const section = sectionSchema.safeParse(item)
    if (!section.success) continue
    const shared = allLibraries || section.data["@_shared"] === "1"
    if (shared && !isFiltered(share, section.data["@_type"])) keys.add(section.data["@_key"])
  }
  return keys
}

function merge(a: SharedSectionKeys | undefined, b: SharedSectionKeys): SharedSectionKeys {
  if (a === undefined) return b
  if (a === "all" || b === "all") return "all"
  return new Set([...a, ...b])
}

/**
 * Parses a plex.tv `shared_servers` document into Plex user ID → shared
 * section keys.
 *
 * @returns The map, or `null` when the document has no `MediaContainer`
 */
export function parseSharedServersXml(xml: string): Map<string, SharedSectionKeys> | null {
  const parsed = documentSchema.safeParse(xmlParser.parse(xml))
  if (!parsed.success) return null

  const byUser = new Map<string, SharedSectionKeys>()
  for (const item of parsed.data.MediaContainer.SharedServer ?? []) {
    const share = shareSchema.safeParse(item)
    if (!share.success) continue
    const userId = share.data["@_userID"]
    if (!userId || userId === "0") continue
    byUser.set(userId, merge(byUser.get(userId), sharedKeysOf(share.data)))
  }
  return byUser
}
