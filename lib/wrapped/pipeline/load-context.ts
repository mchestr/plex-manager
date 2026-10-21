/**
 * Everything a member's v3 Rewind reads from the database (design 9.2 step
 * 1): the member, `Config`, the services, their hidden titles, the batch's
 * aggregate, the zone and window, the serial, the previous copy, the LLM
 * provider and the season's Rewind spend.
 *
 * @module lib/wrapped/pipeline/load-context
 */

import "server-only"

import { createHmac, randomBytes } from "node:crypto"

import { type LLMProviderId } from "@/lib/llm/models"
import { getRewindSeasonSpend } from "@/lib/llm/usage-totals"
import { isLLMProviderId } from "@/lib/llm/provider-presets"
import { prisma } from "@/lib/prisma"
import type { RewindGenerationKind } from "@/lib/rewind/enqueue-generation"
import { serverZone } from "@/lib/utils/server-zone"
import { serverAggregateSchema, type ServerAggregate } from "@/lib/wrapped/aggregate/schema"
import { batchWindowAt, dataThroughDate, isFinalCut, throughFor } from "@/lib/wrapped/aggregate/window"
import { parseStoredRewind } from "@/lib/wrapped/data/parse-stored"
import { findRewindStyleGuide } from "@/lib/wrapped/prompt/store"
import { excludedContentRatingsSchema, excludedSectionIdsSchema } from "@/lib/wrapped/sources/schemas"
import type { SonarrEndpoint } from "@/lib/wrapped/sources/sonarr-calendar"
import { dataWindow, resolveZone, type RewindZone, type TimeWindow } from "@/lib/wrapped/time/zone"

import type { PreviousCopy } from "./copy-step"
import { RewindGenerationError } from "./generation-error"

export interface RewindContext {
  userId: string
  year: number
  kind: RewindGenerationKind
  through: string
  finalCut: boolean
  member: { userId: string; name: string | null; plexUserId: string | null; isAdmin: boolean }
  zone: RewindZone
  window: TimeWindow
  config: {
    rewindEnabled: boolean
    rewindAudience: string
    rewindIncludeManagedUsers: boolean
    stripeEnabled: boolean
    llmDisabled: boolean
    llmMode: string
    budgetUsd: number
    locale: string
    excludedSectionIds: string[]
    excludedContentRatings: string[]
    disabledPages: string[]
  }
  tautulli: { url: string; apiKey: string } | null
  overseerr: { url: string; apiKey: string } | null
  /** The active Sonarr row, for Next year's returning part; absent or null without one. */
  sonarr?: SonarrEndpoint | null
  hiddenKeys: ReadonlySet<string>
  aggregate: ServerAggregate | null
  serial: string
  nthRewind: number
  wrappedId: string | null
  previous: PreviousCopy | null
  llmProvider: { provider: LLMProviderId; model: string } | null
  spentUsd: number
  styleGuide: string | null
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

/**
 * "K7Q4": 4 Crockford base32 characters of `HMAC-SHA256(key, userId:year)`
 * (design G10): stable for the year, not reversible.
 *
 * @internal
 */
export function memberSerial(key: string, userId: string, year: number): string {
  const bits = createHmac("sha256", key).update(`${userId}:${year}`).digest().readUInt32BE(0) >>> 12
  return [15, 10, 5, 0].map((shift) => CROCKFORD[(bits >>> shift) & 31]).join("")
}

/** `Config.rewindSerialKey`, created once (32 random bytes) when it is null. */
async function serialKey(): Promise<string> {
  const current = await prisma.config.findUnique({ where: { id: "config" }, select: { rewindSerialKey: true } })
  if (current?.rewindSerialKey) return current.rewindSerialKey
  await prisma.config.updateMany({
    where: { id: "config", rewindSerialKey: null },
    data: { rewindSerialKey: randomBytes(32).toString("hex") },
  })
  const created = await prisma.config.findUnique({ where: { id: "config" }, select: { rewindSerialKey: true } })
  if (!created?.rewindSerialKey) throw new RewindGenerationError("NOT_CONFIGURED", { retryable: false })
  return created.rewindSerialKey
}

const stringList = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [])

