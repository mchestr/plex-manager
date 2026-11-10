/**
 * The Plex parts of the Settings tab (UX 4.10, 8.8, TS 12.7 item 4): the
 * Plex visibility section, the G9 tag and G13 collection choices, the
 * Kometa seasonal suggestion, and the next nightly run. Pure and
 * client-safe.
 *
 * 1. Plex visibility reads the collection sync's runtime (E8): "Working"
 *    while the last sync passed and no removed collection waits to be made
 *    again, else "Needs attention".
 * 2. The G9 tags are the arr tags of the library data, without the
 *    Overseerr requester tags `<id>-<username>`, which hold user names
 *    (UX 4.10 rule 2), plus the tags the option holds already.
 * 3. The G13 collections are the Plex collection titles of the library
 *    data, without the Leaving soon collections.
 * 4. The Kometa suggestion is the seasonal collections of one library that
 *    G13 does not hold yet. `names` are the stored titles ("Christmas
 *    Movies"), which "Add both" adds. The hint drops " Movies" with
 *    `seasonalName()`: "Kometa makes the collections Christmas and Halloween
 *    in Movies".
 *
 * @module lib/cleanup/screens/settings/plex
 */

import { COLLECTION_TITLES } from "@/lib/cleanup/constants"
import { normTitle } from "@/lib/cleanup/collections/text"
import { seasonalCollections } from "@/lib/cleanup/preview/protection-words"
import type { CleanupRuntime } from "@/lib/cleanup/schema/runtime"
import type { SnapshotFacts } from "@/lib/cleanup/schema/snapshot"
import type { LoadedSnapshot } from "@/lib/cleanup/snapshot/cache"
import type { SettingsCollection } from "@/lib/cleanup/types/list-parts"
import type { CleanupSettingsData } from "@/lib/cleanup/types/screens"
import { addDays } from "@/lib/ui/date-range"
import { wallTimeToInstant } from "@/lib/utils/zoned-time"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import { LEVELS } from "@/lib/validations/cleanup-vocabulary"

/** The wall time of the nightly read and run (`NIGHTLY_PATTERN`, 03:07). */
const NIGHTLY_TIME = "03:07"
/** An Overseerr requester tag: `<id>-<username>`. */
const REQUESTER_TAG = /^\d+-/
const OWN_COLLECTIONS = new Set(Object.values(COLLECTION_TITLES).map(normTitle))
const byText = (a: string, b: string) => a.localeCompare(b, "en")

/** The next nightly run after `now` in `zone`. */
export function nextNightlyRun(now: Date, today: string, zone: string): Date {
  const tonight = wallTimeToInstant(`${today}T${NIGHTLY_TIME}`, zone)
  return tonight > now ? tonight : wallTimeToInstant(`${addDays(today, 1)}T${NIGHTLY_TIME}`, zone)
}

/** The Plex visibility section: its state, the Leaving soon collections with their counts, the summary and the notices. */
export function plexSection(runtime: CleanupRuntime, summary: string): CleanupSettingsData["plex"] {
  const collections = Object.entries(runtime.collections).flatMap(([key, entry]): SettingsCollection[] => {
    const [sectionId, level] = key.split(":")
    const known = LEVELS.find((l) => l === level)
    return known ? [{ level: known, sectionId, title: entry.title, count: entry.count }] : []
  })
  const waiting = runtime.notices.some((notice) => notice.recreatedAt === null)
  return {
    working: (runtime.lastSync?.ok ?? true) && !waiting,
    checkedAt: runtime.lastSync?.at ?? null,
    collections: collections.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || byText(a.sectionId, b.sectionId)),
    summary,
    notices: runtime.notices,
  }
}

/** The arr tags that G9 offers. */
export function tagOptions(snapshot: LoadedSnapshot | null, options: CleanupOptions): string[] {
  const tags = new Set(options.protections.g9.tags)
  for (const level of [snapshot?.levels.movie, snapshot?.levels.show]) {
    for (const item of level?.items ?? []) for (const tag of item.arr?.tags ?? []) if (!REQUESTER_TAG.test(tag)) tags.add(tag)
  }
  return [...tags].sort(byText)
}

/** The Plex collection titles that G13 offers. */
export function collectionOptions(facts: SnapshotFacts | null, options: CleanupOptions): string[] {
  const titles = new Set(options.protections.g13.collections)
  for (const c of facts?.collections ?? []) if (!OWN_COLLECTIONS.has(normTitle(c.title))) titles.add(c.title)
  return [...titles].sort(byText)
}

/** Kometa's seasonal collections of the first library that has some G13 does not hold, or null. */
export function kometaSuggestion(facts: SnapshotFacts | null, options: CleanupOptions): CleanupSettingsData["kometaSuggestion"] {
  const held = new Set(options.protections.g13.collections.map(normTitle))
  for (const library of facts?.libraries ?? []) {
    const titles = (facts?.collections ?? []).filter((c) => c.sectionId === library.sectionId && !held.has(normTitle(c.title))).map((c) => c.title)
    const names = [...new Set(seasonalCollections(titles))]
    if (names.length > 0) return { names, library: library.title }
  }
  return null
}
