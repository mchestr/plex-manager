/**
 * Everything a member's v3 Rewind reads from the database (design 9.2 step
 * 1): the member, `Config`, the services, their hidden titles, the batch's
 * aggregate, the zone and window, the serial, the previous copy, the LLM
 * provider and the season's Rewind spend.
 *
 * A hide or unhide's regeneration (`keepWindow`, P7.7) keeps the stored
 * issue's data window: a season issue (1 January to 30 November) stays on
 * the season window and its batch even after the year ends, so the issue's
 * span and its server aggregate do not change under a hide.
 *
 * The LLM provider is `getFrozenRewindModel()` (P8.1): the freeze lock's
 * model on the active row's key. A row on another provider than the lock
 * sets `llmProviderMismatch`, and the copy step writes templates.
 *
 * @module lib/wrapped/pipeline/load-context
 */

import "server-only"

import { createHmac, randomBytes } from "node:crypto"

import { getFrozenRewindModel } from "@/lib/llm/registry"
import { getRewindSeasonSpend } from "@/lib/llm/usage-totals"
import { prisma } from "@/lib/prisma"
import type { RewindGenerationKind } from "@/lib/rewind/enqueue-generation"
import { serverZone } from "@/lib/utils/server-zone"
import { serverAggregateSchema, type ServerAggregate } from "@/lib/wrapped/aggregate/schema"
import { dataThroughDate, isFinalCut, throughFor } from "@/lib/wrapped/aggregate/window"
import { parseStoredRewind } from "@/lib/wrapped/data/parse-stored"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { findRewindStyleGuide } from "@/lib/wrapped/prompt/store"
import { excludedContentRatingsSchema, excludedSectionIdsSchema } from "@/lib/wrapped/sources/schemas"
import type { SonarrEndpoint } from "@/lib/wrapped/sources/sonarr-calendar"
import { dataWindow, resolveDataWindow, resolveZone, seasonWindowAt, type RewindZone, type TimeWindow } from "@/lib/wrapped/time/zone"

import type { CopyProvider, PreviousCopy } from "./copy-step"
import { RewindGenerationError } from "./generation-error"
import { storedIssueOf } from "./kept-slots"
import { getActiveService } from "@/lib/data/active-service"

export interface RewindContext {
  userId: string
  year: number
  kind: RewindGenerationKind
  through: string
  /** The window is the whole year; the name is the stored `window.finalCut`'s. */
  finalCut: boolean
  /** `createdAt` is the account's, for the late-joiner rule; fixture contexts leave it out. */
  member: { userId: string; name: string | null; plexUserId: string | null; isAdmin: boolean; createdAt?: Date }
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
  llmProvider: CopyProvider | null
  /** The active row names another provider than the freeze lock (P8.1). */
  llmProviderMismatch?: boolean
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
async function previousCopy(userId: string, year: number, data: RewindDataV3): Promise<PreviousCopy | null> {
  if (!data.copy) return null
  const last = await prisma.rewindGeneration.findFirst({
    where: { userId, year, status: "completed", factsHash: { not: null } },
    orderBy: { finishedAt: "desc" },
    select: { factsHash: true },
  })
  const { copy, copySource, copyMeta } = data
  return {
    factsHash: last?.factsHash ?? data.factsHash,
    promptVersion: copyMeta.promptVersion,
    model: copyMeta.model,
    copy,
    copySource,
    slotHashes: copyMeta.slotHashes,
    issue: storedIssueOf(data),
  }
}

/**
 * The batch's last data day, whether the window is the whole year, and the
 * member's window. A run with a `through` (the fan-outs) reads that batch,
 * and `keepSeason` (a hide or unhide of a season issue) the season's, even
 * after the year ends. The rest (member requests, admin runs, the stale
 * sweep's re-runs, a hide of a whole-year issue) follow `resolveDataWindow`
 * in the member's zone, so after 1 January they read the whole year. The
 * season window never runs past the end of yesterday.
 */
function windowFor(year: number, zone: string, options: { through?: string; keepSeason: boolean }, now: number) {
  if (options.through) {
    const finalCut = isFinalCut(year, options.through)
    return { through: options.through, finalCut, window: finalCut ? dataWindow(year, zone, { finalCut }) : seasonWindowAt(year, zone, now) }
  }
  const resolved = options.keepSeason ? { window: seasonWindowAt(year, zone, now), finalCut: false } : resolveDataWindow({ year, zone, now })
  return { through: throughFor(year, resolved), ...resolved }
}

/** Loads the context; throws `NOT_CONFIGURED` for a member who no longer exists. */
export async function loadRewindContext(options: {
  userId: string
  year: number
  kind: RewindGenerationKind
  through?: string
  /** A hide or unhide's regeneration: keep the stored issue's data window (see the module comment). */
  keepWindow?: boolean
}): Promise<RewindContext> {
  const { userId, year } = options
  const [user, config, tautulli, overseerr, sonarr, zone, exclusions, wrapped, provider, styleGuide] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, plexUserId: true, isAdmin: true, timezone: true, createdAt: true } }),
    prisma.config.findUnique({ where: { id: "config" } }),
    getActiveService("tautulli"),
    getActiveService("overseerr"),
    getActiveService("sonarr"),
    serverZone(),
    prisma.rewindExclusion.findMany({ where: { userId }, select: { ratingKey: true } }),
    prisma.plexWrapped.findUnique({ where: { userId_year: { userId, year } }, select: { id: true, data: true, status: true } }),
    getFrozenRewindModel(),
    findRewindStyleGuide(),
  ])
  if (!user) throw new RewindGenerationError("NOT_CONFIGURED", { retryable: false })

  const stored = wrapped?.status === "completed" ? parseStoredRewind(wrapped.data) : null
  const issue = stored?.version === 3 ? stored.data : null
  const memberZone = resolveZone(user, zone)
  const keepSeason = options.keepWindow === true && issue !== null && !issue.window.finalCut
  const { through, finalCut, window } = windowFor(year, memberZone.zone, { through: options.through, keepSeason }, Date.now())
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
    member: { userId, name: user.name, plexUserId: user.plexUserId, isAdmin: user.isAdmin, createdAt: user.createdAt },
    zone: memberZone,
    window,
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
    previous: issue ? await previousCopy(userId, year, issue) : null,
    llmProvider: provider && provider.status !== "mismatch" ? { provider: provider.provider, model: provider.model, budgetModel: provider.budgetModel, rowModel: provider.rowModel } : null,
    llmProviderMismatch: provider?.status === "mismatch",
    spentUsd: spent,
    styleGuide,
  }
}

