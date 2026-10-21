/**
 * The home RewindCard's resolver (P6.9): every state and every null case, in
 * America/Chicago with the default 1 December to 31 January season.
 */

import {
  joinedLate,
  resolveCardState,
  rewindNavYear,
  teaserStartsAt,
  type CardStateInput,
  type CompletedIssue,
} from "@/lib/rewind/home-card-state"
import type { RewindStatus } from "@/lib/rewind/rewind-status"
import { wallTimeToInstant } from "@/lib/utils/zoned-time"

const ZONE = "America/Chicago"
const at = (wall: string) => wallTimeToInstant(wall, ZONE)
const OPENS = at("2026-12-01T00:00")

const status = (state: RewindStatus["state"], errorCode: RewindStatus["errorCode"] = null): RewindStatus => ({
  state,
  errorCode,
  startedAt: null,
  hasCompleted: state === "completed",
})

const ISSUE: CompletedIssue = {
  pages: 18,
  readMs: 140_140,
  edition: "full",
  ink: "ultramarine",
  soundtrack: null,
  share: { state: "off" },
  canShare: true,
  unread: true,
  dataThrough: "Data through November 30",
}

function input(overrides: Partial<CardStateInput> = {}): CardStateInput {
  return {
    now: at("2026-12-05T12:00"),
    zone: ZONE,
    season: { seasonYear: 2026, opensAt: OPENS },
    lastSeasonClosesAt: at("2026-02-01T00:00"),
    flags: { rewindEnabled: true, rewindAudience: "all" },
    viewer: { isAdmin: false, joinedAt: at("2024-03-01T00:00") },
    eligibility: { eligible: true },
    excludedManaged: false,
    status: status("none"),
    issue: null,
    lastIssue: null,
    lastYear: null,
    ...overrides,
  }
}

const OFF = { rewindEnabled: false, rewindAudience: "admins" }

