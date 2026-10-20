/**
 * The home RewindCard's state (ui-design-system 5.5, P6.9): one of eight,
 * resolved on the server from data by the pure {@link resolveCardState}.
 * `lib/rewind/home-card.ts` gathers its input; the card only prints it.
 *
 * ## Resolution order
 *
 * ```
 * managed account not included (FR-45) ───────────────────────► null
 * outside the teaser window, flags off or not in the audience ─► null
 * before the teaser window ──► last season: closed (completed) or null
 * Redis missing or down, nothing completed (FR-50) ───────────► unavailable
 * no Plex history, or joined after 1 October (FR-48, 4.5) ─────► not-eligible
 * teaser window (opens minus 11 days), flags off or no run ───► before-season
 * queued or running, nothing completed ───────────────────────► generating
 * failed, nothing completed ──────────────────────────────────► failed
 * completed ──────────────────────────────────────────────────► ready
 * otherwise ──────────────────────────────────────────────────► not-started
 * ```
 *
 * ## Special cases
 *
 * - The teaser window (from 20 November) is exempt from `rewindEnabled` and
 *   `rewindAudience`, because P7.16 turns them on only on 27 November, for
 *   admins (Rewind 13.2). It reveals nothing and starts nothing.
 * - A completed Rewind stays on show while it is regenerated, and Redis is
 *   not needed to open it (FR-40), so `generating`, `failed` and
 *   `unavailable` apply only while nothing is completed.
 * - Nothing here offers a generate action: the season fan-out makes every
 *   issue (Rewind 9.2).
 *
 * Client-safe: the card and its island import the types.
 *
 * @module lib/rewind/home-card-state
 */

import type { InkName } from "@/lib/design/tokens"
import type { RewindInfraCode } from "@/lib/rewind/infra-copy"
import type { RewindStatus } from "@/lib/rewind/rewind-status"
import type { RewindEligibility } from "@/lib/wrapped/eligibility"
import type { RewindErrorCode } from "@/lib/wrapped/generation-errors"
import { dayKey, formatDayKey, wallTimeToInstant, zonedParts } from "@/lib/utils/zoned-time"

/** The weekly soundtrack as the strip draws it, in a `width` x `height` viewBox. */
export interface SoundtrackGeometry {
  d: string
  centre: number
  dotted: { x1: number; x2: number } | null
  width: number
  height: number
}

type RewindCardShare = { state: "off" } | { state: "on"; pages: number; expiresOn: Date | null }

export type RewindCardState =
  | {
      kind: "ready"
      year: number
      /** Printed pages and the autoplay running time, from the registry; null for a pre-v3 row. */
      pages: number | null
      readMs: number | null
      edition: "full" | "pocket" | "postcard" | null
      ink: InkName
      soundtrack: SoundtrackGeometry | null
      share: RewindCardShare
      /** False for a lapsed member while Stripe is on (FR-51). */
      canShare: boolean
      unread: boolean
      /** "Data through November 30", or "Final cut" (FR-34); null for a pre-v3 row. */
      dataThrough: string | null
    }
  | { kind: "generating"; year: number }
  | { kind: "failed"; year: number; code: RewindErrorCode }
  | { kind: "before-season"; year: number; opensOn: Date; lastYear: number | null }
  | { kind: "not-eligible"; reason: "jellyfin-only" | "joined-late"; firstYear?: number }
  | { kind: "closed"; year: number; closedOn: Date; ink: InkName; soundtrack: SoundtrackGeometry | null }
  | { kind: "not-started"; year: number }
  | { kind: "unavailable"; year: number; viewerIsAdmin: boolean; code: RewindInfraCode }

export type RewindCardKind = RewindCardState["kind"]

/** A completed earlier year on the card's footer. */
export interface RewindArchiveYear {
  year: number
  ink: InkName
  status: "ready" | "watched"
}

/** A completed Rewind, as the strip and meta line need it. */
export type CompletedIssue = Omit<Extract<RewindCardState, { kind: "ready" }>, "kind" | "year">

