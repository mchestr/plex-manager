/**
 * The plain words of media cleanup: levels, modes, actions, duration units,
 * byte units, field ids and services, and what each field needs (TS 3.2,
 * TS 4.2, deviation D3). Client-safe: no server imports, no Zod.
 *
 * Each name has one home. Import it from this file, not through another one.
 *
 * @module lib/validations/cleanup-vocabulary
 */

/** What a rule acts on: Movies, Whole shows or Seasons (UX 5.2). */
export const LEVELS = ["movie", "show", "season"] as const
export type Level = (typeof LEVELS)[number]

/** Dry run records matches only. Review first and Automatic are live (UX 5.6). */
export const MODES = ["dryRun", "reviewFirst", "automatic"] as const
export type Mode = (typeof MODES)[number]

/** Actions by level. The first of each level is the default. */
export const ACTIONS = {
  movie: ["movie.delete", "movie.unmonitorDeleteFiles"],
  show: ["show.delete", "show.unmonitorDeleteFiles"],
  season: ["season.unmonitorDeleteFiles"],
} as const
export type ActionId = (typeof ACTIONS)[Level][number]
export const ACTION_IDS = [...ACTIONS.movie, ...ACTIONS.show, ...ACTIONS.season] as const

/** Higher is more careful. Overlapping rules use the most careful action (TS 6.8). */
export const ACTION_CARE: Record<ActionId, number> = {
  "movie.delete": 1,
  "movie.unmonitorDeleteFiles": 2,
  "show.delete": 1,
  "show.unmonitorDeleteFiles": 2,
  "season.unmonitorDeleteFiles": 2,
}

/** The units of a duration value. Months are 30 days and years 365 (TS 4.2). */
export const DURATION_UNITS = ["days", "weeks", "months", "years"] as const
export type DurationUnit = (typeof DURATION_UNITS)[number]
export const UNIT_DAYS = { days: 1, weeks: 7, months: 30, years: 365 } as const
/** The largest amount of each unit (X4). */
export const UNIT_MAX = { days: 3650, weeks: 521, months: 121, years: 10 } as const

/** 1 GB as the UI shows it: 1024 ** 3 bytes. */
export const GiB = 1024 ** 3
/** 1 TB as the UI shows it: 1024 ** 4 bytes. */
export const TiB = 1024 ** 4

/** Every condition field, in the field order of the Why text (TS 6.9). */
export const FIELD_IDS = [
  "watch.lastPlayed",
  "watch.plays",
  "request.exists",
  "request.age",
  "request.by",
  "request.requesters",
  "library.added",
  "file.size",
  "show.status",
  "show.lastEpisodeAdded",
  "show.seasonsOnDisk",
  "season.position",
] as const
export type FieldId = (typeof FIELD_IDS)[number]

/** The services that the library data reads. */
export const SERVICES = ["plex", "tautulli", "overseerr", "radarr", "sonarr"] as const
export type Service = (typeof SERVICES)[number]

const ALL_LEVELS: readonly Level[] = LEVELS
const SHOW_LEVELS: readonly Level[] = ["show", "season"]

/** The levels each field applies to (TS 4.2 "Levels"). `checkDefinition` gives `not_applicable` for the others. */
export const FIELD_LEVELS: Record<FieldId, readonly Level[]> = {
  "watch.lastPlayed": ALL_LEVELS,
  "watch.plays": ALL_LEVELS,
  "request.exists": ALL_LEVELS,
  "request.age": ALL_LEVELS,
  "request.by": ALL_LEVELS,
  "request.requesters": ALL_LEVELS,
  "library.added": ALL_LEVELS,
  "file.size": ALL_LEVELS,
  "show.status": SHOW_LEVELS,
  "show.lastEpisodeAdded": SHOW_LEVELS,
  "show.seasonsOnDisk": SHOW_LEVELS,
  "season.position": ["season"],
}

type BySource = Record<Level, readonly Service[]>
const same = (services: readonly Service[]): BySource => ({ movie: services, show: services, season: services })
const showsOnly = (services: readonly Service[]): BySource => ({ movie: [], show: services, season: services })

/**
 * The services whose data each field reads, by level (TS 4.2 "Sources"). A
 * failed source makes the field Unknown, and `ruleSources()` adds it to the
 * safety stop checks (TS 8.2). A level that the field does not apply to has none.
 *
 * `request.by` reads Tautulli too, but only for an `inactive` requester ref.
 * The value decides that, so `ruleSources()` adds `tautulli` for such a ref.
 */
export const FIELD_SOURCES: Record<FieldId, BySource> = {
  "watch.lastPlayed": same(["tautulli"]),
  "watch.plays": same(["tautulli"]),
  "request.exists": same(["overseerr"]),
  "request.age": same(["overseerr"]),
  "request.by": same(["overseerr", "plex"]),
  "request.requesters": same(["overseerr", "tautulli"]),
  "library.added": { movie: ["plex", "radarr"], show: ["plex", "sonarr"], season: ["plex", "sonarr"] },
  "file.size": { movie: ["radarr", "plex"], show: ["sonarr", "plex"], season: ["sonarr", "plex"] },
  "show.status": showsOnly(["sonarr"]),
  "show.lastEpisodeAdded": showsOnly(["plex"]),
  "show.seasonsOnDisk": showsOnly(["sonarr"]),
  "season.position": { movie: [], show: [], season: ["sonarr"] },
}

/** The services a field needs (TS 4.2 "Needs"). One that is not set up disables the field: "Set up {service} to use this". */
export const FIELD_NEEDS: Record<FieldId, readonly Service[]> = {
  "watch.lastPlayed": ["tautulli"],
  "watch.plays": ["tautulli"],
  "request.exists": ["overseerr"],
  "request.age": ["overseerr"],
  "request.by": ["overseerr"],
  "request.requesters": ["overseerr", "tautulli"],
  "library.added": [],
  "file.size": [],
  "show.status": ["sonarr"],
  "show.lastEpisodeAdded": [],
  "show.seasonsOnDisk": ["sonarr"],
  "season.position": ["sonarr"],
}

/** The arr app that manages a level: Radarr for movies, Sonarr for shows and seasons. */
export const LEVEL_ARR: Record<Level, "radarr" | "sonarr"> = { movie: "radarr", show: "sonarr", season: "sonarr" }
