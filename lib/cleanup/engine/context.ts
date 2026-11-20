/**
 * `buildEvalContext(input)`: the one `EvalContext` of a preview or a run
 * (TS 4.1), from a stored snapshot and the live facts. It injects the field
 * evaluators and the global protections (deviation D1), so the evaluator
 * calls fields only through `ctx.evals` and `ctx.globals`. Client-safe:
 * the caller reads the snapshot, the live facts and the server zone.
 *
 * Source states: each service takes the state of its source status. A
 * service with no status reads as `failed`, the safe side: its fields are
 * Unknown and its protections never turn inert. The plex.tv share list
 * takes the Plex status with `part: "shares"`. With none, it is
 * `notConfigured` while Plex is, `failed` while any user's access is
 * unknown, and `ok` otherwise.
 *
 * @module lib/cleanup/engine/context
 */

import { FIELD_EVALS } from "@/lib/cleanup/engine/fields"
import { globalProtections } from "@/lib/cleanup/engine/protections"
import type { EvalContext, GlobalProtectionEval, LiveFacts } from "@/lib/cleanup/engine/types"
import type { SnapshotFacts, SnapshotItem, SourceState, SourceStatus } from "@/lib/cleanup/schema/snapshot"
import { dayKey } from "@/lib/utils/zoned-time"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import type { Level, Service } from "@/lib/validations/cleanup-vocabulary"

export interface EvalContextInput {
  /** Epoch ms of the preview or the run. */
  now: number
  /** The server zone (`serverZone()`). */
  zone: string
  /** The snapshot facts that the verdicts read. */
  facts: Pick<SnapshotFacts, "users" | "history" | "membersRead">
  /** The snapshot's source statuses. */
  sources: readonly SourceStatus[]
  /** The show items of the snapshot: season items read their show through them. Items of other levels are left out. */
  shows: Iterable<SnapshotItem>
  live: LiveFacts
  options: CleanupOptions
}

/** The state of each service, from the source statuses. The plex.tv share-list status is not the Plex state. */
function serviceStates(sources: readonly SourceStatus[]): Record<Service, SourceState> {
  const states: Record<Service, SourceState> = { plex: "failed", tautulli: "failed", overseerr: "failed", radarr: "failed", sonarr: "failed" }
  for (const status of sources) if (status.part !== "shares") states[status.service] = status.state
  return states
}

function sharesState(input: EvalContextInput, plex: SourceState): SourceState {
  const status = input.sources.find((s) => s.service === "plex" && s.part === "shares")
  if (status) return status.state
  if (plex === "notConfigured") return "notConfigured"
  return Object.values(input.facts.users).some((user) => user.hasAccess === null) ? "failed" : "ok"
}

/** App `User.id` to plex.tv id, for members with a Plex account (`member` requester refs, TS 4.3). */
function memberPlexIds(live: LiveFacts): Map<string, string> {
  const ids = new Map<string, string>()
  for (const member of live.members) if (member.plexUserId !== null) ids.set(member.userId, member.plexUserId)
  return ids
}

export function buildEvalContext(input: EvalContextInput): EvalContext {
  const sources = serviceStates(input.sources)
  const showsByKey = new Map<string, SnapshotItem>()
  for (const item of input.shows) if (item.level === "show") showsByKey.set(item.key, item)
  const byLevel = new Map<Level, readonly GlobalProtectionEval[]>()
  const reads = { membersRead: input.facts.membersRead }
  return {
    now: input.now,
    today: dayKey(input.now, input.zone),
    zone: input.zone,
    sources,
    shares: sharesState(input, sources.plex),
    history: { startAt: input.facts.history.startAt, newestAt: input.facts.history.newestAt },
    users: new Map(Object.entries(input.facts.users)),
    memberPlexIds: memberPlexIds(input.live),
    showsByKey,
    live: input.live,
    options: input.options,
    evals: FIELD_EVALS,
    // Built once per level: the evaluator asks for them for every item.
    globals(level) {
      const cached = byLevel.get(level)
      if (cached) return cached
      const list = globalProtections(level, input.options, reads)
      byLevel.set(level, list)
      return list
    },
  }
}
