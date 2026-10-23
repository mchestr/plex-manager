/**
 * The daily retention sweep (P11.14, GAP-35): `RETENTION_SWEEP`, on the main
 * queue at 03:30 in the server zone, or under the `retention` lease without
 * Redis (`lib/retention/fallback.ts`). The admin Privacy section's "Run now"
 * calls {@link runRetentionSweep} directly.
 *
 * | Rule | Rows | Outcome |
 * |---|---|---|
 * | `rewindLlmText` | `LLMUsage` outside a conversation, or tied to a Rewind | text nulled |
 * | `assistantLlmText` | `LLMUsage` in a conversation | text nulled |
 * | `chatConversations` | `ChatConversation` by `endedAt` | deleted (usage keeps cost, sessions cascade) |
 * | `discordChatMessages` | `DiscordChatSession` by `lastMessageAt` | `messages` emptied |
 * | `discordChatSessions` | `DiscordChatSession` by `lastMessageAt` | conversation ended, row deleted |
 * | `discordCommandArgs` / `discordCommandLog` | `DiscordCommandLog` by `createdAt` | args nulled / deleted |
 * | `shareVisitDays` | `RewindShareVisitDay` by `day` | deleted |
 * | `rewindViews` | `RewindView` by `createdAt` | deleted |
 * | `watchlistRemoved` | `WatchlistSyncHistory` `REMOVED_FROM_WATCHLIST` by `syncedAt` | deleted |
 * | `discordOAuthStates` / `discordPendingSelections` | by `expiresAt` | deleted |
 * | `rewindPreviousData` | `RewindGeneration` of expired seasons | `previousData` nulled |
 * | `auditLog` | `AuditLog` by `createdAt` (its only delete path) | deleted |
 *
 * Each rule selects up to {@link RETENTION_BATCH_SIZE} ids and then updates or
 * deletes by id under the same filter, so transactions stay short and a row
 * changed in between is skipped. The sweep stops between batches when its
 * signal aborts (shutdown), and then does not record the run. A rerun finds
 * nothing left to do: every filter excludes the rows it has already changed.
 *
 * @module
 */

import type { Job } from "bullmq"

import { Prisma, WatchlistSyncStatus } from "@/lib/generated/prisma/client"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { prisma } from "@/lib/prisma"
import { lastExpiredPreviousDataYear, RETENTION_RULES, retentionDays, type RetentionRule } from "@/lib/retention/policy"
import { createLogger } from "@/lib/utils/logger"

import { JOB_TYPES } from "../types"

const logger = createLogger("RETENTION")

/** Rows per select and write. @internal */
export const RETENTION_BATCH_SIZE = 1000

const DAY_MS = 24 * 60 * 60 * 1000

export interface RetentionSweepResult {
  counts: Record<RetentionRule, number>
  /** True when shutdown stopped the sweep; the run is then not recorded. */
  aborted: boolean
  finishedAt: string
}

interface SweepOptions {
  now?: Date
  signal?: AbortSignal
  batchSize?: number
}

interface Ctx {
  now: Date
  signal: AbortSignal
  batchSize: number
  aborted: boolean
  before: (days: number) => Date
}

/** Selects ids, applies the write to them, and repeats until a short batch. */
async function inBatches(
  ctx: Ctx,
  select: (take: number) => Promise<string[]>,
  apply: (ids: string[]) => Promise<{ count: number }>
): Promise<number> {
  let total = 0
  for (;;) {
    if (ctx.signal.aborted) {
      ctx.aborted = true
      return total
    }
    const ids = await select(ctx.batchSize)
    if (ids.length === 0) return total
    const { count } = await apply(ids)
    total += count
    if (ids.length < ctx.batchSize || count === 0) return total
  }
}

const ids = (rows: { id: string }[]) => rows.map((row) => row.id)
const HAS_TEXT: Prisma.LLMUsageWhereInput = { OR: [{ prompt: { not: null } }, { response: { not: null } }] }
const NO_TEXT = { prompt: null, response: null }

