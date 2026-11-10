/**
 * Safety stops and run outcomes of media cleanup (TS 8.2), as stored in
 * `CleanupRun.blocks`, `CleanupRun.outcome` and `RuleStats.lastEval.blocks`,
 * with the words of UX 8.7 and X6. Client-safe.
 *
 * `blockLabel()` gives the run outcome text (History). `blockCause()` gives the
 * cause line of the rule card footer and the page alerts. A stored code that a
 * newer build wrote shows raw, as `inactivityBlockLabel()` does.
 *
 * `ruleBlocks()` (lib/cleanup/rule-blocks.ts) builds the blocks of one rule. A
 * `sourceFailed` block carries the source's `errorCode`, so a Plex share list
 * without an owner account (`NO_OWNER`, TS 7.3 step 2) gets its own words.
 *
 * @module lib/cleanup/blocks
 */

import { z } from "zod"

import { parseStoredRows, ROW_COUNTERS, type RowCounter } from "@/lib/cleanup/schema/snapshot"
import { TAUTULLI_STALE_DAYS } from "@/lib/inactivity/blocks"
import { SERVICES, type Service } from "@/lib/validations/cleanup-vocabulary"

/** TS 8.2, plus `invalid`: a stored rule definition that does not parse, so the run skips the rule (TS 8.3 step 6). */
export const BLOCK_CODES = ["off", "paused", "redis", "noData", "dataStale", "sourceFailed", "tautulliStale",
  "historyShort", "sourceShrank", "readFailed", "busy", "auditFailed", "stopped", "arrRefused", "invalid"] as const

export const blockSchema = z.object({
  code: z.string().max(40), // a BLOCK_CODES value; an unknown stored code shows raw
  service: z.enum(SERVICES).optional(), ruleId: z.string().optional(),
  hours: z.number().int().optional(), days: z.number().int().optional(), readAt: z.iso.datetime().optional(),
  rows: z.number().int().optional(), previousRows: z.number().int().optional(), // sourceShrank: the count and its baseline
  counter: z.enum(ROW_COUNTERS).optional(), // sourceShrank
  errorCode: z.string().max(40).optional(), // sourceFailed: the source status errorCode (NO_OWNER has its own words)
})
export type Block = z.infer<typeof blockSchema>

export const RUN_OUTCOMES = ["finished", "dryRun", "blocked", "held", "paused", "busy", "stopped", "auditFailed", "arrRefused", "noData"] as const
export type RunOutcome = (typeof RUN_OUTCOMES)[number]

/** The source status `errorCode` of a Plex server with no owner account (TS 7.3 step 2). */
export const NO_OWNER_ERROR_CODE = "NO_OWNER"
/** The words of a `NO_OWNER` stop: the run outcome, and the footer cause and page alert (TS 8.2, safety-r2-11). @internal */
export const NO_OWNER_WORDS = {
  outcome: "Safety stop: Plex has no owner account for this server",
  cause: "Plex has no owner account for this server. Reconnect Plex in Settings.",
} as const

/** What `{counted}` names in the `sourceShrank` words (ux-a11y-r2-10). */
export const COUNTED_WORDS: Record<RowCounter, string> = {
  overseerrRequests: "requests",
  tautulliRows: "plays in the history",
  usersWithPlay: "members with a play",
}

export interface BlockWords {
  /** "Tautulli", "Radarr", ... */
  service: (service: Service) => string
  /** A rule's name; "A deleted rule" for a rule that is gone. */
  rule: (ruleId: string) => string
}

export interface BlockCauseWords extends BlockWords {
  /** A stored instant as the time of day the admin reads ("3:07 AM"). */
  time: (iso: string) => string
}

const isNoOwner = (block: Block) => block.code === "sourceFailed" && block.errorCode === NO_OWNER_ERROR_CODE

function serviceOf(block: Block, words: BlockWords): string {
  return block.service ? words.service(block.service) : "A service"
}

function shrank(block: Block, words: BlockWords): string {
  const counted = block.counter ? ` ${COUNTED_WORDS[block.counter]}` : ""
  return `${serviceOf(block, words)} returned ${block.rows ?? 0}${counted}, ${block.previousRows ?? 0} before`
}

/** The run outcome text of a block (History, UX 8.7 and X6). */
export function blockLabel(block: Block, words: BlockWords): string {
  if (isNoOwner(block)) return NO_OWNER_WORDS.outcome
  switch (block.code) {
    case "sourceFailed":
      return `Safety stop: ${serviceOf(block, words)} did not answer`
    case "tautulliStale":
      return `Safety stop: Tautulli recorded no play in ${TAUTULLI_STALE_DAYS} days`
    case "historyShort":
      return block.ruleId
        ? `Safety stop: Tautulli history is shorter than the window of ${words.rule(block.ruleId)}`
        : "Safety stop: Tautulli history is shorter than the window of the rule"
    case "dataStale":
      return block.hours === undefined ? "Safety stop: library data is too old" : `Safety stop: library data is ${block.hours} hours old`
    case "noData":
      return "Safety stop: no library data yet"
    case "sourceShrank":
      return `Safety stop: ${shrank(block, words)}`
    case "readFailed":
      return "Safety stop: tonight's library read failed, so nothing was deleted"
    case "off":
    case "paused":
      return "Paused: nothing changed"
    case "redis":
      return "Not started: Redis is not set up"
    case "busy":
      return "Not started: another run was in progress"
    case "auditFailed":
      return "Stopped: the app did not write an audit row"
    case "stopped":
      return "Stopped: the server shut down"
    case "arrRefused":
      return `Stopped: ${serviceOf(block, words)} refused the API key`
    case "invalid":
      return "Skipped: the saved rule could not be read"
    default:
      return block.code
  }
}

/** The cause line of a block: the rule card footer and the page alerts (TS 8.2). */
export function blockCause(block: Block, words: BlockCauseWords): string {
  if (isNoOwner(block)) return NO_OWNER_WORDS.cause
  switch (block.code) {
    case "sourceFailed":
      return block.readAt
        ? `${serviceOf(block, words)} did not answer at ${words.time(block.readAt)}.`
        : `${serviceOf(block, words)} did not answer.`
    case "tautulliStale":
      return `Tautulli recorded no play in ${TAUTULLI_STALE_DAYS} days.`
    case "historyShort":
      return block.days === undefined
        ? "Tautulli history is shorter than the window of the rule."
        : `Tautulli history is shorter than the ${block.days}-day window.`
    case "dataStale":
      return block.hours === undefined ? "Library data is too old." : `Library data is ${block.hours} hours old.`
    case "noData":
      return "No library data yet."
    case "sourceShrank":
      return `${shrank(block, words)}. If you expect this, press Refresh data now: a read that you start and that agrees clears this stop.`
    case "readFailed":
      return "Tonight's library read failed."
    case "off":
      return "Media cleanup is off."
    case "paused":
      return "Cleanup is paused."
    case "redis":
      return "Redis is not set up."
    case "busy":
      return "Another run was in progress."
    case "auditFailed":
      return "The app did not write an audit row."
    case "stopped":
      return "The server shut down."
    case "arrRefused":
      return `${serviceOf(block, words)} refused the API key.`
    case "invalid":
      return "The saved rule could not be read."
    default:
      return block.code
  }
}

/** Stored blocks (`CleanupRun.blocks`). Never throws: bad rows are dropped and logged by issue path. */
export function parseBlocks(raw: unknown): Block[] {
  return parseStoredRows("blocks", blockSchema, raw).rows
}
