/**
 * One member's v3 Rewind, end to end (design 9.2): the one function the
 * generation job, the playground's dry runs and the tests call.
 *
 * ```
 * load-context ─► eligibility ─► read-inputs ─► computeMemberStats
 *   ─► build-issue (archetype, facts, factsHash, edition, pages)
 *   ─► copy-step (reuse │ no-llm │ templates │ LLM + grounding + repair + fallback)
 *   ─► RewindDataV3 ─► persist (one transaction) │ dry run (validate only)
 * ```
 *
 * A failed eligibility check returns `skipped` with its typed reason. An
 * upstream failure throws `RewindGenerationError` (`UPSTREAM_ERROR` is
 * retryable); a model failure never fails the run, it only turns slots into
 * templates. A dry run writes no `PlexWrapped` or `RewindGeneration` row, and
 * its billed `LLMUsage` rows carry `promptVersion` but no `generationId`.
 *
 * @module lib/wrapped/pipeline/generate-user
 */

import "server-only"

import { findTautulliUser } from "@/lib/connections/tautulli"
import { getAccessLevel } from "@/lib/access"
import { generateStructured } from "@/lib/llm/generate-structured"
import type { EffortLevel } from "@/lib/llm/models"
import { effectiveRewindLlmMode } from "@/lib/wrapped/config"
import { redisLimiter } from "@/lib/queue/redis-semaphore"
import { checkRewindInfra } from "@/lib/queue/rewind-infra"
import type { RewindGenerationKind } from "@/lib/rewind/enqueue-generation"
import { consume, type ConsumeResult } from "@/lib/security/rate-limit"
import { createLogger } from "@/lib/utils/logger"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { buildFactSheet, type FactSheet } from "@/lib/wrapped/facts/fact-sheet"
import type { FactId } from "@/lib/wrapped/facts/catalogue"
import { STATS_VERSION } from "@/lib/wrapped/facts/hash"
import { PROMPT_VERSION } from "@/lib/wrapped/prompt/rewind-2026"
import { dataThroughDate } from "@/lib/wrapped/aggregate/window"
import { computeMemberStats } from "@/lib/wrapped/stats/compute"
import { dayKey } from "@/lib/wrapped/time/zone"

import { buildIssue, disagreesWithAggregate, withArchetype, type IssueInput } from "./build-issue"
import type { GenerateFn } from "./copy-llm"
import { runCopyStep, type CopyTrail } from "./copy-step"
import { checkEligibility, type GenerationAudience, type SkipReason } from "./eligibility"
import { loadRewindContext, type RewindContext } from "./load-context"
import { persistRewind, validateRewind } from "./persist"
import { readMemberInputs, type MemberInputs } from "./read-inputs"

const logger = createLogger("REWIND_PIPELINE")

export interface GenerateUserOptions {
  userId: string
  year: number
  kind: RewindGenerationKind
  /** The batch's last data day (`YYYY-11-30` or `YYYY-12-31`); defaults to the current one. */
  through?: string
  mode: "persist" | "dry-run"
  copyPolicy: "default" | "no-llm"
  signal: AbortSignal
  /** Persist mode: the run's `RewindGeneration` row. */
  generationId?: string
  /** A model on the Rewind provider for this run only (dry runs and the bake-off). */
  model?: string
  promptVersion?: string
  /** The copy call's reasoning effort for this run only (dry runs). */
  effort?: EffortLevel
  /** Replaces the stored style guide for this run (the playground). */
  styleGuide?: string | null
  /** The fan-out's audience (P7.8); `config` when absent. */
  audience?: GenerationAudience
  /** Reads the member's inputs instead of Tautulli and the batch cache (fixtures). */
  source?: (ctx: RewindContext) => Promise<MemberInputs>
}

interface GenerationTrail {
  factSheet: FactSheet
  edition: RewindDataV3["edition"]
  pages: string[]
  omitted: Array<{ folio: number; reason: "PAGE_RULE" }>
  archetype: RewindDataV3["archetype"]
  copy: CopyTrail
}

export type GenerateUserResult =
  | { status: "skipped"; reason: SkipReason }
  | { status: "completed"; data: RewindDataV3; trail: GenerationTrail }

/** What the pipeline reads and calls, injectable for tests and the eval harness. */
export interface PipelineDeps {
  loadContext: typeof loadRewindContext
  checkEligibility: (ctx: RewindContext, audience: GenerationAudience) => ReturnType<typeof checkEligibility>
  /** The model call; `generateStructured` on the stored provider row by default. */
  generate?: GenerateFn
  /** The `rw:llm` limit; the Redis limiter by default. */
  consume?: (provider: string) => Promise<ConsumeResult>
}

const defaultDeps: PipelineDeps = {
  loadContext: loadRewindContext,
  checkEligibility: (ctx, audience) =>
    checkEligibility(
      { kind: ctx.kind, member: ctx.member, config: ctx.config, tautulli: ctx.tautulli, audience },
      { checkInfra: checkRewindInfra, findTautulliUser, accessLevel: getAccessLevel }
    ),
}

