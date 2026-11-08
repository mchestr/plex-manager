/**
 * The safety stops of one live rule (TS 8.2): `ruleBlocks()`, the services it
 * reads (`ruleSources()`), the history window it needs (`windowDays()`) and the
 * shrink check (`sourceShrank()`). Pure and client-safe: the run, the act step,
 * the preview and the turn-on page share it. Global protection needs: TS 5.3.
 *
 * A rule's protections count like its conditions, for sources and window: a
 * protection that cannot see an old play protects nothing. A failed source
 * gets its `sourceFailed` stop only: its history and row counts are not judged.
 * `readFailed` comes from the act step (TS 8.8 step 4), not from here.
 *
 * @module lib/cleanup/rule-blocks
 */

import type { Block } from "@/lib/cleanup/blocks"
import { NEVER_WINDOW_DAYS, STALE_DATA_HOURS, TAUTULLI_STALE_DAYS } from "@/lib/cleanup/constants"
import type { CompiledRule } from "@/lib/cleanup/engine/types"
import type { RowCounter, SnapshotFacts, SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import { type Condition, durationDays, type RuleDefinition } from "@/lib/validations/cleanup-rule"
import { FIELD_SOURCES, LEVEL_ARR, type Level, SERVICES, type Service } from "@/lib/validations/cleanup-vocabulary"

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

/** A stored definition, or a compiled draft (the preview). */
export type BlockRule = Pick<RuleDefinition, "level" | "conditions" | "protections"> | Pick<CompiledRule, "scope" | "clauses" | "protections">

/** The newest complete snapshot: its header and its parsed facts. */
export interface BlockSnapshot {
  finishedAt: Date | string
  sources: readonly SourceStatus[]
  facts: SnapshotFacts
}

export interface BlockContext {
  now: number // epoch ms
  options: CleanupOptions
  ruleId?: string // set on every block, so a run's stops name their rule
}

/** The global protections that read a service (TS 5.3). G1, G2, G3, G6 and G10 need none. G9 reads the level's arr. */
const GLOBAL_NEEDS = [["g4", "tautulli"], ["g5", "tautulli"], ["g7", "overseerr"], ["g8", "plex"], ["g9", "arr"], ["g11", "sonarr"],
  ["g12", "tautulli"], ["g13", "plex"]] as const
type NeedId = (typeof GLOBAL_NEEDS)[number][0]
const SEASONS_ONLY: readonly NeedId[] = ["g11", "g12"]
const WINDOW_GLOBALS = ["g4", "g5", "g7", "g12"] as const // their days count in `windowDays` (TS 8.2)

const time = (value: Date | string) => (typeof value === "string" ? Date.parse(value) : value.getTime())
const inLevel = (id: NeedId, level: Level) => level === "season" || !SEASONS_ONLY.includes(id)

/** The level and every condition of a rule: top-level, group members and rule protections. */
function partsOf(rule: BlockRule): { level: Level; conditions: Condition[] } {
  if ("scope" in rule) {
    const clauses = rule.clauses.flatMap((c) => (c.kind === "group" ? c.conditions : [c.condition]))
    return { level: rule.scope.level, conditions: [...clauses, ...rule.protections] }
  }
  return { level: rule.level, conditions: [...rule.conditions.flatMap((c) => ("kind" in c ? c.conditions : [c])), ...rule.protections] }
}

const notSetUp = (service: Service, sources: readonly SourceStatus[]) =>
  sources.some((s) => s.service === service) && sources.every((s) => s.service !== service || s.state === "notConfigured")

/**
 * The services a rule reads, in `SERVICES` order (TS 8.2): Plex, the level's arr, each condition's sources (Tautulli
 * too for an `inactive` requester) and the needs of the enabled global protections of the level. A service that is
 * not set up (`notConfigured` in `sources`) is left out: its conditions are Unknown and match nothing.
 */
export function ruleSources(rule: BlockRule, options: CleanupOptions, sources: readonly SourceStatus[] = []): Service[] {
  const { level, conditions } = partsOf(rule)
  const used = new Set<Service>(["plex", LEVEL_ARR[level]])
  for (const c of conditions) {
    for (const service of FIELD_SOURCES[c.field][level]) used.add(service)
    if (c.field === "request.by" && c.value.requesters.some((ref) => ref.kind === "inactive")) used.add("tautulli")
  }
  for (const [id, need] of GLOBAL_NEEDS) {
    if (options.protections[id].enabled && inLevel(id, level)) used.add(need === "arr" ? LEVEL_ARR[level] : need)
  }
  return SERVICES.filter((service) => used.has(service) && !notSetUp(service, sources))
}

function conditionWindow(c: Condition): number {
  switch (c.field) {
    case "watch.lastPlayed": {
      if (c.op === "never") return NEVER_WINDOW_DAYS
      const days = durationDays(c.value.duration)
      return c.op === "moreThan" && c.value.orNever ? Math.max(days, NEVER_WINDOW_DAYS) : days
    }
    case "watch.plays":
      return c.value.window.kind === "total" ? NEVER_WINDOW_DAYS : durationDays(c.value.window.duration)
    case "request.requesters":
      return NEVER_WINDOW_DAYS
    case "request.by":
      return Math.max(0, ...c.value.requesters.map((ref) => (ref.kind === "inactive" ? ref.days : 0)))
    default:
      return 0
  }
}

/** The days of Tautulli history a rule needs (TS 8.2 table): the largest window of its conditions and global protections. */
export function windowDays(rule: BlockRule, options: CleanupOptions): number {
  const { level, conditions } = partsOf(rule)
  const globals = WINDOW_GLOBALS.filter((id) => options.protections[id].enabled && inLevel(id, level)).map((id) => options.protections[id].days)
  return Math.max(0, ...conditions.map(conditionWindow), ...globals)
}

/** The shrink test (TS 8.2 step 6): more than 10 % below the baseline, or 0 with a baseline above 0. */
export const countShrank = (rows: number, baseline: number) => rows * 10 < baseline * 9

const statusOf = (snapshot: BlockSnapshot, service: Service) => snapshot.sources.find((s) => s.service === service)
const failedStatus = (snapshot: BlockSnapshot, service: Service) => snapshot.sources.find((s) => s.service === service && s.state === "failed")
const COUNTERS: { counter: RowCounter; service: "overseerr" | "tautulli"; rows: (s: BlockSnapshot) => number | undefined }[] = [
  { counter: "overseerrRequests", service: "overseerr", rows: (s) => statusOf(s, "overseerr")?.rows },
  { counter: "tautulliRows", service: "tautulli", rows: (s) => statusOf(s, "tautulli")?.rows },
  { counter: "usersWithPlay", service: "tautulli", rows: (s) => s.facts.history.usersWithPlay },
]

/** The `sourceShrank` stops of the services a rule reads, against the snapshot's own `facts.rowBaseline`. No baseline passes. */
export function sourceShrank(snapshot: BlockSnapshot, services: readonly Service[]): Block[] {
  return COUNTERS.flatMap(({ counter, service, rows: read }): Block[] => {
    const rows = read(snapshot)
    const baseline = snapshot.facts.rowBaseline[counter]
    if (!services.includes(service) || failedStatus(snapshot, service) || rows === undefined || baseline === undefined) return []
    return countShrank(rows, baseline) ? [{ code: "sourceShrank", service, counter, rows, previousRows: baseline }] : []
  })
}

const failedBlock = ({ service, readAt, errorCode }: SourceStatus): Block =>
  ({ code: "sourceFailed", service, ...(readAt ? { readAt } : {}), ...(errorCode ? { errorCode } : {}) })

/** Every safety stop of one live rule, in the order of TS 8.2. `snapshot` null: no complete library data yet. */
export function ruleBlocks(rule: BlockRule, snapshot: BlockSnapshot | null, ctx: BlockContext): Block[] {
  const tag = (block: Block): Block => (ctx.ruleId === undefined ? block : { ...block, ruleId: ctx.ruleId })
  if (!snapshot) return [tag({ code: "noData" })]
  const blocks: Block[] = []
  const age = ctx.now - time(snapshot.finishedAt)
  if (age > STALE_DATA_HOURS * HOUR_MS) blocks.push({ code: "dataStale", hours: Math.floor(age / HOUR_MS) })
  const services = ruleSources(rule, ctx.options, snapshot.sources)
  // The plex.tv share list is a Plex row too, so its NO_OWNER code reaches the block
  for (const failed of services.map((service) => failedStatus(snapshot, service))) if (failed) blocks.push(failedBlock(failed))
  if (services.includes("tautulli") && !failedStatus(snapshot, "tautulli")) {
    const { newestAt, startAt } = snapshot.facts.history
    if (newestAt === null || ctx.now - newestAt * 1000 > TAUTULLI_STALE_DAYS * DAY_MS) blocks.push({ code: "tautulliStale" })
    const days = windowDays(rule, ctx.options)
    if (startAt === null || startAt * 1000 > ctx.now - days * DAY_MS) blocks.push({ code: "historyShort", days })
  }
  return [...blocks, ...sourceShrank(snapshot, services)].map(tag)
}
