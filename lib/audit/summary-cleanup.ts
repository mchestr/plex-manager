/**
 * The one-line summaries of the media cleanup audit events (TS 11.3), which
 * `lib/audit/summary.ts` spreads into its table. Each summary parses the
 * details with a Zod object, so it reads only the keys named below. Every word
 * comes from a closed list (levels, modes, origins, changed parts, reasons,
 * block codes, services and failure codes), a count, a day or a size. A rule
 * name, a title, an item key, a tag, a collection name, an id and the
 * definitions in `before` and `after` never reach the line, so Support can
 * read it.
 *
 * | Event                       | Details read                                     | Summary                                                      |
 * |-----------------------------|--------------------------------------------------|--------------------------------------------------------------|
 * | `CLEANUP_RULE_CREATED`      | `level`, `origin`                                | "Movies rule, from a recipe", "Whole shows rule, duplicated" |
 * | `CLEANUP_RULE_CHANGED`      | `changed`, `impact`                              | "Changed: conditions, Then, 4 leave, 2 join"                 |
 * | `CLEANUP_RULE_DELETED`      | `level`, `released`                              | "Deleted a Movies rule, 12 titles released"                  |
 * | `CLEANUP_RULE_MODE_CHANGED` | `from`, `to`, `joined`, `released`               | "Dry run to Review first, 197 joined"                        |
 * | `CLEANUP_PAUSED`            | none                                             | "Paused"                                                     |
 * | `CLEANUP_RESUMED`           | `holdUntil`                                      | "Resumed, nothing deleted before Nov 15"                     |
 * | `CLEANUP_RUN_STARTED`       | `kind`                                           | "Run queued", "Library read queued", "Dry run queued"        |
 * | `CLEANUP_RUN`               | `outcome`, `blocks`, the counts, `freedBytes`    | "Safety stop: Tautulli did not answer", "Dry run: 197 matches", "Joined 12, rescued 2, deleted 3, up to 412 GB" |
 * | `CLEANUP_ITEMS_ENTERED`     | `count`                                          | "12 titles"                                                  |
 * | `CLEANUP_ITEMS_HELD`        | `count`                                          | "12 titles"                                                  |
 * | `CLEANUP_ITEMS_RELEASED`    | `count`, `reason`                                | "12 titles, their library left the rule"                     |
 * | `CLEANUP_BATCH_APPROVED`    | `kind`, `count`, `typed`                         | "Approved 6 deletions, typed", "Approved 52 new matches"     |
 * | `CLEANUP_ITEMS_POSTPONED`   | `count`, `days`, `skipped`                       | "3 titles, 14 days later, 1 skipped"                         |
 * | `CLEANUP_ITEMS_EXCLUDED`    | `count`, `until`, `skipped`                      | "2 titles, until Mar 1, 2027", "1 title, no end date"        |
 * | `CLEANUP_EXCLUSION_CHANGED` | `change`, `until`                                | "Exclusion removed", "End date changed to Mar 1, 2027"       |
 * | `CLEANUP_KEEP_ADDED`        | `until`                                          | "Kept until Feb 6, 2027"                                     |
 * | `CLEANUP_KEEP_ENDED`        | `endedBy`, `restored`                            | "Ended by the member", "Ended by an admin", "Undone"         |
 * | `CLEANUP_ITEM_RESCUED`      | `reason`, `detail.stillUnmonitored`              | "A member played it" (the reason words of TS 11.4)           |
 * | `CLEANUP_ITEM_DELETED`      | `service`, `alreadyGone`, `freedBytes`           | "Deleted in Radarr, up to 17.1 GB", "Already gone in Sonarr" |
 * | `CLEANUP_ITEM_FAILED`       | `service`, `code`, `status`                      | "Radarr returned HTTP 500" (`serviceErrorMessage` words)     |
 *
 * `CLEANUP_SETTINGS_CHANGED` reads as `CONFIG_CHANGED` does, so its summary
 * lives in `lib/audit/summary.ts`. A main key that is missing or of the wrong
 * shape gives no summary (null). A part of the wrong shape, or a zero count
 * in a list of parts, is left out. A day key is shown as stored; an instant is
 * shown in the server zone.
 *
 * @module lib/audit/summary-cleanup
 */

