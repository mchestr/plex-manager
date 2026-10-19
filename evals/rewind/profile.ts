/**
 * What a fixture profile is: the member, the server, a deterministic builder
 * for the rows, and the hand-checked expectations, written as literals (or
 * plain arithmetic on literals) next to the rows they describe.
 *
 * @module evals/rewind/profile
 */

import type { Fixture } from "./fixture-schema"
import { libraryRow, metadataRow, type Film, type HistoryRow, type Series } from "./rows"

export interface ProfileRows {
  history: HistoryRow[]
  lifetimeBefore2026: HistoryRow[]
  metadata: Array<Record<string, unknown>>
  requests: Fixture["requests"]
  /** The server's library, for next year's picks; left out, it is null. */
  library?: Fixture["library"]
}

export interface Profile extends Omit<Fixture, keyof ProfileRows> {
  /** Builds the rows; `rng` is a mulberry32 seeded from the profile id. */
  build(rng: () => number): ProfileRows
}

/** A share, written as the counts it was derived from. */
export const ratio = (part: number, whole: number) => part / whole

/** Metadata rows for every title a profile plays. */
export const metadataFor = (titles: ReadonlyArray<Film | Series>) => titles.map(metadataRow)

/** Library rows for every title on the server. */
export const libraryFor = (titles: ReadonlyArray<Film | Series>) => titles.map(libraryRow)

/** The defaults most profiles share; each overrides what it tests. */
export const SERVER: Profile["server"] = {
  name: "Chester Family Plex",
  zone: "America/Chicago",
  overseerr: true,
  peers: { members: 12, hours: [610, 402, 355, 290, 240, 198, 150, 96, 61, 22, 3] },
}

export const MEMBER: Omit<Profile["member"], "displayName"> = { userName: null, timezone: null, hiddenRatingKeys: [] }

export const SEASON: Profile["window"] = { year: 2026, finalCut: false }
