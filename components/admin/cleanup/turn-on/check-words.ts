/**
 * The words and the fix link of each "Ready to turn on" check (UX 4.6, 7.13,
 * 8.7, TS 10.5, X7, X9). A failed check reads as the `VALIDATION` text of
 * `turnOnCleanupRule` (`lib/cleanup/actions/rules/check-words.ts`, a
 * server-only twin that `check-words.test.ts` compares). Client-safe.
 *
 * `firstBatchSize` and `grace` never show as a line: the Automatic card
 * holds their reason (UX 4.6 item 2.3).
 *
 * @module components/admin/cleanup/turn-on/check-words
 */

import type { Route } from "next"

import { readTimeText } from "@/components/admin/cleanup/preview/read-time"
import { cleanup, cleanupRule, cleanupTurnOn, settingsSection } from "@/lib/admin/routes"
import { plural } from "@/lib/cleanup/action-words"
import { type BlockCauseWords, blockCause, blockSchema } from "@/lib/cleanup/blocks"
import { CLEANUP_ERRORS, KOMETA_DOC_URL, TAUTULLI_STALE_DAYS } from "@/lib/cleanup/constants"
import { automaticGraceMessage } from "@/lib/cleanup/editor/errors"
import { NOUNS, SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { TurnOnCheck } from "@/lib/cleanup/types/rule-parts"
import type { BoundFormat } from "@/lib/utils/format"
import { type Level, SERVICES, type Service } from "@/lib/validations/cleanup-vocabulary"

/** A link that fixes a check, or reads more about it. `external` opens in a new tab. */
export interface CheckFix {
  label: string
  href: Route | string
  external?: boolean
}

export interface CheckWords {
  text: string
  fix: CheckFix | null
}

export interface CheckContext {
  ruleId: string
  level: Level
  f: BoundFormat
  /** The server time of the render: "today" of the read time. */
  now: number
}

/** The checks that the "Ready to turn on" card lists. */
export const LISTED = (check: TurnOnCheck): boolean => check.id !== "firstBatchSize" && check.id !== "grace"

/** What a failed library data check adds after its cause (UX 7.13). */
const DATA_NEXT: Record<string, string> = {
  noData: " Refresh data, or wait for the nightly read.",
  sourceFailed: " Refresh data, or wait for the nightly read.",
  dataStale: " Refresh it first.",
}

const num = (value: string | number | undefined): number => Number(value ?? 0)
const str = (value: string | number | undefined): string | null => (typeof value === "string" && value !== "" ? value : null)
const isService = (value: unknown): value is Service => typeof value === "string" && (SERVICES as readonly string[]).includes(value)
const serviceName = (value: string | number | undefined): string => (isService(value) ? SERVICE_NAMES[value] : "The service")

const OPEN_CLEANUP: CheckFix = { label: "Open Media cleanup", href: cleanup() }

function dataText(check: TurnOnCheck, { f }: CheckContext): string {
  const block = blockSchema.safeParse(check.values)
  const words: BlockCauseWords = { service: (service) => SERVICE_NAMES[service], rule: () => "the rule", time: (iso) => f.time(iso) }
  const cause = blockCause(block.success ? block.data : { code: "noData" }, words)
  return `${cause}${DATA_NEXT[String(check.values.code)] ?? ""}`
}

function libraryWords(check: TurnOnCheck, ctx: CheckContext): CheckWords {
  if (check.state !== "ok") return { text: dataText(check, ctx), fix: OPEN_CLEANUP }
  const count = num(check.values.sources)
  const readAt = str(check.values.readAt)
  const at = readAt ? ` at ${readTimeText(ctx.f, readAt, ctx.now)}` : ""
  return { text: `${count === 1 ? "1 source" : `All ${count} sources`} answered${at}.`, fix: null }
}

function historyWords(check: TurnOnCheck, ctx: CheckContext): CheckWords {
  const startAt = str(check.values.startAt)
  const days = num(check.values.days)
  if (check.state === "ok") {
    const starts = startAt ? `Tautulli history starts ${ctx.f.date(startAt)}. That covers` : "Tautulli history covers"
    return { text: `${starts} the ${days}-day window.`, fix: null }
  }
  const starts = startAt ? `Tautulli history starts ${ctx.f.date(startAt)}. That is shorter` : "Tautulli history is shorter"
  return { text: `${starts} than the ${days}-day window of this rule.`, fix: { label: "Edit the rule", href: cleanupRule(ctx.ruleId) } }
}

function arrWords(check: TurnOnCheck, { level }: CheckContext): CheckWords {
  const service = serviceName(check.values.service)
  if (check.state !== "ok") {
    const n = num(check.values.cannotDelete)
    return { text: `${plural(n, level)} cannot be deleted. ${n === 1 ? "It stays" : "They stay"} out of Leaving soon.`, fix: null }
  }
  const count = num(check.values.count)
  const manages = count === 1 ? `${service} manages the ${NOUNS[level][0]}` : `${service} manages all ${plural(count, level)}`
  const by = str(check.values.matchedBy)
  const root = str(check.values.root)
  return { text: `${manages}${by ? `, matched by ${by}` : ""}.${root ? ` Every file is inside ${root}.` : ""}`, fix: null }
}

function dryRunWords(check: TurnOnCheck): CheckWords {
  const count = num(check.values.count)
  const runs = count === 1 ? "1 dry run" : `${count} dry runs`
  if (check.state === "info") return { text: "No finished dry run yet. Automatic needs one.", fix: null }
  if (check.state === "warning") {
    return { text: `${runs}. Matches moved between ${num(check.values.min)} and ${num(check.values.max)}.`, fix: null }
  }
  return { text: `${runs}, with steady matches.`, fix: null }
}

/** The text of a check in its state, and its fix (UX 7.13). */
export function checkWords(check: TurnOnCheck, ctx: CheckContext): CheckWords {
  const { values } = check
  switch (check.id) {
    case "featureOn":
      return check.state === "ok"
        ? { text: "Media cleanup is on.", fix: null }
        : {
            text: CLEANUP_ERRORS.CLEANUP_OFF,
            fix: { label: "Open settings", href: cleanup({ tab: "settings", section: "cleanup-feature", returnTo: cleanupTurnOn(ctx.ruleId) }) },
          }
    case "notPaused":
      return { text: CLEANUP_ERRORS.CLEANUP_PAUSED, fix: OPEN_CLEANUP }
    case "libraryData":
      return libraryWords(check, ctx)
    case "tautulliPlays":
      return { text: `Tautulli recorded no play in ${TAUTULLI_STALE_DAYS} days.`, fix: { label: "Open Tautulli settings", href: settingsSection("tautulli") } }
    case "historyCovers":
      return historyWords(check, ctx)
    case "matchedInArr":
      return arrWords(check, ctx)
    case "dryRuns":
      return dryRunWords(check)
    case "firstBatchSize":
      return {
        text: `Not for this first batch, because it is more than 10 % of the ${NOUNS[ctx.level][1]} checked (${num(values.count)} of ${num(values.checked)}). ` +
          "After the first batch, change the mode.",
        fix: null,
      }
    case "grace":
      return { text: automaticGraceMessage(num(values.min)), fix: null }
    case "kometa":
      return {
        text: "Kometa can delete collections that it does not manage. plex-manager checks every hour and makes the collection again.",
        fix: { label: "Read the Kometa note", href: KOMETA_DOC_URL, external: true },
      }
    default:
      return { text: CLEANUP_ERRORS.CLEANUP_REVIEW_STALE, fix: null }
  }
}