import { z } from "zod"

import type { AuditEventName } from "@/lib/audit/events"
import type { Summarize, SummaryFormat } from "@/lib/audit/summary"
import { type Block, BLOCK_CODES, blockLabel, blockSchema, type BlockWords, RUN_OUTCOMES } from "@/lib/cleanup/blocks"
import { OUTCOME_REASONS, outcomeDetailSchema, type OutcomeWords, outcomeWords } from "@/lib/cleanup/outcomes"
import { serviceErrorMessage, type ServiceErrorCode } from "@/lib/connections/http"
import { STATUS } from "@/lib/ui/status"
import { type DateStyle, formatBytes } from "@/lib/utils/format"
import { type Level, LEVELS, MODES, SERVICES, type Service } from "@/lib/validations/cleanup-vocabulary"

const count = z.number().int().nonnegative()
/** An optional part: a value of the wrong shape reads as absent, so the rest of the line still shows. */
const opt = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined)
const level = z.enum(LEVELS)
const mode = z.enum(MODES)
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const day = z.union([dayKey, z.iso.datetime({ offset: true })])
/** `freedBytes` is a BigInt, stored as a string of digits. */
const bytes = z.union([z.string().regex(/^\d{1,20}$/), count]).transform(Number)

/** A summary that reads only what `schema` parses; details it does not parse have none. */
function from<T>(schema: z.ZodType<T>, words: (details: T, f: SummaryFormat) => string | null): Summarize {
  return (details, f) => {
    const parsed = schema.safeParse(details)
    return parsed.success ? words(parsed.data, f) : null
  }
}

/** The parts that are set, joined with commas. */
const line = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(", ")
/** `text(n)` for a count above 0, else nothing. */
const some = (n: number | undefined, text: (n: number) => string) => (n ? text(n) : undefined)
const counted = (f: SummaryFormat, n: number, one: string, many: string) => `${f.number(n)} ${n === 1 ? one : many}`
const titles = (f: SummaryFormat, n: number) => counted(f, n, "title", "titles")
const dayWords = (f: SummaryFormat, value: string, style: DateStyle = "short") =>
  dayKey.safeParse(value).success ? f.dayKey(value, style) : f.date(value, style)
const upTo = (n: number | undefined) => some(n, (b) => `up to ${formatBytes(b)}`)

const LEVEL_WORDS: Record<Level, string> = { movie: "Movies", show: "Whole shows", season: "Seasons" }
const SERVICE_WORDS: Record<Service, string> = { plex: "Plex", tautulli: "Tautulli", overseerr: "Overseerr", radarr: "Radarr", sonarr: "Sonarr" }
const ORIGIN_WORDS = { recipe: ", from a recipe", duplicate: ", duplicated", blank: "" }
/** The parts of a rule, in the editor's order. */
const CHANGED_WORDS = { name: "name", scope: "scope", conditions: "conditions", protections: "protections", then: "Then" }
const RUN_KIND_WORDS = { run: "Run queued", read: "Library read queued", dryRun: "Dry run queued" }
const RELEASE_WORDS = { ruleOff: "rule left Leaving soon", libraryRemoved: "library left the rule" }

/** No rule name reaches a block's words: the rule of a `historyShort` stop is "the rule". */
const BLOCK_WORDS: BlockWords = { service: (service) => SERVICE_WORDS[service], rule: () => "the rule" }
/** Ids never reach `outcomeWords`, so it uses its fixed words and calls none of the id callbacks. */
const noIds = () => ""
const OUTCOME_WORDS: OutcomeWords = { service: (service) => SERVICE_WORDS[service], protection: noIds, condition: noIds, failure: noIds }

const isService = (value: string): value is Service => (SERVICES as readonly string[]).includes(value)
const SERVICE_ERRORS: readonly string[] = ["TIMEOUT", "ABORTED", "NETWORK", "HTTP", "REDIRECT_BLOCKED", "INVALID_RESPONSE",
  "UPSTREAM_ERROR"] satisfies ServiceErrorCode[]
