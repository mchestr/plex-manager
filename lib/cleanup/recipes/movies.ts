/**
 * The movie-only recipes of TS 6.10 and UX 5.7: never watched movies, movies
 * nobody watches, nobody asked, big movies. Client-safe.
 *
 * @module lib/cleanup/recipes/movies
 */

import { cond, defineRecipe, definitionOf, durationValue, numberValue } from "@/lib/cleanup/recipes/build"
import { addedKey, days, GRACE_KEY, lastPlayedKey, LONG_CHIPS, playsKey, sizeKey, years } from "@/lib/cleanup/recipes/keys"
import type { Recipe } from "@/lib/cleanup/recipes/types"

const neverWatchedAdded = addedKey([days(90), days(180), days(365), years(2)], days(180))

export const neverWatchedMovies: Recipe = defineRecipe({
  id: "never-watched-movies",
  version: 1,
  name: "Never watched movies",
  levels: ["movie"],
  keys: [neverWatchedAdded, GRACE_KEY],
  needs: ["plex", "tautulli", "radarr"],
  note: "Good first rule. Its matches have no plays at all.",
  build: (values, level, ctx) =>
    definitionOf(level, [cond.neverPlayed("c1"), cond.moreThan("c2", "library.added", durationValue(values, neverWatchedAdded))], values, ctx),
})

const nobodyWatchesAdded = addedKey(LONG_CHIPS, days(365))
const nobodyWatchesPlayed = lastPlayedKey(LONG_CHIPS, days(365))

export const moviesNobodyWatches: Recipe = defineRecipe({
  id: "movies-nobody-watches",
  version: 1,
  name: "Movies nobody watches",
  levels: ["movie"],
  keys: [nobodyWatchesAdded, nobodyWatchesPlayed, GRACE_KEY],
  needs: ["plex", "tautulli", "radarr"],
  build: (values, level, ctx) =>
    definitionOf(level, [
      cond.moreThan("c1", "library.added", durationValue(values, nobodyWatchesAdded)),
      cond.lastPlayed("c2", durationValue(values, nobodyWatchesPlayed), true),
    ], values, ctx),
})

const nobodyAskedAdded = addedKey([days(90), days(180), days(365)], days(180))

export const nobodyAsked: Recipe = defineRecipe({
  id: "nobody-asked",
  version: 1,
  name: "Nobody asked, nobody watched",
  levels: ["movie"],
  keys: [nobodyAskedAdded, GRACE_KEY],
  needs: ["plex", "tautulli", "overseerr", "radarr"],
  build: (values, level, ctx) =>
    definitionOf(level, [
      cond.requestExists("c1", false),
      cond.neverPlayed("c2"),
      cond.moreThan("c3", "library.added", durationValue(values, nobodyAskedAdded)),
    ], values, ctx),
})

const bigMoviesSize = sizeKey([10, 20, 40], 20)
const bigMoviesPlays = playsKey([1, 2, 3], 2)

export const bigMovies: Recipe = defineRecipe({
  id: "big-movies",
  version: 1,
  name: "Big movies, little watching",
  levels: ["movie"],
  keys: [bigMoviesSize, bigMoviesPlays, GRACE_KEY],
  needs: ["plex", "tautulli", "radarr"],
  build: (values, level, ctx) =>
    definitionOf(level, [
      cond.sizeMoreThan("c1", numberValue(values, bigMoviesSize)),
      cond.playsFewerThan("c2", numberValue(values, bigMoviesPlays), 365),
      cond.moreThan("c3", "library.added", days(365)),
    ], values, ctx),
})
