/**
 * Invented screen data for the Leaving soon and History tab tests (UX 4.7,
 * 4.9). The Leaving soon tests import it too: the package that owns both
 * tabs keeps its shared test data here. Every title is invented.
 *
 * @internal Test data only.
 */

import type { BatchRow, DeletionBatchData, EntryBatchData, HistoryRun, HistoryTitle, LeavingRow } from "@/lib/cleanup/types/list-parts"
import type { CleanupHistoryData, CleanupLeavingData } from "@/lib/cleanup/types/screens"
import type { ActionId } from "@/lib/validations/cleanup-vocabulary"

export const GB = 1024 ** 3
/** 2026-11-08 12:00 UTC: the loader renders of the tests. */
export const REVIEWED_AT = "2026-11-08T12:00:00.000Z"
export const TODAY = "2026-11-08"
export const HASH_A = "a".repeat(64)
export const HASH_B = "b".repeat(64)
export const HASH_C = "c".repeat(64)
export const BUDGET = { items: 20, bytes: String(500 * GB) }

/** A batch row: movie `n`, `100 - n` GB, so a lower `n` is larger. */
export const batchRow = (n: number, overrides: Partial<BatchRow> = {}): BatchRow => ({
  itemKey: `movie:tmdb:${n}`, level: "movie", title: `Invented Movie ${n}`, year: 2010 + (n % 10), seasonNumber: null, episodeCount: null, seasonCount: null,
  posterKey: null, sectionId: "1", sizeBytes: String((100 - n) * GB), action: "movie.delete", importListExclusion: false, lastPlayedAt: "never", ...overrides,
})

/** A deletion batch whose counts come from `rows`, or from `total` rows of the same kind when the rows are one page. */
export function deletionBatch(rows: BatchRow[], overrides: Partial<DeletionBatchData> = {}): DeletionBatchData {
  const actionCounts: Partial<Record<ActionId, number>> = {}
  for (const row of rows) actionCounts[row.action] = (actionCounts[row.action] ?? 0) + 1
  return {
    kind: "deletion", id: "deletion-rule-1", ruleId: "rule-1", ruleName: "Movies nobody watches", level: rows[0]?.level ?? "movie",
    action: rows[0]?.action ?? "movie.delete", importListExclusion: rows.some((row) => row.importListExclusion), actionCounts,
    exclusionCount: rows.filter((row) => row.importListExclusion).length, count: rows.length,
    bytes: String(rows.reduce((sum, row) => sum + Number(row.sizeBytes ?? 0), 0)), keysHash: HASH_A, reviewedAt: REVIEWED_AT,
    dueAt: TODAY, dueSince: TODAY, checkedAt: "2026-11-08T03:07:00.000Z", plan: { today: { count: 1, bytes: String(99 * GB) }, lastDay: "2026-11-10" },
    oversize: [], rows, rowsPage: 1, rowsPageCount: 1, ...overrides,
  }
}

export const entryBatch = (overrides: Partial<EntryBatchData> = {}): EntryBatchData => ({
  kind: "entry", id: "entry-rule-2", ruleId: "rule-2", ruleName: "Old seasons nobody plays", level: "season", count: 52, bytes: String(800 * GB),
  keysHash: HASH_B, reviewedAt: REVIEWED_AT, heldBy: { trigger: "scheduled", at: "2026-11-08T03:07:00.000Z" }, limit: 50, ...overrides,
})

/** A list row: season `n` of an invented show, leaving on Nov 19. */
export const leavingRow = (n: number, overrides: Partial<LeavingRow> = {}): LeavingRow => ({
  itemKey: `season:tvdb:${n}:4`, level: "season", title: `Invented Show ${n}`, year: 2005, seasonNumber: 4, episodeCount: 22, seasonCount: null,
  posterKey: null, sectionId: "2", sizeBytes: String((40 - n) * GB), library: "TV Shows", rules: [{ id: "rule-2", name: "Old seasons nobody plays" }],
  showAlsoLeaving: false, state: "leaving", leaveAt: "2026-11-19", group: "2026-11-19", status: "leaving", statusValues: {}, holdCode: null,
  failCode: null, deferredAt: null, postponedBy: null, plannedDay: null, plexUrl: null, ...overrides,
})

export function leavingData(overrides: Partial<CleanupLeavingData> = {}): CleanupLeavingData {
  const rows = overrides.rows ?? [leavingRow(1), leavingRow(2)]
  return {
    feature: { enabled: true, enabledAt: "2026-09-01T00:00:00.000Z", pausedAt: null, pausedBy: null, redis: true },
    batches: [], budget: BUDGET, exits7d: { played: 0, kept: 0, other: 0 },
    filters: { rules: [{ id: "rule-2", name: "Old seasons nobody plays" }], libraries: [{ sectionId: "2", title: "TV Shows" }], statuses: ["leaving"] },
    groups: [{ date: "2026-11-19", count: rows.length, bytes: String(rows.length * 30 * GB), inBatch: false, level: "season" }],
    rows, totals: { count: rows.length, bytes: String(rows.length * 30 * GB), volumePercent: 5.4 }, total: rows.length, page: 1, size: 50,
    ...overrides,
  }
}

export const historyRun = (overrides: Partial<HistoryRun> = {}): HistoryRun => ({
  id: "run-1", kind: "run", startedAt: "2026-11-08T03:07:00.000Z", finishedAt: "2026-11-08T03:11:00.000Z", trigger: "scheduled", actor: null,
  rules: [{ id: "rule-1", name: "Movies nobody watches" }], checked: 3413, joined: 3, rescued: 1, deleted: 0, failed: 0, freedBytes: "0", outcome: "finished",
  outcomeValues: {}, blocks: [], errorCode: null, ...overrides,
})

export const historyTitle = (overrides: Partial<HistoryTitle> = {}): HistoryTitle => ({
  itemKey: "season:tvdb:70:2", level: "season", title: "Invented Valley", year: 2001, seasonNumber: 2, episodeCount: 22, seasonCount: null, posterKey: null,
  sectionId: "2", sizeBytes: String(31 * GB), id: "out-1", kind: "deleted", reason: "deleted", rule: { id: "rule-2", name: "Old seasons nobody plays" },
  actedAt: "2026-11-07T03:20:00.000Z", freedBytes: String(31 * GB), approvedBy: "automatic", result: "deleted", cause: null, stillUnmonitored: null, ...overrides,
})

export const historyData = (overrides: Partial<CleanupHistoryData> = {}): CleanupHistoryData => ({
  runs: [historyRun()], deleted: [historyTitle()], total: 1, page: 1, size: 50, filters: { rules: [{ id: "rule-2", name: "Old seasons nobody plays" }] },
  nextRunAt: "2026-11-09T03:07:00.000Z", ...overrides,
})
