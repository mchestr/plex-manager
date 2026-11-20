/**
 * The show and season recipes of TS 6.10 and UX 5.7: big shows nobody plays,
 * finished shows nobody plays, old seasons nobody plays. Client-safe.
 *
 * @module lib/cleanup/recipes/shows
 */

import { cond, defineRecipe, definitionOf, durationValue, numberValue } from "@/lib/cleanup/recipes/build"
import { days, GRACE_KEY, keepNewestKey, lastEpisodeKey, lastPlayedKey, LONG_CHIPS, seasonsOnDiskKey, sizeKey } from "@/lib/cleanup/recipes/keys"
import type { Recipe } from "@/lib/cleanup/recipes/types"
import type { SnapshotLibrary } from "@/lib/cleanup/schema/snapshot"

/** "Frees the most space." and, when the library sizes are known, the share of TV in the libraries. */
function bigShowsNote(libraries: readonly SnapshotLibrary[]): string {
  const total = libraries.reduce((sum, library) => sum + library.bytes, 0)
  if (total <= 0) return "Frees the most space."
  const tv = libraries.filter((library) => library.type === "show").reduce((sum, library) => sum + library.bytes, 0)
  return `Frees the most space. TV holds ${Math.round((tv * 100) / total)} % of your media.`
}

const bigShowsSize = sizeKey([50, 100, 250], 100)
const bigShowsPlayed = lastPlayedKey(LONG_CHIPS, days(365))

export const bigShowsNobodyPlays: Recipe = defineRecipe({
  id: "big-shows-nobody-plays",
  version: 1,
  name: "Big shows nobody plays",
  levels: ["show"],
  keys: [bigShowsSize, bigShowsPlayed, GRACE_KEY],
  needs: ["plex", "tautulli", "sonarr"],
  note: bigShowsNote,
  build: (values, level, ctx) =>
    definitionOf(level, [
      cond.sizeMoreThan("c1", numberValue(values, bigShowsSize)),
      cond.lastPlayed("c2", durationValue(values, bigShowsPlayed), true),
      cond.moreThan("c3", "library.added", days(365)),
    ], values, ctx),
})

const finishedPlayed = lastPlayedKey(LONG_CHIPS, days(365))
const finishedLastEpisode = lastEpisodeKey(LONG_CHIPS, days(365))

export const finishedShows: Recipe = defineRecipe({
  id: "finished-shows",
  version: 1,
  name: "Finished shows nobody plays",
  levels: ["show"],
  keys: [finishedPlayed, finishedLastEpisode, GRACE_KEY],
  needs: ["plex", "tautulli", "sonarr"],
  build: (values, level, ctx) =>
    definitionOf(level, [
      cond.ended("c1"),
      cond.lastPlayed("c2", durationValue(values, finishedPlayed), true),
      cond.moreThan("c3", "show.lastEpisodeAdded", durationValue(values, finishedLastEpisode)),
    ], values, ctx),
})

const oldSeasonsKeep = keepNewestKey([1, 2, 3, 4], 2)
const oldSeasonsPlayed = lastPlayedKey(LONG_CHIPS, days(365))
const oldSeasonsOnDisk = seasonsOnDiskKey([2, 3, 4, 5], 3)

export const oldSeasons: Recipe = defineRecipe({
  id: "old-seasons",
  version: 1,
  name: "Old seasons nobody plays",
  levels: ["season"],
  keys: [oldSeasonsKeep, oldSeasonsPlayed, oldSeasonsOnDisk, GRACE_KEY],
  needs: ["plex", "tautulli", "sonarr"],
  build: (values, level, ctx) =>
    definitionOf(level, [
      cond.notNewest("c1", numberValue(values, oldSeasonsKeep)),
      cond.lastPlayed("c2", durationValue(values, oldSeasonsPlayed), true),
      cond.seasonsAtLeast("c3", numberValue(values, oldSeasonsOnDisk)),
    ], values, ctx),
})
