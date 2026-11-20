/**
 * The request recipes of TS 6.10 and UX 5.7, for movies or whole shows:
 * requested then never watched, the requester finished it, requests from
 * former members. They need Overseerr. Client-safe.
 *
 * @module lib/cleanup/recipes/requests
 */

import { cond, defineRecipe, definitionOf, durationValue } from "@/lib/cleanup/recipes/build"
import { addedKey, days, GRACE_KEY, lastPlayedKey, requestedKey } from "@/lib/cleanup/recipes/keys"
import type { Recipe } from "@/lib/cleanup/recipes/types"
import type { Condition } from "@/lib/validations/cleanup-rule"

const requestedAge = requestedKey([days(90), days(120), days(180), days(365)], days(120))
const requestedPlayed = lastPlayedKey([days(90), days(180), days(365)], days(180))

export const requestedNeverWatched: Recipe = defineRecipe({
  id: "requested-never-watched",
  version: 1,
  name: "Requested, then never watched",
  levels: ["movie", "show"],
  keys: [requestedAge, requestedPlayed, GRACE_KEY],
  needs: ["plex", "tautulli", "overseerr"],
  build: (values, level, ctx) =>
    definitionOf(level, [
      cond.moreThan("c1", "request.age", durationValue(values, requestedAge)),
      cond.requesters("c2", "neverPlayed"),
      cond.lastPlayed("c3", durationValue(values, requestedPlayed), true),
    ], values, ctx),
})

const finishedPlayed = lastPlayedKey([days(30), days(60), days(90), days(180)], days(60))

export const requesterFinished: Recipe = defineRecipe({
  id: "requester-finished",
  version: 1,
  name: "The requester finished it",
  levels: ["movie", "show"],
  keys: [finishedPlayed, GRACE_KEY],
  needs: ["plex", "tautulli", "overseerr"],
  build: (values, level, ctx) => {
    const conditions: Condition[] = [
      cond.requestExists("c1", true),
      cond.requesters("c2", "allFinished"),
      cond.lastPlayed("c3", durationValue(values, finishedPlayed), false),
    ]
    if (level === "show") conditions.push(cond.ended("c4"))
    return definitionOf(level, conditions, values, ctx)
  },
})

const formerPlayed = lastPlayedKey([days(90), days(180), days(365)], days(180))
const formerAdded = addedKey([days(30), days(90), days(180)], days(90))

export const formerMembers: Recipe = defineRecipe({
  id: "former-members",
  version: 1,
  name: "Requests from former members",
  levels: ["movie", "show"],
  keys: [formerPlayed, formerAdded, GRACE_KEY],
  needs: ["plex", "tautulli", "overseerr"],
  note: "Only plex-manager knows who left.",
  build: (values, level, ctx) =>
    definitionOf(level, [
      cond.onlyFormer("c1"),
      cond.lastPlayed("c2", durationValue(values, formerPlayed), true),
      cond.moreThan("c3", "library.added", durationValue(values, formerAdded)),
    ], values, ctx),
})