/** Rewind rows: no conversation, or tied to a Rewind; assistant rows are the rest. @internal */
export const REWIND_USAGE: Prisma.LLMUsageWhereInput = {
  OR: [{ chatConversationId: null }, { generationId: { not: null } }, { wrappedId: { not: null } }],
}
/** @internal */
export const ASSISTANT_USAGE: Prisma.LLMUsageWhereInput = {
  chatConversationId: { not: null },
  generationId: null,
  wrappedId: null,
}

function nullUsageText(ctx: Ctx, kind: Prisma.LLMUsageWhereInput, days: number) {
  const where: Prisma.LLMUsageWhereInput = { AND: [kind, HAS_TEXT, { createdAt: { lt: ctx.before(days) } }] }
  return inBatches(
    ctx,
    async (take) => ids(await prisma.lLMUsage.findMany({ where, select: { id: true }, take })),
    (batch) => prisma.lLMUsage.updateMany({ where: { AND: [where, { id: { in: batch } }] }, data: NO_TEXT })
  )
}

type Deletable = {
  findMany(args: { where: object; select: { id: true }; take: number }): Promise<{ id: string }[]>
  deleteMany(args: { where: object }): Promise<{ count: number }>
}

function deleteWhere(ctx: Ctx, model: Deletable, where: object) {
  return inBatches(
    ctx,
    async (take) => ids(await model.findMany({ where, select: { id: true }, take })),
    (batch) => model.deleteMany({ where: { AND: [where, { id: { in: batch } }] } })
  )
}

async function endIdleChatSessions(ctx: Ctx, days: number): Promise<number> {
  const where = { lastMessageAt: { lt: ctx.before(days) } }
  let lastBatch: { id: string; chatConversationId: string }[] = []
  return inBatches(
    ctx,
    async (take) => {
      lastBatch = await prisma.discordChatSession.findMany({ where, select: { id: true, chatConversationId: true }, take })
      return ids(lastBatch)
    },
    async (batch) => {
      // The conversation's own window starts when its last session goes
      await prisma.chatConversation.updateMany({
        where: { id: { in: lastBatch.map((row) => row.chatConversationId) }, endedAt: null },
        data: { endedAt: ctx.now },
      })
      return prisma.discordChatSession.deleteMany({ where: { ...where, id: { in: batch } } })
    }
  )
}

async function deleteShareVisitDays(ctx: Ctx, days: number): Promise<number> {
  const where = { day: { lt: ctx.before(days) } }
  let keys: { shareId: string; day: Date }[] = []
  return inBatches(
    ctx,
    async (take) => {
      keys = await prisma.rewindShareVisitDay.findMany({ where, select: { shareId: true, day: true }, take })
      return keys.map((key) => `${key.shareId}:${key.day.toISOString()}`)
    },
    () => prisma.rewindShareVisitDay.deleteMany({ where: { AND: [where, { OR: keys }] } })
  )
}

type RuleRunners = Record<RetentionRule, (ctx: Ctx) => Promise<number>>

