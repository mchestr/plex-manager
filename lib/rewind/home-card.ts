/**
 * Gathers the home RewindCard's input for one member and resolves it
 * (P6.9): the season and flags, Redis (FR-50), eligibility (FR-48), the
 * member's rows with their latest generation, the newest `RewindView`, the
 * live `RewindShare` and the archive of earlier completed years.
 *
 * Network and Redis checks run only when the answer can change the card:
 * nothing is asked outside the teaser window while the flags hide Rewind,
 * and eligibility, the first-watch date and Redis only while nothing of the
 * season year is completed.
 *
 * @module lib/rewind/home-card
 */

import "server-only"

import { cache } from "react"
import { z } from "zod"

import { hasEntitlement } from "@/lib/actions/entitlement"
import { rewindName } from "@/lib/brand"
import { getFirstWatchDate } from "@/lib/connections/tautulli-first-watch"
import { archetypeInks, type InkName } from "@/lib/design/tokens"
import { prisma } from "@/lib/prisma"
import { checkRewindInfra } from "@/lib/queue/rewind-infra"
import { formatDayMonth } from "@/lib/rewind/format"
import {
  joinedLate,
  resolveCardState,
  teaserStartsAt,
  type CompletedIssue,
  type RewindArchiveYear,
  type RewindCardState,
} from "@/lib/rewind/home-card-state"
import { CoverDataSchema } from "@/lib/rewind/pages/cover.schema"
import { issueDurationMs } from "@/lib/rewind/registry"
import { deriveRewindStatus, type RewindStatus } from "@/lib/rewind/rewind-status"
import { validatePagesOnRead } from "@/lib/rewind/select-pages"
import { soundtrack, yearDays } from "@/lib/rewind/viz/soundtrack"
import { getAppSettings } from "@/lib/settings/app-settings"
import type { FormatSettings } from "@/lib/utils/format"
import { YEAR_MAX, YEAR_MIN } from "@/lib/validations/shared-schemas"
import { ARCHETYPES } from "@/lib/wrapped/archetypes/catalogue"
import { parseStoredRewind } from "@/lib/wrapped/data/parse-stored"
import { getRewindEligibility, type RewindEligibility } from "@/lib/wrapped/eligibility"
import { isRewindUnread } from "@/lib/wrapped/notify/notice"
import { DEFAULT_SEASON, seasonStateAt, seasonWindow } from "@/lib/wrapped/season"

export interface RewindCardModel {
  state: RewindCardState
  /** Earlier completed years, newest first. */
  archive: RewindArchiveYear[]
  /** `rewindName(year)` of the card's year. */
  name: string
  settings: FormatSettings
}

/** The strip's soundtrack viewBox: 48 weekly bins stretched across the card. */
const STRIP = { width: 480, height: 80 } as const

const DisabledPagesSchema = z.array(z.string()).catch([])
const SharedPagesSchema = z.array(z.unknown()).catch([])

const NONE: RewindStatus = { state: "none", errorCode: null, startedAt: null, hasCompleted: false }

interface Row {
  id: string
  year: number
  status: string
  error: string | null
  archetype: string | null
  dataVersion: number
  generatedAt: Date | null
}

/** A v3 row's field ink from its stored archetype name; paper for a postcard or an older row. */
function rowInk(row: Pick<Row, "archetype" | "dataVersion">): InkName {
  if (row.dataVersion !== 3) return "paper"
  const archetype = ARCHETYPES.find((a) => a.name === row.archetype)
  return archetype ? archetypeInks[archetype.id].field : "paper"
}

