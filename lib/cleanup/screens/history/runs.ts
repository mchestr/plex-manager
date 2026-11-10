/**
 * The Runs table of the History tab (UX 4.9 item 1, 8.7, TS 8.3): the newest
 * 30 runs with their counts, the outcome code and the values of its words.
 * Pure and client-safe.
 *
 * A run with no `finishedAt` did not finish (TS 8.3: a database error, or
 * the server shut down), so it reads as stopped: outcome `stopped`, and a
 * `stopped` block for "Stopped: the server shut down".
 *
 * `outcomeValues` holds what the outcome words of UX 8.7 name:
 *
 * | Outcome | Values |
 * |---|---|
 * | `dryRun` | `rule` (the rule name), `matches` ("Dry run of {rule}: {N} matches") |
 * | `held` | `count` ("Held: {N} new matches wait for your approval") |
 * | `finished` | `failed` and `cause` when a title failed ("Finished. {N} failed: {cause}"). The newest live run also gets `waiting` and `level` while a deletion batch waits ("Finished. {N} {items} wait for your approval"); `level` is `movie`, `show`, `season` or `title` for mixed levels. |
 *
 * @module lib/cleanup/screens/history/runs
 */

import { type Block, parseBlocks } from "@/lib/cleanup/blocks"
import type { People } from "@/lib/cleanup/screens/leaving/people"
import type { HistoryRun } from "@/lib/cleanup/types/list-parts"
import type { NamedRule } from "@/lib/cleanup/types/rule-parts"
import type { CleanupRun } from "@/lib/generated/prisma/client"

const KINDS = ["dryRun", "run", "act"] as const
const TRIGGERS = ["scheduled", "admin", "create", "approval"] as const
const pick = <T extends string>(list: readonly T[], value: string, fallback: T): T => list.find((entry) => entry === value) ?? fallback

/** The deletion batch items that wait now, with their level, for the newest live run. */
export interface Waiting {
  count: number
  level: string
}

export interface RunContext {
  people: People
  rule: (ruleId: string) => NamedRule
  /** The cause words of the first failed title of a run. */
  cause: (runId: string) => string | null
  /** The id of the newest finished live run, and what waits now. */
  waiting: { runId: string; value: Waiting } | null
}

function valuesOf(run: CleanupRun, outcome: string | null, ctx: RunContext): HistoryRun["outcomeValues"] {
  if (outcome === "dryRun") return { rule: run.ruleIds.length > 0 ? ctx.rule(run.ruleIds[0]).name : "", matches: run.matched }
  if (outcome === "held") return { count: run.held }
  if (outcome !== "finished") return {}
  const values: HistoryRun["outcomeValues"] = {}
  const cause = run.failed > 0 ? ctx.cause(run.id) : null
  if (run.failed > 0) values.failed = run.failed
  if (cause) values.cause = cause
  if (ctx.waiting?.runId === run.id) {
    values.waiting = ctx.waiting.value.count
    values.level = ctx.waiting.value.level
  }
  return values
}

/** One row of the Runs table. */
export function historyRun(run: CleanupRun, ctx: RunContext): HistoryRun {
  const stopped = run.finishedAt === null
  const stored = parseBlocks(run.blocks)
  const blocks: Block[] = stopped && !stored.some((block) => block.code === "stopped") ? [...stored, { code: "stopped" }] : stored
  const outcome = stopped ? "stopped" : run.outcome
  return {
    id: run.id,
    kind: pick(KINDS, run.kind, "run"),
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    trigger: pick(TRIGGERS, run.trigger, "scheduled"),
    actor: ctx.people.ref(run.actorId),
    rules: run.ruleIds.map(ctx.rule),
    checked: run.checked,
    joined: run.joined,
    rescued: run.rescued,
    deleted: run.deleted,
    failed: run.failed,
    freedBytes: run.freedBytes.toString(),
    outcome,
    outcomeValues: valuesOf(run, outcome, ctx),
    blocks,
    errorCode: run.error,
  }
}

/** The newest finished live run (`run`, outcome `finished`): the one that a waiting batch follows. */
export function newestFinishedRun(runs: readonly Pick<CleanupRun, "id" | "kind" | "outcome" | "finishedAt">[]): string | null {
  return runs.find((run) => run.kind === "run" && run.outcome === "finished" && run.finishedAt !== null)?.id ?? null
}
