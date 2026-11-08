/**
 * The "Ready to turn on" checks (TS 10.5, UX 4.6 and 7.13), the steady test of
 * the dry runs (X7) and the Automatic reasons (`modeAllowed`). Pure and
 * client-safe: the turn-on loader and `turnOnCleanupRule` share it.
 *
 * Page order. "Not paused", "Tautulli plays" and "Kometa" show only when they
 * fail (UX 7.13). "History covers" needs a Tautulli that the rule reads and that
 * answered. The two Automatic-only checks always come. A failed `libraryData`
 * holds the fields of its first stop, so `blockCause()` can word it.
 *
 * @module lib/cleanup/turn-on
 */

import type { Block } from "@/lib/cleanup/blocks"
import type { TurnOnCheckId } from "@/lib/cleanup/constants"
import { type BlockSnapshot, ruleBlocks, ruleSources, windowDays } from "@/lib/cleanup/rule-blocks"
import type { RuntimeNotice } from "@/lib/cleanup/schema/runtime"
import type { DryRunEntry } from "@/lib/cleanup/schema/stats"
import type { TurnOnCheck, TurnOnMode } from "@/lib/cleanup/types/rule-parts"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"
import { LEVEL_ARR, type Level } from "@/lib/validations/cleanup-vocabulary"

const STEADY = { runs: 7, percent: 10, items: 5 } // X7: the newest 7 stay within 10 % of the newest count, or within 5
/** UX 5.6: Automatic needs a first batch of at most 10 % of the checked items. */
const FIRST_BATCH_PERCENT = 10
const KOMETA_NOTICE_MS = 30 * 86_400_000 // X9: the warning shows while a collection removal is younger than 30 days

export interface DryRunSummary {
  count: number // dry runs of the saved definition, one per library read
  firstAt: string | null // the oldest of them ("since your change on {day}")
  min: number | null
  max: number | null
  steady: boolean
}

const time = (iso: string) => Date.parse(iso)

/** The dry runs of the saved definition (equal `definitionHash`), the newest per `snapshotId`, and the X7 steady test. */
export function dryRunSummary(dryRuns: readonly DryRunEntry[], definitionHash: string): DryRunSummary {
  const bySnapshot = new Map<string, DryRunEntry>()
  for (const run of dryRuns) {
    const kept = bySnapshot.get(run.snapshotId)
    if (run.definitionHash === definitionHash && (!kept || time(run.at) > time(kept.at))) bySnapshot.set(run.snapshotId, run)
  }
  const runs = [...bySnapshot.values()].sort((a, b) => time(b.at) - time(a.at))
  if (runs.length === 0) return { count: 0, firstAt: null, min: null, max: null, steady: false }
  const newest = runs[0].matches
  const allowed = Math.max((newest * STEADY.percent) / 100, STEADY.items)
  const counts = runs.map((run) => run.matches)
  return {
    count: runs.length,
    firstAt: runs[runs.length - 1].at,
    min: Math.min(...counts),
    max: Math.max(...counts),
    steady: counts.slice(0, STEADY.runs).every((matches) => Math.abs(matches - newest) <= allowed),
  }
}

export interface TurnOnInput {
  now: number
  feature: { enabled: boolean; paused: boolean }
  rule: { id?: string; definition: RuleDefinition }
  snapshot: BlockSnapshot | null // the newest complete snapshot
  options: CleanupOptions
  dryRuns: readonly DryRunEntry[] // `RuleStats.dryRuns`
  definitionHash: string // of the saved definition (X7)
  /** The compared set (`count`), the items checked, and the matches that are Cannot delete. */
  counts: { count: number; checked: number; cannotDelete: number }
  firstBatch: boolean // from Dry run. A live rule (Change mode) had its first batch already
  arr?: Record<string, string> // more values of the "Matched in the arr" pass line (`matchedBy`, `root`)
  notices: readonly RuntimeNotice[]
}

const make = (id: TurnOnCheckId, state: TurnOnCheck["state"], blocks: TurnOnCheck["blocks"], values: TurnOnCheck["values"] = {}): TurnOnCheck =>
  ({ id, state, blocks, values })

const BLOCK_FIELDS = ["code", "service", "hours", "days", "readAt", "rows", "previousRows", "counter", "errorCode"] as const
function blockValues(block: Block): TurnOnCheck["values"] {
  const values: TurnOnCheck["values"] = {}
  for (const key of BLOCK_FIELDS) {
    const value = block[key]
    if (value !== undefined) values[key] = value
  }
  return values
}

const DATA_STOPS = new Set(["noData", "dataStale", "sourceFailed", "sourceShrank"])