/** The completed row as the strip and meta line need it. */
async function completedIssue(
  row: Row,
  ctx: { userId: string; now: Date; settings: FormatSettings; disabledPages: string[]; viewedAt: Date[] },
): Promise<CompletedIssue> {
  const [stored, share, canShare] = await Promise.all([
    prisma.plexWrapped.findUnique({ where: { id: row.id }, select: { data: true } }),
    prisma.rewindShare.findFirst({
      where: { wrappedId: row.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: ctx.now } }] },
      orderBy: { createdAt: "desc" },
      select: { pages: true, expiresAt: true },
    }),
    hasEntitlement(ctx.userId, "full"),
  ])
  const unread = isRewindUnread(row.generatedAt, ctx.viewedAt)
  const base = {
    share: share ? { state: "on" as const, pages: SharedPagesSchema.parse(share.pages).length, expiresOn: share.expiresAt } : { state: "off" as const },
    canShare,
    unread,
  }

  const parsed = parseStoredRewind(stored?.data ?? null)
  if (parsed.version !== 3) {
    return { ...base, pages: null, readMs: null, edition: null, ink: "paper", soundtrack: null, dataThrough: null }
  }
  const { data } = parsed
  const archetype = data.archetype?.id ?? null
  const pages = validatePagesOnRead(data.pages, { archetype, disabledPages: ctx.disabledPages })
  const cover = CoverDataSchema.safeParse(data.pages.find((page) => page.type === "cover")?.data)
  const strip = cover.success
    ? soundtrack(cover.data.minutes, { variant: "weekly", window: { from: data.window.from, days: yearDays(data.window.from) }, ...STRIP })
    : null

  return {
    ...base,
    pages: pages.length,
    readMs: issueDurationMs(pages.map((page) => page.type)),
    edition: data.edition,
    ink: archetype ? archetypeInks[archetype].field : "paper",
    soundtrack: strip && { d: strip.d, centre: strip.centre, dotted: strip.dotted, ...STRIP },
    dataThrough: `Data through ${formatDayMonth(data.window.through, ctx.settings)}`,
  }
}

/** The earliest sign of membership: the account, or the first watch when it is earlier (Rewind 4.5). */
async function joinedAt(user: { id: string; plexUserId: string | null; createdAt: Date }, seasonYear: number, zone: string): Promise<Date> {
  if (!joinedLate(user.createdAt, seasonYear, zone) || !user.plexUserId) return user.createdAt
  // The first watch reads the member's history, so it needs read entitlement (SEC-28)
  if (!(await hasEntitlement(user.id, "read"))) return user.createdAt
  const first = await getFirstWatchDate(user.plexUserId)
  const at = first.success && first.firstWatchDate ? new Date(first.firstWatchDate) : null
  return at && !Number.isNaN(at.getTime()) && at < user.createdAt ? at : user.createdAt
}

/**
 * The card for `user` at `now`, or null when no card renders (Rewind 13.2,
 * FR-45). See `lib/rewind/home-card-state.ts` for the order. Pages call
 * {@link requestRewindCardModel}.
 *
 * @internal
 */
