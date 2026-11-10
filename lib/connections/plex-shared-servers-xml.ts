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
 *   section in {@link parseSharedServersXml}: the filter limits which items
 *   the member sees, and items are not checked against it here. Such a share
 *   is never `'all'`.
 * - {@link filtersOf} keeps a filtered section with its filter text instead,
 *   for media cleanup's member pages, which check labels themselves (13.1).
 *
 * {@link parseSharedServersDocument} parses the XML once; {@link keysOf} and
 * {@link filtersOf} read the same parsed document.
 *
 * @module
 */

import { XMLParser } from "fast-xml-parser"
import { z } from "zod"

/** Section keys a member may browse: every library, or a set of local section keys. */
export type SharedSectionKeys = "all" | ReadonlySet<string>

/**
 * The sections a member may browse, each with the filter text that applies to
 * it, or `null` for no filter. When `filterAll` and the filter of the section's
 * type both hold text, the text is both, joined by `|`: plex.tv joins clauses
 * that must all pass with `|` (python-plexapi `MyPlexAccount._filterDictToStr`).
 * `'all'`: every library with no filter, as {@link keysOf} gives it.
 */
export type SharedSectionFilters = "all" | ReadonlyMap<string, string | null>

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

/** A parsed `shared_servers` document: each valid entry with its Plex user ID, in order. */
export interface SharedServersDocument {
  shares: readonly { userId: string; share: Share }[]
}

/**
 * Parses a plex.tv `shared_servers` document once, for {@link keysOf} and
 * {@link filtersOf}. Malformed entries and entries without a user are left out.
 *
 * @returns The document, or `null` when it has no `MediaContainer`
 */
export function parseSharedServersDocument(xml: string): SharedServersDocument | null {
  const parsed = documentSchema.safeParse(xmlParser.parse(xml))
  if (!parsed.success) return null

  const shares: { userId: string; share: Share }[] = []
  for (const item of parsed.data.MediaContainer.SharedServer ?? []) {
    const share = shareSchema.safeParse(item)
    if (!share.success) continue
    const userId = share.data["@_userID"]
    if (!userId || userId === "0") continue
    shares.push({ userId, share: share.data })
  }
  return { shares }
}

/** Plex user ID → shared section keys, with several entries of one user merged (union). */
export function keysOf(document: SharedServersDocument): Map<string, SharedSectionKeys> {
  const byUser = new Map<string, SharedSectionKeys>()
  for (const { userId, share } of document.shares) byUser.set(userId, merge(byUser.get(userId), sharedKeysOf(share)))
  return byUser
}

/**
 * Parses a plex.tv `shared_servers` document into Plex user ID → shared
 * section keys.
 *
 * @returns The map, or `null` when the document has no `MediaContainer`
 * @internal Exported for the tests.
 */
export function parseSharedServersXml(xml: string): Map<string, SharedSectionKeys> | null {
  const document = parseSharedServersDocument(xml)
  return document ? keysOf(document) : null
}

/**
 * The filter text that applies to a section of this type, `null` for none,
 * or `undefined` when the type is unknown and any filter is set (as
 * `isFiltered` reads it, the section is then hidden).
 */
function filterTextOf(share: Share, sectionType: string | undefined): string | null | undefined {
  const attribute = sectionType ? TYPE_FILTERS.get(sectionType) : undefined
  if (!attribute) return hasAnyFilter(share) ? undefined : null
  const texts = [share["@_filterAll"], share[attribute]].filter((text): text is string => Boolean(text))
  return texts.length > 0 ? texts.join("|") : null
}

/**
 * Plex user ID → the sections shared with them and the filter text of each
 * (13.1). Unlike {@link keysOf}, a filtered section stays, with its text.
 *
 * Several entries of one user merge section by section (integrations-r4-2):
 * a section that one entry shares takes that entry's filter. Two entries that
 * give one section different texts hide it, and `null` (no filter) differs
 * from any text. A section of unknown type under a filter is hidden too.
 * A user whose every entry shares all libraries with no filter gets `'all'`,
 * also when plex.tv lists no section.
 */
export function filtersOf(document: SharedServersDocument): Map<string, SharedSectionFilters> {
  const byUser = new Map<string, Map<string, string | null>>()
  const hidden = new Map<string, Set<string>>()
  const open = new Map<string, boolean>()
  for (const { userId, share } of document.shares) {
    const filters = byUser.get(userId) ?? new Map<string, string | null>()
    const gone = hidden.get(userId) ?? new Set<string>()
    byUser.set(userId, filters)
    hidden.set(userId, gone)
    const allLibraries = share["@_allLibraries"] === "1"
    open.set(userId, (open.get(userId) ?? true) && allLibraries && !hasAnyFilter(share))
    for (const item of share.Section ?? []) {
      const section = sectionSchema.safeParse(item)
      if (!section.success || (!allLibraries && section.data["@_shared"] !== "1")) continue
      const key = section.data["@_key"]
      if (gone.has(key)) continue
      const text = filterTextOf(share, section.data["@_type"])
      if (text === undefined || (filters.has(key) && filters.get(key) !== text)) {
        filters.delete(key)
        gone.add(key)
      } else {
        filters.set(key, text)
      }
    }
  }
  return new Map([...byUser].map(([userId, filters]) => [userId, open.get(userId) ? "all" : filters]))
}