/** Generates (or, in a dry run, only builds) the member's v3 Rewind. */
export async function generateUserRewind(options: GenerateUserOptions, deps: PipelineDeps = defaultDeps): Promise<GenerateUserResult> {
  const { userId, year, signal } = options
  const ctx = await deps.loadContext({ userId, year, kind: options.kind, through: options.through })
  const eligibility = await deps.checkEligibility(ctx, options.audience ?? "config")
  if (!eligibility.ok) return { status: "skipped", reason: eligibility.reason }

  const inputs = await (options.source ?? ((c) => readMemberInputs(c, { signal, limiter: redisLimiter })))(ctx)
  const statsCtx = { zone: ctx.zone.zone, window: ctx.window, finalCut: ctx.finalCut, hiddenKeys: ctx.hiddenKeys }
  const issueInput: IssueInput = {
    userId,
    year,
    stats: computeMemberStats(inputs.events, statsCtx, inputs.sources),
    member: { name: ctx.member.name, nthRewind: ctx.nthRewind, serial: ctx.serial },
    window: { ...ctx.window, year, finalCut: ctx.finalCut },
    locale: ctx.config.locale,
    counts: ctx.aggregate && { archetypeCounts: ctx.aggregate.archetypeCounts, scoredMembers: ctx.aggregate.scoredMembers },
    medians: ctx.aggregate?.medians ?? null,
    disabledPages: ctx.config.disabledPages,
  }
  let issue = buildIssue(issueInput)
  if (disagreesWithAggregate(issue.archetype, issueInput.counts)) {
    logger.warn("The member's archetype has no count in the server aggregate", { userId, year, archetype: issue.archetype?.id })
  }

  const promptVersion = options.promptVersion ?? PROMPT_VERSION
  const persist = options.mode === "persist"
  const copy = await runCopyStep({
    userId,
    year,
    edition: issue.edition,
    facts: issue.facts,
    factsHash: issue.factsHash,
    selected: issue.pages.map((p) => p.type),
    archetype: issue.archetype,
    policy: options.copyPolicy,
    promptVersion,
    previous: ctx.previous,
    llm: {
      disabled: ctx.config.llmDisabled,
      mode: effectiveRewindLlmMode({ llmDisabled: ctx.config.llmDisabled, rewindLlmMode: ctx.config.llmMode }),
      provider: ctx.llmProvider,
      budgetReached: ctx.spentUsd >= ctx.config.budgetUsd,
      override: options.model,
    },
    call: {
      generate: deps.generate ?? generateStructured,
      consume: deps.consume ?? ((provider) => consume("rw:llm", provider)),
      signal,
      effort: options.effort,
      styleGuide: options.styleGuide === undefined ? ctx.styleGuide : options.styleGuide,
      attribution: {
        userId,
        wrappedId: persist ? ctx.wrappedId : null,
        generationId: persist ? options.generationId : null,
        promptVersion,
        factsHash: issue.factsHash,
      },
    },
  })
  if (copy.trail.reason) logger.warn("Rewind copy fell back to templates", { userId, year, reason: copy.trail.reason, source: copy.source })
  // A model timeout only templates the copy; the run's own limit or a shutdown stops it here.
  signal.throwIfAborted()
  const inputFactsHash = issue.factsHash
  if (copy.copy && copy.copy.archetype.id !== issue.archetype?.id) issue = withArchetype(issue, issueInput, copy.copy.archetype.id)

  const data = validateRewind({
    version: 3,
    year,
    statsVersion: STATS_VERSION,
    generatedAt: new Date().toISOString(),
    window: { from: dayKey(ctx.window.start, ctx.window.zone), through: dayKey(ctx.window.end - 1, ctx.window.zone), zone: ctx.window.zone, finalCut: ctx.finalCut },
    edition: issue.edition,
    facts: issue.facts,
    pages: issue.pages,
    archetype: issue.archetype,
    copy: copy.copy,
    copySource: copy.source,
    copyMeta: { model: copy.model, promptVersion, slotHashes: copy.slotHashes },
    factsHash: issue.factsHash,
  } satisfies RewindDataV3)

  if (persist) {
    if (!options.generationId || !ctx.wrappedId) throw new Error("A persisted run needs its generation and Rewind rows")
    await persistRewind(data, {
      generationId: options.generationId,
      wrappedId: ctx.wrappedId,
      userId,
      year,
      inputFactsHash,
      copySource: copy.source,
      copyPolicy: options.copyPolicy,
      dataThrough: dataThroughDate(ctx.through),
    })
  }
  const trail: GenerationTrail = {
    factSheet: buildFactSheet(issue.facts, Object.keys(issue.facts) as FactId[]),
    edition: issue.edition,
    pages: issue.pages.map((p) => p.type),
    omitted: issue.omitted.map((folio) => ({ folio, reason: "PAGE_RULE" as const })),
    archetype: issue.archetype,
    copy: copy.trail,
  }
  return { status: "completed", data, trail }
}