export async function getRewindCardModel(user: { id: string; isAdmin: boolean }, now: Date = new Date()): Promise<RewindCardModel | null> {
  const [config, appSettings, member] = await Promise.all([
    prisma.config.findUnique({
      where: { id: "config" },
      select: {
        rewindEnabled: true,
        rewindAudience: true,
        rewindIncludeManagedUsers: true,
        rewindSeasonOpens: true,
        rewindSeasonCloses: true,
        rewindDisabledPages: true,
      },
    }),
    getAppSettings(),
    prisma.user.findUnique({ where: { id: user.id }, select: { id: true, plexUserId: true, createdAt: true } }),
  ])
  if (!member) return null

  const zone = appSettings.timeZone
  const settings: FormatSettings = { timeZone: zone, locale: appSettings.locale }
  const opens = config?.rewindSeasonOpens ?? DEFAULT_SEASON.opens
  const closes = config?.rewindSeasonCloses ?? DEFAULT_SEASON.closes
  const season = seasonStateAt(now, opens, closes, zone)
  const flags = { rewindEnabled: config?.rewindEnabled ?? false, rewindAudience: config?.rewindAudience ?? "admins" }
  const allowed = flags.rewindEnabled && (flags.rewindAudience === "all" || user.isAdmin)
  const active = now >= teaserStartsAt(season.opensAt, zone)
  if (!active && !allowed) return null

  const year = season.seasonYear
  const rows: Row[] = await prisma.plexWrapped.findMany({
    where: { userId: user.id, year: { gte: YEAR_MIN, lte: YEAR_MAX } },
    orderBy: { year: "desc" },
    select: { id: true, year: true, status: true, error: true, archetype: true, dataVersion: true, generatedAt: true },
  })
  const completed = rows.filter((row) => row.status === "completed")
  const views = await prisma.rewindView.findMany({
    where: { wrappedId: { in: completed.map((row) => row.id) } },
    select: { wrappedId: true, createdAt: true },
  })
  const viewedAt = (id: string) => views.filter((view) => view.wrappedId === id).map((view) => view.createdAt)
  const issueCtx = (row: Row) => ({
    userId: user.id,
    now,
    settings,
    disabledPages: DisabledPagesSchema.parse(config?.rewindDisabledPages ?? []),
    viewedAt: viewedAt(row.id),
  })

  const seasonRow = rows.find((row) => row.year === year) ?? null
  const lastRow = completed.find((row) => row.year === year - 1) ?? null
  const seasonCompleted = seasonRow?.status === "completed" ? seasonRow : null

  let issue: CompletedIssue | null = null
  let lastIssue: CompletedIssue | null = null
  let status = NONE
  let eligibility: RewindEligibility = { eligible: true }
  let joined = member.createdAt
  let excludedManaged = false

  if (active) {
    const [latest, managedSkip] = await Promise.all([
      prisma.rewindGeneration.findFirst({
        where: { userId: user.id, year, status: { not: "skipped" } },
        orderBy: { createdAt: "desc" },
        select: { status: true, error: true, startedAt: true },
      }),
      config?.rewindIncludeManagedUsers
        ? null
        : prisma.rewindGeneration.findFirst({
            where: { userId: user.id, year, status: "skipped", error: { path: ["code"], equals: "MANAGED_ACCOUNT" } },
            select: { id: true },
          }),
    ])
    excludedManaged = managedSkip !== null
    if (seasonCompleted) {
      issue = await completedIssue(seasonCompleted, issueCtx(seasonCompleted))
    } else {
      const answers = await Promise.all([
        deriveRewindStatus({ wrapped: seasonRow && { status: seasonRow.status, error: seasonRow.error }, latest, infra: checkRewindInfra }),
        getRewindEligibility(member),
        joinedAt(member, year, zone),
      ])
      status = answers[0]
      eligibility = answers[1]
      joined = answers[2]
    }
  } else if (lastRow) {
    lastIssue = await completedIssue(lastRow, issueCtx(lastRow))
  }

  const state = resolveCardState({
    now,
    zone,
    season,
    lastSeasonClosesAt: seasonWindow(year - 1, opens, closes, zone).closesAt,
    flags,
    viewer: { isAdmin: user.isAdmin, joinedAt: joined },
    eligibility,
    excludedManaged,
    status,
    issue,
    lastIssue,
    lastYear: completed.find((row) => row.year < year)?.year ?? null,
  })
  if (!state) return null

  const cardYear = "year" in state ? state.year : year
  const archive = completed
    .filter((row) => row.year !== cardYear)
    .map((row): RewindArchiveYear => ({ year: row.year, ink: rowInk(row), status: viewedAt(row.id).length > 0 ? "watched" : "ready" }))

  return { state, archive, name: await rewindName(cardYear), settings }
}

/** {@link getRewindCardModel} at the request's time, read once per request (the layout's nav and home share it). */
export const requestRewindCardModel = cache((userId: string, isAdmin: boolean) => getRewindCardModel({ id: userId, isAdmin }))