/** The stop codes of the season checks (TS 8.9), with the cause words of TS 6.9. */
const STOP_WORDS = new Map<string, (service: string) => string>([
  ["noSeasonNumber", () => "The season has no number"],
  ["noArrSeason", () => "Sonarr has no such season"],
  ["outsideArrPath", (service) => `The file is outside ${service}'s root folders`],
])

function failure({ service, code, status }: { service: Service; code: string; status?: number }): string {
  const name = SERVICE_WORDS[service]
  const source = /^sourceFailed:(\w+)$/.exec(code)?.[1]
  if (source) return isService(source) ? `${SERVICE_WORDS[source]} did not answer` : "The delete failed"
  const stop = STOP_WORDS.get(code)
  if (stop) return stop(name)
  return SERVICE_ERRORS.includes(code) ? serviceErrorMessage(name, { ok: false, code, status }) : "The delete failed"
}

/** A stored block: a `Block` object or a bare code. Only a code that `BLOCK_CODES` knows, so its words are fixed. */
function knownBlock(raw: unknown): Block | null {
  const parsed = blockSchema.safeParse(typeof raw === "string" ? { code: raw } : raw)
  return parsed.success && (BLOCK_CODES as readonly string[]).includes(parsed.data.code) ? parsed.data : null
}

const runSchema = z.object({
  outcome: z.enum(RUN_OUTCOMES), blocks: opt(z.array(z.unknown())), matched: opt(count), joined: opt(count), held: opt(count),
  rescued: opt(count), deleted: opt(count), failed: opt(count), freedBytes: opt(bytes),
})

/** Outcome first: a stop in its block words, a dry run's matches, else what the run changed (zero parts left out). */
function run(d: z.infer<typeof runSchema>, f: SummaryFormat): string | null {
  if (d.outcome === "dryRun") return d.matched === undefined ? "Dry run" : `Dry run: ${counted(f, d.matched, "match", "matches")}`
  if (d.outcome === "finished" || d.outcome === "held") {
    const done = line(
      d.outcome === "held" && d.held !== undefined && `held ${counted(f, d.held, "new match", "new matches")} for review`,
      some(d.joined, (n) => `joined ${f.number(n)}`),
      some(d.rescued, (n) => `rescued ${f.number(n)}`),
      some(d.deleted, (n) => `deleted ${f.number(n)}`),
      some(d.failed, (n) => `${f.number(n)} failed`),
      upTo(d.freedBytes)
    )
    return done ? done[0].toUpperCase() + done.slice(1) : "Nothing changed"
  }
  const blocks = (d.blocks ?? []).map(knownBlock).filter((block) => block !== null)
  if (d.outcome === "blocked") return blocks[0] ? blockLabel(blocks[0], BLOCK_WORDS) : "Safety stop"
  // Every other outcome is a block code too: paused, busy, stopped, auditFailed, arrRefused and noData
  return blockLabel(blocks.find((block) => block.code === d.outcome) ?? { code: d.outcome }, BLOCK_WORDS)
}

const itemCount = from(z.object({ count }), ({ count }, f) => titles(f, count))