/** Every check of TS 10.5 that shows, in page order. */
export function turnOnChecks(input: TurnOnInput): TurnOnCheck[] {
  const { definition } = input.rule
  const { snapshot, options, counts } = input
  const blocks = ruleBlocks(definition, snapshot, { now: input.now, options, ruleId: input.rule.id })
  const has = (code: string) => blocks.find((block) => block.code === code)
  const services = snapshot ? ruleSources(definition, options, snapshot.sources) : []
  const checks = [make("featureOn", input.feature.enabled ? "ok" : "failed", "all")]
  if (input.feature.paused) checks.push(make("notPaused", "failed", "all"))
  const dataStop = blocks.find((block) => DATA_STOPS.has(block.code))
  if (snapshot && !dataStop) checks.push(make("libraryData", "ok", "all", { sources: services.length, readAt: snapshot.facts.takenAt }))
  else checks.push(make("libraryData", "failed", "all", blockValues(dataStop ?? { code: "noData" })))
  if (has("tautulliStale")) checks.push(make("tautulliPlays", "failed", "all"))
  const tautulliOk = snapshot?.sources.every((s) => s.service !== "tautulli" || s.state !== "failed") ?? false
  if (snapshot && tautulliOk && services.includes("tautulli")) {
    const { startAt } = snapshot.facts.history
    const values = { days: windowDays(definition, options), ...(startAt === null ? {} : { startAt: new Date(startAt * 1000).toISOString() }) }
    checks.push(make("historyCovers", has("historyShort") ? "failed" : "ok", "all", values))
  }
  const service = LEVEL_ARR[definition.level]
  checks.push(counts.cannotDelete > 0
    ? make("matchedInArr", "warning", "none", { service, cannotDelete: counts.cannotDelete })
    : make("matchedInArr", "ok", "none", { service, count: counts.count, ...input.arr }))
  const runs = dryRunSummary(input.dryRuns, input.definitionHash)
  if (runs.count === 0) checks.push(make("dryRuns", "info", "automatic", { count: 0 }))
  else checks.push(make("dryRuns", runs.steady ? "ok" : "warning", "none", { count: runs.count, min: runs.min ?? 0, max: runs.max ?? 0 }))

  const tooLarge = input.firstBatch && counts.count * 100 > counts.checked * FIRST_BATCH_PERCENT
  checks.push(make("firstBatchSize", tooLarge ? "failed" : "ok", "automatic", { count: counts.count, checked: counts.checked }))
  const graceDays = definition.then.graceDays
  checks.push(make("grace", graceDays < options.automaticMinGraceDays ? "failed" : "ok", "automatic",
    { graceDays, min: options.automaticMinGraceDays }))
  const notice = input.notices
    .filter((n) => n.kind === "collectionRemoved" && input.now - time(n.detectedAt) < KOMETA_NOTICE_MS)
    .sort((a, b) => time(b.detectedAt) - time(a.detectedAt))[0]
  if (notice) checks.push(make("kometa", "warning", "none", { collection: notice.title, detectedAt: notice.detectedAt }))
  return checks
}

/** True when a check stops a turn-on in `mode`: it does not pass, and it blocks every mode or this one (TS 10.3 step 6). */
export function checkStops(check: TurnOnCheck, mode: TurnOnMode["mode"]): boolean {
  return check.state !== "ok" && (check.blocks === "all" || (check.blocks === "automatic" && mode === "automatic"))
}

const ITEMS: Record<Level, string> = { movie: "movies", show: "shows", season: "seasons" }

/** The two mode cards. Automatic is disabled with the first of the three reasons of UX 4.6 that applies (UX 8.7 words). */
export function modeAllowed(checks: readonly TurnOnCheck[], level: Level): TurnOnMode[] {
  const failing = (id: TurnOnCheckId) => checks.find((c) => c.id === id && checkStops(c, "automatic"))
  const grace = failing("grace")
  const batch = failing("firstBatchSize")
  let reason: string | null = null
  if (failing("dryRuns")) reason = "Needs one finished dry run."
  else if (grace) reason = `Needs a grace period of ${grace.values.min} days or more.`
  else if (batch) {
    reason = `Not for this first batch, because it is more than ${FIRST_BATCH_PERCENT} % of the ${ITEMS[level]} checked ` +
      `(${batch.values.count} of ${batch.values.checked}). After the first batch, change the mode.`
  }
  return [{ mode: "reviewFirst", allowed: true }, reason ? { mode: "automatic", allowed: false, reason } : { mode: "automatic", allowed: true }]
}
