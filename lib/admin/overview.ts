/**
 * The admin Overview's four sources (P10.8, ui-design-system 6.2): service
 * health, job queues, Rewind progress and LLM spend.
 *
 * `getAdminOverview()` runs them with `Promise.allSettled`, so each fails on
 * its own: a failed source is `null`, which its tile shows as a dash with
 * "Not available", never 0 (5.5). Nothing here runs a live upstream test:
 * services read the cached `getConnectionHealth()` (5 minutes) plus the
 * database and Redis checks behind `/api/health`.
 *
 * | Source | Reads |
 * |---|---|
 * | services | `getConnectionHealth()`, `checkDependencies()` |
 * | queues | `getQueueDashboard()` (workers as Redis registers them) |
 * | rewind | `getSeasonState()`, `getSeasonCounts()`, distinct `RewindView` |
 * | spend | this month's `LLMUsage` cost, `getSeasonBudget()` |
 *
 * Outside the season the Rewind source reports last season's totals with the
 * coming season's opening date.
 *
 * @module lib/admin/overview
 */

import "server-only"

import { getQueueDashboard } from "@/lib/admin/queues"
import { checkDependencies, type CheckStatus } from "@/lib/health/checks"
import { prisma } from "@/lib/prisma"
import { getConnectionHealth } from "@/lib/settings/connection-health"
import type { DayRange } from "@/lib/ui/date-range"
import { settingsCategory, type StatusValue } from "@/lib/ui/status"
import { dayWindow, type DayWindow } from "@/lib/utils/day-window"
import { createLogger } from "@/lib/utils/logger"
import { serverZone } from "@/lib/utils/server-zone"
import { dayKey } from "@/lib/utils/zoned-time"
import { getSeasonCounts } from "@/lib/wrapped/admin/season"
import { getSeasonBudget } from "@/lib/wrapped/admin/season-estimate"
import { getSeasonState } from "@/lib/wrapped/season"

const logger = createLogger("ADMIN_OVERVIEW")

export interface ServiceHealth {
  /** A settings section id (`plex`, `tautulli`, ...) or `database` / `redis`. */
  id: string
  label: string
  status: StatusValue<"connection">
}

export interface ServicesSummary {
  /** Services in the working category. */
  working: number
  /** Services that are set up (everything but the off category). */
  total: number
  attention: number
  broken: number
  /** The first broken service, else the first needing attention, else null. */
  worst: ServiceHealth | null
}

export interface QueuesSummary {
  redisConfigured: boolean
  redisConnected: boolean
  workerRunning: boolean
  /** `null` while Redis does not answer. */
  failed: number | null
  waiting: number | null
}

export interface RewindSummary {
  /** The year the figures are for: the open season, or last season outside it. */
  year: number
  isOpen: boolean
  /** When the coming (or current) season opens. */
  opensAt: Date
  ready: number
  generating: number
  failed: number
  notStarted: number
  /** Enabled members with a Plex identity. */
  members: number
  /** Members who opened their completed Rewind of `year`. */
  opened: number
}

export interface SpendSummary {
  /** This calendar month in the server zone, through today. */
  month: DayRange
  monthUsd: number
  seasonYear: number
  seasonSpentUsd: number
  budgetUsd: number
}

export interface AdminOverview {
  services: ServicesSummary | null
  queues: QueuesSummary | null
  rewind: RewindSummary | null
  spend: SpendSummary | null
}

const MEMBER = { disabledAt: null, plexUserId: { not: null } }

const DEPENDENCY_STATUS: Record<CheckStatus, StatusValue<"connection">> = {
  ok: "ok",
  fail: "unreachable",
  not_configured: "notConfigured",
}

/** Counts by settings category and picks the worst service. @internal */
export function summarizeServices(services: readonly ServiceHealth[]): ServicesSummary {
  const category = (service: ServiceHealth) => settingsCategory(service.status).category
  const inCategory = (name: string) => services.filter((service) => category(service) === name)
  const broken = inCategory("broken")
  const attention = inCategory("attention")
  return {
    working: inCategory("working").length,
    total: services.filter((service) => category(service) !== "off").length,
    attention: attention.length,
    broken: broken.length,
    worst: broken[0] ?? attention[0] ?? null,
  }
}

/** The 1st of this month through today, in `zone`. @internal */
export function monthWindow(now: Date, zone: string): DayWindow {
  const today = dayKey(now.getTime(), zone)
  return dayWindow({ from: `${today.slice(0, 8)}01`, to: today }, zone)
}

async function loadServices(): Promise<ServicesSummary> {
  const [health, dependencies] = await Promise.all([getConnectionHealth(), checkDependencies()])
  return summarizeServices([
    { id: "database", label: "Database", status: DEPENDENCY_STATUS[dependencies.database] },
    { id: "redis", label: "Redis", status: DEPENDENCY_STATUS[dependencies.redis] },
    ...health.connections,
  ])
}

async function loadQueues(): Promise<QueuesSummary> {
  const dashboard = await getQueueDashboard()
  return {
    redisConfigured: dashboard.redisConfigured,
    redisConnected: dashboard.redisConnected,
    workerRunning: dashboard.redisConnected && dashboard.workerRunning,
    failed: dashboard.stats?.failed ?? null,
    waiting: dashboard.stats?.waiting ?? null,
  }
}

async function loadRewind(now: Date): Promise<RewindSummary> {
  const season = await getSeasonState(now)
  const year = season.isOpen ? season.seasonYear : season.seasonYear - 1
  const [counts, members, opened] = await Promise.all([
    getSeasonCounts(year, now.getTime()),
    prisma.user.count({ where: MEMBER }),
    prisma.rewindView.findMany({
      where: { wrapped: { year, status: "completed" } },
      distinct: ["wrappedId"],
      select: { wrappedId: true },
    }),
  ])
  return {
    year,
    isOpen: season.isOpen,
    opensAt: season.opensAt,
    ready: counts.ready,
    generating: counts.generating,
    failed: counts.failed,
    notStarted: counts.notStarted,
    members,
    opened: opened.length,
  }
}

async function loadSpend(now: Date): Promise<SpendSummary> {
  const [zone, season] = await Promise.all([serverZone(), getSeasonState(now)])
  const month = monthWindow(now, zone)
  const [spent, budget] = await Promise.all([
    prisma.lLMUsage.aggregate({ where: { createdAt: { gte: month.gte, lt: month.lt } }, _sum: { cost: true } }),
    getSeasonBudget(season.seasonYear),
  ])
  return {
    month: { from: month.from, to: month.to },
    monthUsd: spent._sum.cost ?? 0,
    seasonYear: season.seasonYear,
    seasonSpentUsd: budget.spentUsd,
    budgetUsd: budget.budgetUsd,
  }
}

function settledValue<T>(name: string, result: PromiseSettledResult<T>): T | null {
  if (result.status === "fulfilled") return result.value
  logger.error(`Overview source failed: ${name}`, result.reason)
  return null
}

/** The four sources; a failed one is `null` (see the module comment). */
export async function getAdminOverview(now: Date = new Date()): Promise<AdminOverview> {
  const [services, queues, rewind, spend] = await Promise.allSettled([
    loadServices(),
    loadQueues(),
    loadRewind(now),
    loadSpend(now),
  ])
  return {
    services: settledValue("services", services),
    queues: settledValue("queues", queues),
    rewind: settledValue("rewind", rewind),
    spend: settledValue("spend", spend),
  }
}