export const CLEANUP_SUMMARIES: Partial<Record<AuditEventName, Summarize>> = {
  CLEANUP_RULE_CREATED: from(z.object({ level, origin: opt(z.enum(["recipe", "duplicate", "blank"])) }), ({ level, origin }) =>
    `${LEVEL_WORDS[level]} rule${origin ? ORIGIN_WORDS[origin] : ""}`),
  CLEANUP_RULE_CHANGED: from(z.object({ changed: z.array(z.unknown()), impact: opt(z.object({ leave: opt(count), join: opt(count) })) }),
    ({ changed, impact }, f) => {
      const parts = Object.entries(CHANGED_WORDS).flatMap(([key, word]) => (changed.includes(key) ? [word] : []))
      if (parts.length === 0) return null
      return line(`Changed: ${parts.join(", ")}`, some(impact?.leave, (n) => `${f.number(n)} leave`), some(impact?.join, (n) => `${f.number(n)} join`))
    }),
  CLEANUP_RULE_DELETED: from(z.object({ level, released: opt(count) }), ({ level, released }, f) =>
    line(`Deleted a ${LEVEL_WORDS[level]} rule`, some(released, (n) => `${titles(f, n)} released`))),
  CLEANUP_RULE_MODE_CHANGED: from(z.object({ from: mode, to: mode, joined: opt(count), released: opt(count) }), (d, f) =>
    line(`${STATUS.cleanupMode[d.from].label} to ${STATUS.cleanupMode[d.to].label}`,
      some(d.joined, (n) => `${f.number(n)} joined`), some(d.released, (n) => `${f.number(n)} released`))),
  CLEANUP_PAUSED: () => "Paused",
  CLEANUP_RESUMED: from(z.object({ holdUntil: opt(day) }), ({ holdUntil }, f) =>
    holdUntil ? `Resumed, nothing deleted before ${dayWords(f, holdUntil, "day-month-short")}` : "Resumed"),
  CLEANUP_RUN_STARTED: from(z.object({ kind: z.enum(["run", "read", "dryRun"]) }), ({ kind }) => RUN_KIND_WORDS[kind]),
  CLEANUP_RUN: from(runSchema, run),
  CLEANUP_ITEMS_ENTERED: itemCount,
  CLEANUP_ITEMS_HELD: itemCount,
  CLEANUP_ITEMS_RELEASED: from(z.object({ count, reason: opt(z.enum(["ruleOff", "libraryRemoved"])) }), ({ count, reason }, f) =>
    line(titles(f, count), reason && `${count === 1 ? "its" : "their"} ${RELEASE_WORDS[reason]}`)),
  CLEANUP_BATCH_APPROVED: from(z.object({ kind: z.enum(["deletion", "entry"]), count, typed: opt(z.boolean()) }), ({ kind, count, typed }, f) =>
    line(`Approved ${kind === "deletion" ? counted(f, count, "deletion", "deletions") : counted(f, count, "new match", "new matches")}`,
      typed === true && "typed")),
  CLEANUP_ITEMS_POSTPONED: from(z.object({ count, days: count, skipped: opt(count) }), ({ count, days, skipped }, f) =>
    line(titles(f, count), `${counted(f, days, "day", "days")} later`, some(skipped, (n) => `${f.number(n)} skipped`))),
  CLEANUP_ITEMS_EXCLUDED: from(z.object({ count, until: opt(day.nullable()), skipped: opt(count) }), ({ count, until, skipped }, f) =>
    line(titles(f, count), until === null ? "no end date" : until && `until ${dayWords(f, until)}`, some(skipped, (n) => `${f.number(n)} skipped`))),
  CLEANUP_EXCLUSION_CHANGED: from(z.object({ change: z.enum(["removed", "endChanged"]), until: opt(day.nullable()) }), ({ change, until }, f) => {
    if (change === "removed") return "Exclusion removed"
    if (until === null) return "End date removed"
    return until ? `End date changed to ${dayWords(f, until)}` : "End date changed"
  }),
  CLEANUP_KEEP_ADDED: from(z.object({ until: opt(day) }), ({ until }, f) => (until ? `Kept until ${dayWords(f, until)}` : "Kept")),
  CLEANUP_KEEP_ENDED: from(z.object({ endedBy: z.enum(["self", "admin"]), restored: opt(z.boolean()) }), ({ endedBy, restored }) => {
    if (endedBy === "admin") return "Ended by an admin"
    return restored === true ? "Undone" : "Ended by the member"
  }),
  CLEANUP_ITEM_RESCUED: from(
    z.object({ reason: z.enum(OUTCOME_REASONS), detail: opt(outcomeDetailSchema.pick({ stillUnmonitored: true })) }),
    ({ reason, detail }) => outcomeWords(reason, detail ?? {}, OUTCOME_WORDS).replace(/\.$/, "")
  ),
  CLEANUP_ITEM_DELETED: from(z.object({ service: z.enum(["radarr", "sonarr"]), alreadyGone: opt(z.boolean()), freedBytes: opt(bytes) }),
    ({ service, alreadyGone, freedBytes }) =>
      alreadyGone === true ? `Already gone in ${SERVICE_WORDS[service]}` : line(`Deleted in ${SERVICE_WORDS[service]}`, upTo(freedBytes))),
  CLEANUP_ITEM_FAILED: from(z.object({ service: z.enum(SERVICES), code: z.string(), status: opt(z.number().int().min(100).max(599)) }), failure),
}
