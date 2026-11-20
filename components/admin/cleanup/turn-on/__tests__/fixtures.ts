/**
 * Turn-on page data for the component tests: a Dry run movie rule with 197
 * matches, every blocking check passing, Automatic not allowed for the
 * first batch, and the ten largest rows. Invented titles and names only.
 *
 * @internal Test data.
 */

import type { TurnOnCheck, TurnOnLargestRow } from "@/lib/cleanup/types/rule-parts"
import type { CleanupTurnOnData } from "@/lib/cleanup/types/screens"
import { bindFormat } from "@/lib/utils/format"

export const GB = 1024 ** 3
export const F = bindFormat({ timeZone: "UTC", locale: "en-US" })
export const REVIEWED_AT = "2026-11-08T12:00:00.000Z"

export const check = (id: TurnOnCheck["id"], state: TurnOnCheck["state"], blocks: TurnOnCheck["blocks"], values: TurnOnCheck["values"] = {}): TurnOnCheck =>
  ({ id, state, blocks, values })

export const OK_CHECKS: TurnOnCheck[] = [
  check("featureOn", "ok", "all"),
  check("libraryData", "ok", "all", { sources: 4, readAt: "2026-11-08T03:07:00.000Z" }),
  check("historyCovers", "ok", "all", { days: 365, startAt: "2022-06-14T00:00:00.000Z" }),
  check("matchedInArr", "ok", "none", { service: "radarr", count: 197 }),
  check("dryRuns", "ok", "none", { count: 12, min: 191, max: 199 }),
  check("firstBatchSize", "failed", "automatic", { count: 197, checked: 777 }),
  check("grace", "ok", "automatic", { graceDays: 30, min: 7 }),
]

export const largestRow = (n: number, overrides: Partial<TurnOnLargestRow> = {}): TurnOnLargestRow => ({
  itemKey: `movie:tmdb:${n}`, level: "movie", title: `Invented Movie ${n}`, year: 2020 + (n % 5), seasonNumber: null, episodeCount: null, seasonCount: null,
  posterKey: `rk-${n}`, sectionId: "1", sizeBytes: String((30 - n) * GB), lastPlayedAt: n % 2 === 0 ? "never" : "2024-08-14T12:00:00.000Z",
  addedAt: "2023-02-09T12:00:00.000Z", requestedBy: "none", why: [{ text: "Never played" }], ...overrides,
})

const FIRST_BATCH_REASON = "Not for this first batch, because it is more than 10 % of the movies checked (197 of 777). After the first batch, change the mode."

/** The page data, with overrides. `rule` overrides merge into the rule. */
export function turnOnData(overrides: Partial<Omit<CleanupTurnOnData, "rule">> & { rule?: Partial<CleanupTurnOnData["rule"]> } = {}): CleanupTurnOnData {
  const { rule, ...rest } = overrides
  return {
    rule: {
      id: "rule-1", name: "Movies nobody watches", sentence: [{ text: "Movies nobody watches" }], mode: "dryRun", level: "movie",
      action: "movie.delete", importListExclusion: true, graceDays: 30, ...rule,
    },
    mode: "reviewFirst",
    today: "2026-11-08",
    batch: {
      count: 197, bytes: String(1300 * GB), matches: 197, storagePercent: 27, growthWeeks: 4, protectedCount: 17, missingCount: 4, dueCount: 0,
      posters: Array.from({ length: 10 }, (_, i) => `rk-${i + 1}`),
    },
    leaveAt: "2026-12-08",
    automaticPace: { from: "2026-12-08", to: "2026-12-17", perDay: { items: 20, bytes: String(500 * GB) } },
    visibility: { collection: "Movies leaving soon", libraries: ["Movies"], membersWhoCanSee: 27 },
    linkedMembers: 5,
    keeps: { enabled: true, days: 90, limit: 20 },
    budget: { items: 20, bytes: String(500 * GB), sharedWith: [{ id: "rule-2", name: "Old seasons nobody plays" }] },
    entryCheck: { count: 50, percent: 10 },
    dryRuns: [191, 193, 195, 197, 199, 197].map((matches, i) => ({ at: `2026-10-${String(27 + i).padStart(2, "0")}T03:07:00.000Z`, matches })),
    largest: Array.from({ length: 10 }, (_, i) => largestRow(i + 1)),
    checks: OK_CHECKS,
    modes: [{ mode: "reviewFirst", allowed: true }, { mode: "automatic", allowed: false, reason: FIRST_BATCH_REASON }],
    typedApprovalCount: 197,
    revision: 3,
    count: 197,
    keysHash: "a".repeat(64),
    reviewedAt: REVIEWED_AT,
    budgetOversize: [],
    ...rest,
  }
}

/** Automatic allowed: a live Review first rule (Change mode) with 61 titles in Leaving soon. */
export function changeModeData(overrides: Parameters<typeof turnOnData>[0] = {}): CleanupTurnOnData {
  return turnOnData({
    mode: "automatic",
    count: 61,
    typedApprovalCount: 61,
    checks: OK_CHECKS.map((c) => (c.id === "firstBatchSize" ? check("firstBatchSize", "ok", "automatic", { count: 61, checked: 777 }) : c)),
    modes: [{ mode: "reviewFirst", allowed: true }, { mode: "automatic", allowed: true }],
    ...overrides,
    rule: { mode: "reviewFirst", ...overrides.rule },
    batch: { ...turnOnData().batch, count: 61, dueCount: 6, ...overrides.batch },
  })
}
