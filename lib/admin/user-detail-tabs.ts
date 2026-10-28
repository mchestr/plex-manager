/**
 * The user detail page's Rewind and Usage tabs (P10.6). Each loader runs only
 * for its own tab. Reads are status columns, counts and sums: never
 * `PlexWrapped.data`, `previousData` or LLM prompt and response text.
 *
 * @module lib/admin/user-detail-tabs
 */

import "server-only"

import { activeRunStarts } from "@/lib/admin/active-runs"
import { canRegenerate, type RewindRowState, rewindRowState } from "@/lib/admin/can-regenerate"
import { lookupModel } from "@/lib/llm/models"
import { isLLMProviderId } from "@/lib/llm/provider-presets"
import { usageTotalsByUser } from "@/lib/llm/usage-totals"
import { prisma } from "@/lib/prisma"
import type { BoundFormat } from "@/lib/utils/format"
import { estimateSeasonCost } from "@/lib/wrapped/admin/estimate"
import { getSeasonBudget } from "@/lib/wrapped/admin/season-estimate"

export interface UserRewindRow {
  wrappedId: string
  year: number
  state: RewindRowState
  edition: string | null
  generatedAt: Date | null
  shared: boolean
  visits: number
  /** A completed run kept the data it replaced, so Roll back has something to restore. */
  canRollBack: boolean
  /** The season year only (`adminRegenerateRewind` refuses others), through `canRegenerate`. */
  canRegenerate: boolean
  /** Stored LLM generations, newest first, for the history pages. */
  versions: { id: string; createdAt: Date }[]
}

/** Every year of the member's Rewind, newest first. */
export async function getUserRewindRows(userId: string, seasonYear: number, now: number): Promise<UserRewindRow[]> {
  const [wrapped, rollbackYears, runs] = await Promise.all([
    prisma.plexWrapped.findMany({
      where: { userId },
      orderBy: { year: "desc" },
      select: {
        id: true,
        year: true,
        status: true,
        edition: true,
        generatedAt: true,
        shareToken: true,
        shares: { where: { revokedAt: null }, select: { id: true }, take: 1 },
        _count: { select: { shareVisits: true } },
        // The history pages' versions, filtered as `getHistoricalWrappedVersions` does
        llmUsage: {
          where: { OR: [{ response: null }, { response: { not: "" } }] },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, createdAt: true },
        },
      },
    }),
    prisma.rewindGeneration.findMany({
      where: { userId, status: "completed", previousData: { not: null } },
      distinct: ["year"],
      select: { year: true },
    }),
    activeRunStarts([userId], seasonYear),
  ])
  const restorable = new Set(rollbackYears.map((row) => row.year))
  const seasonRun = runs.get(userId)

  return wrapped.map((row) => {
    const runStartedAt = row.year === seasonYear ? seasonRun : undefined
    return {
      wrappedId: row.id,
      year: row.year,
      state: rewindRowState(row.status, runStartedAt, now),
      edition: row.edition,
      generatedAt: row.generatedAt,
      shared: Boolean(row.shareToken) || row.shares.length > 0,
      visits: row._count.shareVisits,
      canRollBack: restorable.has(row.year),
      canRegenerate:
        row.year === seasonYear &&
        canRegenerate({ status: runStartedAt ? "generating" : row.status, runStartedAt: runStartedAt ?? null }, now),
      versions: row.llmUsage,
    }
  })
}

/**
 * What one member's regeneration would cost, from P7.8's estimate: one full
 * copy call at the Rewind model's price, or nothing when copy is template only.
 */
async function getRegenerateEstimate(year: number): Promise<{ costUsd: number; budgetUsd: number }> {
  const [config, provider, budget] = await Promise.all([
    prisma.config.findUnique({ where: { id: "config" }, select: { rewindLlmMode: true, llmDisabled: true } }),
    prisma.lLMProvider.findFirst({ where: { isActive: true, purpose: "wrapped" }, select: { provider: true, model: true } }),
    getSeasonBudget(year),
  ])
  const model = provider?.model && isLLMProviderId(provider.provider) ? lookupModel(provider.provider, provider.model) : null
  const estimate = estimateSeasonCost({
    candidates: [{ edition: "full", unchanged: false }],
    model,
    templateOnly: Boolean(config?.llmDisabled) || config?.rewindLlmMode === "off",
    budgetLeftUsd: budget.budgetUsd - budget.spentUsd,
  })
  return { costUsd: estimate.costUsd, budgetUsd: budget.budgetUsd }
}

/**
 * The Regenerate confirm's cost line, shared by the Rewind tab, the user
 * detail header and the users list: "About $0.02 of the $5.00 season budget."
 */
export async function regenerateEstimateCopy(year: number, f: BoundFormat): Promise<string> {
  const estimate = await getRegenerateEstimate(year)
  return estimate.costUsd > 0
    ? `About ${f.money(estimate.costUsd)} of the ${f.money(estimate.budgetUsd)} season budget.`
    : "It uses template text, so it costs nothing."
}

export interface UserUsageData {
  requests: number
  tokens: number
  costUsd: number
  latest: { id: string; createdAt: Date; provider: string; model: string | null; totalTokens: number; cost: number }[]
}

/** The member's LLM totals (one `groupBy`) and their ten latest requests, without their text. */
export async function getUserUsage(userId: string): Promise<UserUsageData> {
  const [totals, latest] = await Promise.all([
    usageTotalsByUser([userId]),
    prisma.lLMUsage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, createdAt: true, provider: true, model: true, totalTokens: true, cost: true },
    }),
  ])
  const total = totals.get(userId)
  return { requests: total?.count ?? 0, tokens: total?.totalTokens ?? 0, costUsd: total?.cost ?? 0, latest }
}
