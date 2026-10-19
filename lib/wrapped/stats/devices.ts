/**
 * The setup page's facts (page 13, D5): how the member watched.
 *
 * Every share counts film and episode plays, out of the plays whose field is
 * known. `homeShare` is published only as a percentage. The platform and
 * product with the most plays win, then the most minutes, then the name.
 * `fourKShare` reads the cache's `videoResolution`, which only warmed films
 * carry, so it is null when no play has one.
 *
 * `PlayEvent` has no player, IP address or machine id, so nothing here can
 * read one (NFR-7). The page needs 20 plays.
 *
 * @module lib/wrapped/stats/devices
 */

import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"

import { videoEvents } from "./keys"
import type { MetadataLookup } from "./metadata"

const MIN_PLAYS = 20

export type DeviceStats =
  | { eligible: false }
  | {
      eligible: true
      /** 0-1, or null when no play reports the field. */
      directPlayShare: number | null
      homeShare: number | null
      topPlatform: string | null
      topProduct: string | null
      fourKShare: number | null
    }

function share<T>(values: ReadonlyArray<T | null>, hit: (value: T) => boolean): number | null {
  const known = values.filter((v): v is T => v !== null)
  return known.length > 0 ? known.filter(hit).length / known.length : null
}

function topOf(plays: ReadonlyArray<{ name: string | null; seconds: number }>): string | null {
  const tally = new Map<string, { plays: number; seconds: number }>()
  for (const { name, seconds } of plays) {
    if (!name) continue
    const entry = tally.get(name) ?? { plays: 0, seconds: 0 }
    entry.plays++
    entry.seconds += seconds
    tally.set(name, entry)
  }
  const [best] = [...tally].sort(([a, x], [b, y]) => y.plays - x.plays || y.seconds - x.seconds || (a < b ? -1 : 1))
  return best?.[0] ?? null
}

/**
 * @example
 * ```ts
 * const setup = computeDevices(events, lookup)
 * if (setup.eligible) setup.directPlayShare // 0.92
 * ```
 */
export function computeDevices(events: readonly PlayEvent[], lookup: MetadataLookup): DeviceStats {
  const plays = videoEvents(events)
  if (plays.length < MIN_PLAYS) return { eligible: false }
  return {
    eligible: true,
    directPlayShare: share(
      plays.map((e) => e.transcodeDecision),
      (d) => d === "direct play"
    ),
    homeShare: share(
      plays.map((e) => e.location),
      (l) => l === "lan"
    ),
    topPlatform: topOf(plays.map((e) => ({ name: e.platform, seconds: e.playSeconds }))),
    topProduct: topOf(plays.map((e) => ({ name: e.product, seconds: e.playSeconds }))),
    fourKShare: share(
      plays.map((e) => lookup(e)?.videoResolution?.toLowerCase() ?? null),
      (r) => r === "4k"
    ),
  }
}