describe("resolveCardState", () => {
  it("starts the teaser at 00:00 on 20 November, with the flags off", () => {
    expect(teaserStartsAt(OPENS, ZONE)).toEqual(at("2026-11-20T00:00"))
    expect(resolveCardState(input({ flags: OFF, now: at("2026-11-19T23:59") }))).toBeNull()
    expect(resolveCardState(input({ flags: OFF, now: at("2026-11-20T00:00"), lastYear: 2025 }))).toEqual({
      kind: "before-season",
      year: 2026,
      opensOn: OPENS,
      lastYear: 2025,
    })
  })

  it("keeps a member's flags-off teaser from showing a Rewind an admin made early", () => {
    const now = at("2026-11-27T09:00")
    expect(resolveCardState(input({ now, flags: OFF, issue: ISSUE }))?.kind).toBe("before-season")
    // P7.16 turns the flags on for admins on 27 November: their issue is ready
    const admins = { rewindEnabled: true, rewindAudience: "admins" }
    expect(resolveCardState(input({ now, flags: admins, viewer: { isAdmin: true, joinedAt: at("2024-01-01T00:00") }, issue: ISSUE }))?.kind).toBe("ready")
    expect(resolveCardState(input({ now, flags: admins, viewer: { isAdmin: true, joinedAt: at("2024-01-01T00:00") } }))?.kind).toBe("before-season")
  })

  it.each([
    ["the flags are off", { flags: OFF }],
    ["the member is outside an admins-only audience", { flags: { rewindEnabled: true, rewindAudience: "admins" } }],
    ["the member is an excluded managed account", { excludedManaged: true }],
    ["the teaser is on but the member is an excluded managed account", { excludedManaged: true, now: at("2026-11-21T10:00") }],
  ])("is null when %s", (_, overrides) => {
    expect(resolveCardState(input(overrides as Partial<CardStateInput>))).toBeNull()
  })

  it("says Redis is missing, with the admin copy for admins (FR-50)", () => {
    const down = status("unavailable", "REDIS_NOT_CONFIGURED")
    expect(resolveCardState(input({ status: down }))).toEqual({ kind: "unavailable", year: 2026, viewerIsAdmin: false, code: "REDIS_NOT_CONFIGURED" })
    expect(resolveCardState(input({ status: down, viewer: { isAdmin: true, joinedAt: at("2024-01-01T00:00") } }))).toMatchObject({ viewerIsAdmin: true })
  })

  it("still opens a completed Rewind while Redis is down or a run regenerates it (FR-40)", () => {
    expect(resolveCardState(input({ status: status("unavailable", "REDIS_UNAVAILABLE"), issue: ISSUE }))?.kind).toBe("ready")
    expect(resolveCardState(input({ status: status("running"), issue: ISSUE }))?.kind).toBe("ready")
  })

  it.each([
    ["no Plex identity", "NO_PLEX_IDENTITY"],
    ["no Tautulli match", "NO_TAUTULLI_MATCH"],
  ] as const)("explains a member with %s that Rewind needs Plex history (FR-48)", (_, reason) => {
    expect(resolveCardState(input({ eligibility: { eligible: false, reason } }))).toEqual({ kind: "not-eligible", reason: "jellyfin-only" })
  })

  it("counts a member who joined on 1 October, and not one who joined on 2 October", () => {
    expect(joinedLate(at("2026-10-01T23:30"), 2026, ZONE)).toBe(false)
    expect(joinedLate(at("2026-10-02T00:00"), 2026, ZONE)).toBe(true)
    expect(resolveCardState(input({ viewer: { isAdmin: false, joinedAt: at("2026-10-01T23:30") } }))?.kind).toBe("not-started")
    expect(resolveCardState(input({ viewer: { isAdmin: false, joinedAt: at("2026-10-02T00:00") } }))).toEqual({
      kind: "not-eligible",
      reason: "joined-late",
      firstYear: 2027,
    })
  })

  it("shows a queued or running run as generating", () => {
    expect(resolveCardState(input({ status: status("queued") }))).toEqual({ kind: "generating", year: 2026 })
    expect(resolveCardState(input({ status: status("running") }))).toEqual({ kind: "generating", year: 2026 })
  })

  it("shows a failure by its code", () => {
    expect(resolveCardState(input({ status: status("failed", "TIMEOUT") }))).toEqual({ kind: "failed", year: 2026, code: "TIMEOUT" })
  })

  it.each([true, false])("is ready with unread %s", (unread) => {
    expect(resolveCardState(input({ issue: { ...ISSUE, unread } }))).toEqual({ kind: "ready", year: 2026, ...ISSUE, unread })
  })

  it("is not started while the season is open and nothing has run", () => {
    expect(resolveCardState(input())).toEqual({ kind: "not-started", year: 2026 })
  })

  it("is closed after 31 January with last season's Rewind, and null without one", () => {
    const now = at("2027-02-01T00:00")
    const next = { seasonYear: 2027, opensAt: at("2027-12-01T00:00") }
    const closesAt = at("2027-02-01T00:00")
    expect(resolveCardState(input({ now, season: next, lastSeasonClosesAt: closesAt, lastIssue: { ...ISSUE, ink: "forest" } }))).toEqual({
      kind: "closed",
      year: 2026,
      closedOn: closesAt,
      ink: "forest",
      soundtrack: null,
    })
    expect(resolveCardState(input({ now, season: next, lastSeasonClosesAt: closesAt }))).toBeNull()
  })
})

describe("rewindNavYear", () => {
  it("opens the card's year when there is something there, else the newest archived year", () => {
    expect(rewindNavYear({ kind: "generating", year: 2026 }, [])).toBe(2026)
    expect(rewindNavYear({ kind: "not-eligible", reason: "jellyfin-only" }, [])).toBeNull()
    expect(rewindNavYear({ kind: "before-season", year: 2026, opensOn: OPENS, lastYear: 2025 }, [{ year: 2025, ink: "marigold", status: "watched" }])).toBe(2025)
    expect(rewindNavYear(null, [])).toBeNull()
  })
})