function ruleRunners(days: ReturnType<typeof retentionDays>): RuleRunners {
  return {
    rewindLlmText: (ctx) => nullUsageText(ctx, REWIND_USAGE, days.rewindLlmText),
    assistantLlmText: (ctx) => nullUsageText(ctx, ASSISTANT_USAGE, days.assistantLlmText),
    chatConversations: (ctx) =>
      deleteWhere(ctx, prisma.chatConversation, { endedAt: { lt: ctx.before(days.chatConversations) } }),
    discordChatMessages: (ctx) => {
      const where: Prisma.DiscordChatSessionWhereInput = {
        lastMessageAt: { lt: ctx.before(days.discordChatMessages) },
        NOT: { messages: { equals: [] } },
      }
      return inBatches(
        ctx,
        async (take) => ids(await prisma.discordChatSession.findMany({ where, select: { id: true }, take })),
        (batch) => prisma.discordChatSession.updateMany({ where: { AND: [where, { id: { in: batch } }] }, data: { messages: [] } })
      )
    },
    discordChatSessions: (ctx) => endIdleChatSessions(ctx, days.discordChatSessions),
    discordCommandArgs: (ctx) => {
      const where = { commandArgs: { not: null }, createdAt: { lt: ctx.before(days.discordCommandArgs) } }
      return inBatches(
        ctx,
        async (take) => ids(await prisma.discordCommandLog.findMany({ where, select: { id: true }, take })),
        (batch) => prisma.discordCommandLog.updateMany({ where: { ...where, id: { in: batch } }, data: { commandArgs: null } })
      )
    },
    discordCommandLog: (ctx) =>
      deleteWhere(ctx, prisma.discordCommandLog, { createdAt: { lt: ctx.before(days.discordCommandLog) } }),
    shareVisitDays: (ctx) => deleteShareVisitDays(ctx, days.shareVisitDays),
    rewindViews: (ctx) => deleteWhere(ctx, prisma.rewindView, { createdAt: { lt: ctx.before(days.rewindViews) } }),
    watchlistRemoved: (ctx) =>
      deleteWhere(ctx, prisma.watchlistSyncHistory, {
        status: WatchlistSyncStatus.REMOVED_FROM_WATCHLIST,
        syncedAt: { lt: ctx.before(days.watchlistRemoved) },
      }),
    discordOAuthStates: (ctx) =>
      deleteWhere(ctx, prisma.discordOAuthState, { expiresAt: { lt: ctx.before(days.discordOAuthStates) } }),
    discordPendingSelections: (ctx) => deleteWhere(ctx, prisma.discordPendingSelection, { expiresAt: { lt: ctx.now } }),
    rewindPreviousData: (ctx) => {
      const where = { previousData: { not: null }, year: { lte: lastExpiredPreviousDataYear(ctx.now) } }
      return inBatches(
        ctx,
        async (take) => ids(await prisma.rewindGeneration.findMany({ where, select: { id: true }, take })),
        (batch) => prisma.rewindGeneration.updateMany({ where: { ...where, id: { in: batch } }, data: { previousData: null } })
      )
    },
    auditLog: (ctx) => deleteWhere(ctx, prisma.auditLog, { createdAt: { lt: ctx.before(days.auditLog) } }),
  }
}

/**
 * Applies every retention rule once, records the run on `Config` and logs
 * `retention.swept` with the per-rule counts. Throws on a database error.
 */
export async function runRetentionSweep(options: SweepOptions = {}): Promise<RetentionSweepResult> {
  const now = options.now ?? new Date()
  const ctx: Ctx = {
    now,
    signal: options.signal ?? shutdownSignal,
    batchSize: options.batchSize ?? RETENTION_BATCH_SIZE,
    aborted: false,
    before: (days) => new Date(now.getTime() - days * DAY_MS),
  }
  const runners = ruleRunners(retentionDays())
  const counts = Object.fromEntries(RETENTION_RULES.map((rule) => [rule, 0])) as Record<RetentionRule, number>

  for (const rule of RETENTION_RULES) {
    if (ctx.aborted) break
    counts[rule] = await runners[rule](ctx)
  }

  const finishedAt = new Date()
  if (ctx.aborted) {
    logger.warn("retention.aborted", { counts })
    return { counts, aborted: true, finishedAt: finishedAt.toISOString() }
  }

  await prisma.config.upsert({
    where: { id: "config" },
    update: { lastRetentionRunAt: finishedAt, lastRetentionSummary: counts },
    create: { id: "config", lastRetentionRunAt: finishedAt, lastRetentionSummary: counts },
    select: { id: true },
  })
  logger.info("retention.swept", { counts })
  return { counts, aborted: false, finishedAt: finishedAt.toISOString() }
}

/** The processor for the retention job type, or null. */
export function getRetentionProcessor(jobType: string): ((job: Job) => Promise<unknown>) | null {
  return jobType === JOB_TYPES.RETENTION_SWEEP ? () => runRetentionSweep() : null
}
