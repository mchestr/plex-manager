/**
 * Loads what `estimateSeasonCost` needs for a season run (P7.8): the members
 * the run would generate, the Rewind model and what is left of the season's
 * LLM budget (`rewindLlmBudgetUsd` less `getRewindSeasonSpend`).
 *
 * @module lib/wrapped/admin/season-estimate
 */

import "server-only"

import { lookupModel } from "@/lib/llm/models"
import { isLLMProviderId } from "@/lib/llm/provider-presets"
import { getRewindSeasonSpend } from "@/lib/llm/usage-totals"
import { prisma } from "@/lib/prisma"
import { dataThroughDate } from "@/lib/wrapped/aggregate/window"

import { estimateSeasonCost, type SeasonCostEstimate } from "./estimate"
import { getSeasonCandidates } from "./season"

export interface SeasonBudget {
  budgetUsd: number
  spentUsd: number
}

/** The season's budget and spend, for the dashboard tile. */
export async function getSeasonBudget(year: number): Promise<SeasonBudget> {
  const [config, spentUsd] = await Promise.all([
    prisma.config.findUnique({ where: { id: "config" }, select: { rewindLlmBudgetUsd: true } }),
    getRewindSeasonSpend(year),
  ])
  return { budgetUsd: Number(config?.rewindLlmBudgetUsd ?? 10), spentUsd }
}

/**
 * The estimate for a run of `scope` with the buttons' audience (`config`):
 * with `rewindAudience = admins`, only admins are counted.
 */
export async function loadSeasonEstimate(year: number, through: string, scope: "all" | "failed"): Promise<SeasonCostEstimate> {
  const [config, provider, candidates, budget] = await Promise.all([
    prisma.config.findUnique({ where: { id: "config" }, select: { rewindAudience: true, rewindLlmMode: true, llmDisabled: true } }),
    prisma.lLMProvider.findFirst({ where: { isActive: true, purpose: "wrapped" }, select: { provider: true, model: true } }),
    getSeasonCandidates(year, dataThroughDate(through), scope),
    getSeasonBudget(year),
  ])
  const adminsOnly = (config?.rewindAudience ?? "admins") !== "all"
  const model = provider?.model && isLLMProviderId(provider.provider) ? lookupModel(provider.provider, provider.model) : null
  return estimateSeasonCost({
    candidates: adminsOnly ? candidates.filter((c) => c.isAdmin) : candidates,
    model,
    templateOnly: Boolean(config?.llmDisabled) || config?.rewindLlmMode === "off",
    budgetLeftUsd: budget.budgetUsd - budget.spentUsd,
  })
}
