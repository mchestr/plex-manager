/**
 * One dry run of the production pipeline (P7.10): `generateUserRewind` in
 * `dry-run` mode, on a member (their real context and Tautulli history) or on
 * a golden fixture (its rows through `fixtureSource()`, with this server's
 * LLM settings, provider, style guide and season spend).
 *
 * ```
 * member  ─► generateUserRewind({ mode: "dry-run", kind: "admin" })
 * fixture ─► fixtureInputs ─► generateUserRewind({ mode: "dry-run", source }, fixture context)
 * ```
 *
 * Neither writes a `PlexWrapped`, `RewindGeneration` or `RewindView` row;
 * billed model calls write `LLMUsage` rows with the prompt version and no
 * generation id. A fixture run with the model `replay:selected` (P7.11)
 * answers from the selected model's recordings instead, as that model on a
 * server with the LLM on, and bills nothing.
 *
 * @module lib/rewind/dry-run/run
 */

import "server-only"

import { fixtureInputs } from "@/evals/rewind/__tests__/member-stats"
import { FIXTURE_USER_ID } from "@/evals/rewind/__tests__/stats-inputs"
import type { Fixture } from "@/evals/rewind/fixture-schema"
import { isLLMProviderId } from "@/lib/llm/provider-presets"
import { replayGenerate, selectedReplay, type ReplaySource } from "@/lib/llm/replay"
import { prisma } from "@/lib/prisma"
import { generateUserRewind, type GenerateUserOptions, type GenerateUserResult } from "@/lib/wrapped/pipeline/generate-user"
import type { RewindContext } from "@/lib/wrapped/pipeline/load-context"
import { findRewindStyleGuide } from "@/lib/wrapped/prompt/store"
import { resolveZone } from "@/lib/wrapped/time/zone"

import { readDryRunFixture } from "./fixtures"
import { REPLAY_SELECTED, type DryRunInput } from "./input"

const stringList = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [])

/** A fixture member on this server: Rewind on, the fixture's zone and window, the server's LLM settings. */
async function fixtureContext(fixture: Fixture, inputs: Awaited<ReturnType<typeof fixtureInputs>>): Promise<RewindContext> {
  const year = fixture.window.year
  const [config, provider, styleGuide, spent] = await Promise.all([
    prisma.config.findUnique({ where: { id: "config" } }),
    prisma.lLMProvider.findFirst({ where: { isActive: true, purpose: "wrapped" }, select: { provider: true, model: true } }),
    findRewindStyleGuide(),
    prisma.lLMUsage.aggregate({ where: { generation: { year } }, _sum: { cost: true } }),
  ])
  return {
    userId: FIXTURE_USER_ID,
    year,
    kind: "admin",
    through: `${year}-${fixture.window.finalCut ? "12-31" : "11-30"}`,
    finalCut: fixture.window.finalCut,
    member: { userId: FIXTURE_USER_ID, name: fixture.member.userName ?? fixture.member.displayName, plexUserId: "1", isAdmin: false },
    zone: resolveZone({ timezone: fixture.member.timezone }, fixture.server.zone),
    window: inputs.ctx.window,
    config: {
      rewindEnabled: true,
      rewindAudience: "all",
      rewindIncludeManagedUsers: false,
      stripeEnabled: false,
      llmDisabled: config?.llmDisabled ?? false,
      llmMode: config?.rewindLlmMode ?? "standard",
      budgetUsd: Number(config?.rewindLlmBudgetUsd ?? 10),
      locale: config?.locale ?? "en-US",
      excludedSectionIds: [],
      excludedContentRatings: [],
      disabledPages: stringList(config?.rewindDisabledPages),
    },
    tautulli: null,
    overseerr: null,
    hiddenKeys: inputs.ctx.hiddenKeys,
    aggregate: null,
    serial: "K7Q4",
    nthRewind: 1,
    wrappedId: null,
    previous: null,
    llmProvider: provider && isLLMProviderId(provider.provider) && provider.model ? { provider: provider.provider, model: provider.model } : null,
    spentUsd: spent._sum.cost ?? 0,
    styleGuide,
  }
}

/** Thrown when the fixture in the input no longer exists. */
export class UnknownFixtureError extends Error {}

/** The fixture context as the replayed model's server sees it: that provider, the LLM on, nothing spent. */
function replayContext(ctx: RewindContext, source: ReplaySource): RewindContext {
  return {
    ...ctx,
    config: { ...ctx.config, llmDisabled: false, llmMode: "standard" },
    llmProvider: { provider: source.model.provider, model: source.model.id },
    spentUsd: 0,
  }
}

/** Runs the dry run the input describes; see the module comment. */
export async function runDryRun(input: DryRunInput, signal: AbortSignal): Promise<GenerateUserResult> {
  const options = {
    kind: "admin",
    mode: "dry-run",
    copyPolicy: input.copyPolicy,
    signal,
    model: input.model,
    promptVersion: input.promptVersion,
    effort: input.effort,
    styleGuide: input.styleGuide,
  } satisfies Partial<GenerateUserOptions>
  const { subject } = input
  const replay = input.model === REPLAY_SELECTED
  if (subject.kind === "member") {
    if (replay) throw new Error("Recorded answers exist only for fixtures")
    return generateUserRewind({ ...options, userId: subject.userId, year: input.year })
  }

  const fixture = await readDryRunFixture(subject.fixtureId)
  if (!fixture) throw new UnknownFixtureError(subject.fixtureId)
  const source = replay ? selectedReplay() : null
  if (replay && !source) throw new Error("No selected model has recordings to replay")
  const inputs = await fixtureInputs(fixture)
  const ctx = await fixtureContext(fixture, inputs)
  return generateUserRewind(
    {
      ...options,
      model: source ? undefined : options.model,
      userId: FIXTURE_USER_ID,
      year: fixture.window.year,
      source: async () => ({ events: inputs.events, sources: inputs.sources }),
    },
    {
      loadContext: async () => (source ? replayContext(ctx, source) : ctx),
      checkEligibility: async () => ({ ok: true }),
      ...(source && { generate: replayGenerate(source, subject.fixtureId), consume: async () => ({ ok: true as const }) }),
    }
  )
}
