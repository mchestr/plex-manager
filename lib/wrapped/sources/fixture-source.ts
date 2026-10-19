/**
 * A {@link WatchHistorySource} over a golden fixture (P2.10).
 *
 * The fixture holds raw Tautulli `get_history` rows, so they go through the
 * same row schema and `toPlayEvent` mapping as the live source: a fixture
 * with a renamed field fails here (and throws under `NODE_ENV=test`) exactly
 * as an upstream change would. The eval harness, the dry runs and the golden
 * tests read fixtures only through this source.
 *
 * @module lib/wrapped/sources/fixture-source
 */

import { inWindow } from "@/lib/wrapped/time/zone"

import { parseRows, tooManyInvalid, type RowTally } from "./rows"
import { tautulliHistoryRowSchema } from "./schemas"
import { toPlayEvent } from "./tautulli-history"
import type { PlayEvent, SourceResult, WatchHistorySource } from "./watch-history-source"

/** The parts of a fixture the source reads. */
export interface FixtureHistory {
  history: readonly unknown[]
  lifetimeBefore2026: readonly unknown[]
}

export interface FixtureSource extends WatchHistorySource {
  /** Every play in the fixture, 2026 included, as the live lifetime pass returns it. */
  fetchLifetime(): Promise<SourceResult<PlayEvent[]>>
}

function readRows(rows: readonly unknown[]): SourceResult<PlayEvent[]> {
  const tally: RowTally = { read: 0, dropped: 0 }
  const parsed = parseRows("fixture get_history", tautulliHistoryRowSchema, rows, tally)
  if (tooManyInvalid(tally)) return { ok: false, code: "ROWS_INVALID" }
  const none = new Set<string>()
  return { ok: true, data: parsed.flatMap((row) => toPlayEvent(row, none) ?? []) }
}

/**
 * @example
 * ```ts
 * const source = createFixtureSource(fixture)
 * const year = await source.fetchYear({ plexUserId: "1" }, dataWindow(2026, zone, { finalCut: false }), ctx)
 * const lifetime = await source.fetchLifetime()
 * ```
 */
export function createFixtureSource(fixture: FixtureHistory): FixtureSource {
  return {
    kind: "tautulli",
    fetchYear: async (_user, window) => {
      const result = readRows(fixture.history)
      return result.ok ? { ok: true, data: result.data.filter((e) => inWindow(e.startedAt, window)) } : result
    },
    fetchLifetime: async () => readRows([...fixture.lifetimeBefore2026, ...fixture.history]),
  }
}
