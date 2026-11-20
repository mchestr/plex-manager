/**
 * The words of a History run (UX 4.9 item 1, 8.7): its outcome, who started
 * it, and when, as "Today, 3:07 AM". Pure and client-safe.
 *
 * | Outcome | Words |
 * |---|---|
 * | `finished` | "Finished", "Finished. {N} {items} wait for your approval.", "Finished. {N} failed: {cause}." |
 * | `dryRun` | "Dry run of {rule}: {N} matches" |
 * | `held` | "Held: {N} new matches wait for your approval" |
 * | `stopped`, or no `finishedAt` | "Stopped: the server shut down" |
 * | a safety stop, `paused`, `busy`, ... | `blockLabel()` of its first block, else the outcome's own words |
 *
 * @module components/admin/cleanup/history/run-outcome
 */

import { type Block, blockLabel } from "@/lib/cleanup/blocks"
import { plural } from "@/lib/cleanup/action-words"
import { SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { HistoryRun } from "@/lib/cleanup/types/list-parts"
import { addDays } from "@/lib/ui/date-range"
import type { BoundFormat } from "@/lib/utils/format"
import { dayKey } from "@/lib/utils/zoned-time"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** The words of an outcome that has no block to name it. */
const OUTCOME_WORDS: Record<string, string> = {
  stopped: "Stopped: the server shut down",
  auditFailed: "Stopped: the app did not write an audit row",
  paused: "Paused: nothing changed",
  busy: "Not started: another run was in progress",
  noData: "Safety stop: no library data yet",
  blocked: "Safety stop",
  arrRefused: "Stopped: the arr app refused the API key",
}

const levelOf = (value: string | number | undefined): Level | "title" =>
  value === "movie" || value === "show" || value === "season" ? value : "title"
const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`)

/** The block that the outcome names: the first stop of the run, with `stopped` for a run that did not finish. */
function outcomeBlock(run: Pick<HistoryRun, "blocks" | "outcome">): Block | undefined {
  if (run.outcome === "stopped") return run.blocks.find((block) => block.code === "stopped") ?? { code: "stopped" }
  return run.blocks[0]
}

/** The outcome of a run, from its code and values (UX 8.7). A `historyShort` stop names its rule from the run's rules. */
export function runOutcomeText(run: Pick<HistoryRun, "outcome" | "outcomeValues" | "blocks" | "finishedAt" | "rules">): string {
  const outcome = run.finishedAt === null ? "stopped" : run.outcome
  const values = run.outcomeValues
  const rule = (id: string) => run.rules.find((named) => named.id === id)?.name ?? "A deleted rule"
  switch (outcome) {
    case null:
    case "finished": {
      if (typeof values.waiting === "number" && values.waiting > 0) return `Finished. ${plural(values.waiting, levelOf(values.level))} wait for your approval.`
      if (typeof values.failed === "number" && values.failed > 0) {
        return values.cause ? `Finished. ${values.failed} failed: ${sentence(String(values.cause))}` : `Finished. ${values.failed} failed.`
      }
      return "Finished"
    }
    case "dryRun": {
      const matches = Number(values.matches ?? 0)
      return `Dry run of ${values.rule ?? "a rule"}: ${matches} ${matches === 1 ? "match" : "matches"}`
    }
    case "held": {
      const count = Number(values.count ?? 0)
      return `Held: ${count} new ${count === 1 ? "match waits" : "matches wait"} for your approval`
    }
    default: {
      const block = outcomeBlock({ ...run, outcome })
      if (block) return blockLabel(block, { service: (service) => SERVICE_NAMES[service], rule })
      return OUTCOME_WORDS[outcome] ?? outcome
    }
  }
}

/** "The schedule", "You", or the admin's name (UX 4.9 item 1). */
export function startedByWords(run: Pick<HistoryRun, "trigger" | "actor">): string {
  if (run.trigger === "scheduled" || run.actor === null) return "The schedule"
  return run.actor.isYou ? "You" : run.actor.name
}

/** "Today, 3:07 AM", "Yesterday, 3:07 AM" or "Nov 6, 9:42 PM" in the app zone. `now` is epoch ms. */
export function startedWords(iso: string, now: number, f: BoundFormat): string {
  const zone = f.settings.timeZone
  const day = dayKey(Date.parse(iso), zone)
  const today = dayKey(now, zone)
  const prefix = day === today ? "Today" : day === addDays(today, -1) ? "Yesterday" : f.dayKey(day, "day-month-short")
  return `${prefix}, ${f.time(iso)}`
}