export interface CardStateInput {
  now: Date
  /** The server zone, where the season, the teaser and the joining date are counted. */
  zone: string
  season: { seasonYear: number; opensAt: Date }
  /** When the last season (`seasonYear - 1`) closed: exclusive, 00:00 after its close day. */
  lastSeasonClosesAt: Date
  flags: { rewindEnabled: boolean; rewindAudience: string }
  viewer: { isAdmin: boolean; joinedAt: Date }
  eligibility: RewindEligibility
  /** A run skipped the member as a managed account and the admin has not included them (FR-45). */
  excludedManaged: boolean
  /** The season year's status (`deriveRewindStatus`). */
  status: RewindStatus
  /** The season year's completed issue, or null. */
  issue: CompletedIssue | null
  /** The last season's completed issue, or null. */
  lastIssue: CompletedIssue | null
  /** The newest completed year before the season year, or null. */
  lastYear: number | null
}

/** Days before the season opens that the card starts saying when it arrives (Rewind 4.4: 20 November). */
const TEASER_DAYS = 11

/** 00:00 in `zone`, `TEASER_DAYS` calendar days before `opensAt`. */
export function teaserStartsAt(opensAt: Date, zone: string): Date {
  const { year, month, day } = zonedParts(opensAt.getTime(), zone)
  const date = new Date(Date.UTC(year, month - 1, day - TEASER_DAYS))
  return wallTimeToInstant(`${formatDayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())}T00:00`, zone)
}

/** Joined after 1 October of the season year, in the server zone (Rewind 4.5). */
export function joinedLate(joinedAt: Date, seasonYear: number, zone: string): boolean {
  return dayKey(joinedAt.getTime(), zone) > `${seasonYear}-10-01`
}

/** Resolves the card in the module's order; null means no card at all. */
export function resolveCardState(input: CardStateInput): RewindCardState | null {
  const { now, zone, season, flags, viewer, status, issue } = input
  const year = season.seasonYear
  if (input.excludedManaged) return null

  const teaser = now >= teaserStartsAt(season.opensAt, zone) && now < season.opensAt
  const open = now >= season.opensAt
  const allowed = flags.rewindEnabled && (flags.rewindAudience === "all" || viewer.isAdmin)
  if (!teaser && !allowed) return null

  if (!teaser && !open) {
    const last = input.lastIssue
    return last ? { kind: "closed", year: year - 1, closedOn: input.lastSeasonClosesAt, ink: last.ink, soundtrack: last.soundtrack } : null
  }

  if (!issue) {
    if (status.state === "unavailable" && status.errorCode) {
      return { kind: "unavailable", year, viewerIsAdmin: viewer.isAdmin, code: status.errorCode as RewindInfraCode }
    }
    if (!input.eligibility.eligible) return { kind: "not-eligible", reason: "jellyfin-only" }
    if (joinedLate(viewer.joinedAt, year, zone)) return { kind: "not-eligible", reason: "joined-late", firstYear: year + 1 }
  }

  if (teaser && (!allowed || (!issue && status.state === "none"))) {
    return { kind: "before-season", year, opensOn: season.opensAt, lastYear: input.lastYear }
  }

  if (issue) return { kind: "ready", year, ...issue }
  if (status.state === "queued" || status.state === "running") return { kind: "generating", year }
  if (status.state === "failed") return { kind: "failed", year, code: status.errorCode as RewindErrorCode }
  return { kind: "not-started", year }
}

/**
 * The year the member nav's "Rewind {year}" opens, or null to hide it: the
 * card's year when `/rewind` has something to show for it, else the newest
 * archived year.
 */
export function rewindNavYear(state: RewindCardState | null, archive: readonly RewindArchiveYear[]): number | null {
  if (state && ["ready", "closed", "generating", "failed", "not-started"].includes(state.kind) && "year" in state) {
    return state.year
  }
  return archive[0]?.year ?? null
}
