/**
 * The fixes a problem report can run, their words, and the gate every run
 * passes first (docs/problem-reports.md, "Fixes").
 *
 * | Fix                | What it does                                              | Removes anything |
 * |--------------------|-----------------------------------------------------------|------------------|
 * | `LOOK_FOR_MISSING` | Sonarr's search for the show's missing episodes, or a Plex | No               |
 * |                    | scan of its folder when Sonarr has files Plex lacks       |                  |
 * | `BETTER_COPY`      | Radarr's or Sonarr's search with the file in place, which | No; an upgrade   |
 * |                    | grabs only an upgrade the quality profile wants           | replaces it      |
 * | `SWAP`             | another release of the same quality or better, grabbed    | The old copy, once |
 * |                    | from an interactive search (admins only)                  | the new one imports |
 * | `REFRESH`          | Plex reads the item's details again (admins only)         | No               |
 * | `REMOVE_AND_SEARCH`| deletes the file, then searches (admins only, a confirm)  | Yes, at once     |
 *
 * ## The gate
 *
 * Every run reads the ledger (`ProblemFixLedger`) in the transaction that
 * adds its own row, and {@link gateFix} decides:
 *
 * - a fix that sends an indexer search waits for tomorrow past
 *   {@link DAILY_SEARCH_CAP} searches in a day, from any trigger;
 * - a fix that replaces a file stops while the breaker is tripped, and trips
 *   it past {@link BREAKER_LIMITS} replacements an hour or a day, from any
 *   trigger. It stays tripped until an admin resumes fixes. A swap and a
 *   removal replace a file; a better copy is the server's own upgrade, which
 *   its quality profile asked for, so it counts as a search and not as a
 *   replacement.
 *
 * @module lib/problem-reports/fixes
 */

import { PROBLEMS, type ProblemCode, type ReportableType } from "@/lib/problem-reports/taxonomy"

/** A fix a report can run. */
export type FixAction = "SWAP" | "BETTER_COPY" | "LOOK_FOR_MISSING" | "REFRESH" | "REMOVE_AND_SEARCH"

/** The fixes a member's report can start on its own; none of them replaces the file. */
export type MemberFixAction = Exclude<FixAction, "SWAP" | "REMOVE_AND_SEARCH">

/** Every fix, for `z.enum`. */
export const FIX_ACTIONS = ["SWAP", "BETTER_COPY", "LOOK_FOR_MISSING", "REFRESH", "REMOVE_AND_SEARCH"] as const satisfies readonly FixAction[]

/** Fixes that replace the file: each has its own action, so MCP clients see it as destructive; `runProblemFix` runs the rest. */
export const FILE_FIXES = ["SWAP", "REMOVE_AND_SEARCH"] as const satisfies readonly FixAction[]

/** Who started a run: the app on a member's report, an admin on the web, or an MCP client. */
export type FixTrigger = "automatic" | "web" | "mcp"

/** Indexer searches a day, across every fix and trigger. @internal */
export const DAILY_SEARCH_CAP = 30

/** File replacements, from any trigger, that trip the breaker. @internal */
export const BREAKER_LIMITS = { hour: 5, day: 15 } as const

/** What a fix does, for the gate. */
export interface FixTraits {
  searches: boolean
  replacesFile: boolean
}

const TRAITS: Record<FixAction, FixTraits> = {
  LOOK_FOR_MISSING: { searches: true, replacesFile: false },
  BETTER_COPY: { searches: true, replacesFile: false },
  SWAP: { searches: true, replacesFile: true },
  REMOVE_AND_SEARCH: { searches: true, replacesFile: true },
  REFRESH: { searches: false, replacesFile: false },
}

/** The words for each fix: its button, what the report shows while it runs, and its timeline step. */
export const FIX_WORDS: Record<FixAction, { button: string; running: string; started: string }> = {
  LOOK_FOR_MISSING: { button: "Look for the episodes", running: "Looking for the episodes", started: "Started looking for the episodes" },
  BETTER_COPY: { button: "Look for a better copy", running: "Looking for a better copy", started: "Started looking for a better copy" },
  SWAP: { button: "Swap the copy", running: "Swapping the copy", started: "Started swapping the copy" },
  REMOVE_AND_SEARCH: { button: "Remove the file and search", running: "Looking for a new copy", started: "Removed the file and started a search" },
  REFRESH: { button: "Refresh the details", running: "Refreshing the details", started: "Asked Plex to refresh the details" },
}

export function fixTraits(action: FixAction): FixTraits {
  return TRAITS[action]
}

/** What the ledger says about the last day, for {@link gateFix}. */
export interface GateCounts {
  searchesToday: number
  replacementsLastHour: number
  replacementsToday: number
}

export type GateRefusal = "SEARCH_CAP" | "BREAKER"

/**
 * Whether a fix may run now. `trips` is true when this refusal is the one
 * that trips the breaker, so the caller records it.
 */
export function gateFix(traits: FixTraits, counts: GateCounts, breakerTripped: boolean): { ok: true } | { ok: false; reason: GateRefusal; trips: boolean } {
  if (traits.replacesFile) {
    if (breakerTripped) return { ok: false, reason: "BREAKER", trips: false }
    if (counts.replacementsLastHour >= BREAKER_LIMITS.hour || counts.replacementsToday >= BREAKER_LIMITS.day) {
      return { ok: false, reason: "BREAKER", trips: true }
    }
  }
  if (traits.searches && counts.searchesToday >= DAILY_SEARCH_CAP) return { ok: false, reason: "SEARCH_CAP", trips: false }
  return { ok: true }
}

/** The fix a problem points to, when it is one that runs. */
export function suggestedFix(problem: string): FixAction | null {
  const fix: string | undefined = problem in PROBLEMS ? PROBLEMS[problem as ProblemCode].fix : undefined
  return FIX_ACTIONS.find((action) => action === fix) ?? null
}

/** The fixes that need a file of the title's own, which a show doesn't have. */
const NEEDS_FILE: ReadonlySet<FixAction> = new Set(["SWAP", "BETTER_COPY", "REMOVE_AND_SEARCH"])

/** The fixes an admin can run on a report about this type of title: a file's fixes need one, and missing episodes a show. */
export function fixesFor(type: ReportableType): FixAction[] {
  return FIX_ACTIONS.filter((action) => (NEEDS_FILE.has(action) ? type !== "show" : action === "LOOK_FOR_MISSING" ? type !== "movie" : true))
}