/** The stored copy a regeneration may reuse or keep slots of. */
async function previousCopy(userId: string, year: number, data: string | null): Promise<PreviousCopy | null> {
  const stored = parseStoredRewind(data)
  if (stored.version !== 3 || !stored.data.copy) return null
  const last = await prisma.rewindGeneration.findFirst({
    where: { userId, year, status: "completed", factsHash: { not: null } },
    orderBy: { finishedAt: "desc" },
    select: { factsHash: true },
  })
  const { copy, copySource, copyMeta } = stored.data
  return {
    factsHash: last?.factsHash ?? stored.data.factsHash,
    promptVersion: copyMeta.promptVersion,
    model: copyMeta.model,
    copy,
    copySource,
    slotHashes: copyMeta.slotHashes,
  }
}

/** Loads the context; throws `NOT_CONFIGURED` for a member who no longer exists. */
export async function loadRewindContext(options: {
  userId: string
  year: number
  kind: RewindGenerationKind
  through?: string
}): Promise<RewindContext> {
  const { userId, year } = options
  const [user, config, tautulli, overseerr, sonarr, zone, exclusions, wrapped, provider, styleGuide] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, plexUserId: true, isAdmin: true, timezone: true } }),
    prisma.config.findUnique({ where: { id: "config" } }),
    prisma.tautulli.findFirst({ where: { isActive: true }, select: { url: true, apiKey: true } }),
    prisma.overseerr.findFirst({ where: { isActive: true }, select: { url: true, apiKey: true } }),
    prisma.sonarr.findFirst({ where: { isActive: true }, select: { name: true, url: true, apiKey: true, publicUrl: true } }),
    serverZone(),
    prisma.rewindExclusion.findMany({ where: { userId }, select: { ratingKey: true } }),
    prisma.plexWrapped.findUnique({ where: { userId_year: { userId, year } }, select: { id: true, data: true, status: true } }),
    prisma.lLMProvider.findFirst({ where: { isActive: true, purpose: "wrapped" }, select: { provider: true, model: true } }),
    findRewindStyleGuide(),
  ])
  if (!user) throw new RewindGenerationError("NOT_CONFIGURED", { retryable: false })

  const through = options.through ?? throughFor(year, batchWindowAt(year, zone, Date.now()))
  const finalCut = isFinalCut(year, through)
  const memberZone = resolveZone(user, zone)
  const [aggregateRow, nth, spent, key] = await Promise.all([
    prisma.rewindServerAggregate.findUnique({ where: { year_dataThrough: { year, dataThrough: dataThroughDate(through) } }, select: { data: true } }),
    prisma.plexWrapped.count({ where: { userId, status: "completed", year: { lt: year } } }),
    getRewindSeasonSpend(year),
    serialKey(),
  ])
  const aggregate = aggregateRow ? serverAggregateSchema.safeParse(aggregateRow.data) : null

  return {
    userId,
    year,
    kind: options.kind,
    through,
    finalCut,
    member: { userId, name: user.name, plexUserId: user.plexUserId, isAdmin: user.isAdmin },
    zone: memberZone,
    window: dataWindow(year, memberZone.zone, { finalCut }),
    config: {
      rewindEnabled: config?.rewindEnabled ?? false,
      rewindAudience: config?.rewindAudience ?? "admins",
      rewindIncludeManagedUsers: config?.rewindIncludeManagedUsers ?? false,
      stripeEnabled: config?.stripeEnabled ?? false,
      llmDisabled: config?.llmDisabled ?? false,
      llmMode: config?.rewindLlmMode ?? "standard",
      budgetUsd: Number(config?.rewindLlmBudgetUsd ?? 10),
      locale: config?.locale ?? "en-US",
      excludedSectionIds: excludedSectionIdsSchema.parse(config?.rewindExcludedSectionIds ?? null),
      excludedContentRatings: excludedContentRatingsSchema.parse(config?.rewindExcludedContentRatings ?? null),
      disabledPages: stringList(config?.rewindDisabledPages),
    },
    tautulli,
    overseerr,
    sonarr,
    hiddenKeys: new Set(exclusions.map((e) => e.ratingKey)),
    aggregate: aggregate?.success ? aggregate.data : null,
    serial: memberSerial(key, userId, year),
    nthRewind: nth + 1,
    wrappedId: wrapped?.id ?? null,
    previous: wrapped?.status === "completed" ? await previousCopy(userId, year, wrapped.data) : null,
    llmProvider: provider && isLLMProviderId(provider.provider) && provider.model ? { provider: provider.provider, model: provider.model } : null,
    spentUsd: spent,
    styleGuide,
  }
}

