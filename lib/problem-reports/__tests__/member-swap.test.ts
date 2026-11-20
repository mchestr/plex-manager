/**
 * A member's own swap and fix of the Plex match: what the sheet offers while
 * members' swaps are On, and what the report starts in On and Dry run, from
 * the settings, the member, the ledger, their plays and the match.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { isPlexItemPlaying } from "@/lib/connections/plex-file-state"
import { getActiveService } from "@/lib/data/active-service"
import { checkMatch } from "@/lib/problem-reports/match"
import { decideMatchForMember, decideSwapForMember, memberFixesFor } from "@/lib/problem-reports/member-swap"
import { readSwapLedger } from "@/lib/problem-reports/swap-ledger"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/connections/plex-file-state", () => ({ isPlexItemPlaying: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/problem-reports/match", () => ({ checkMatch: jest.fn() }))
jest.mock("@/lib/problem-reports/swap-ledger", () => ({ readSwapLedger: jest.fn() }))

const NOW = new Date("2026-11-09T20:00:00Z")
const DAY = 24 * 60 * 60 * 1000
const SERVER = { name: "Home", url: "http://plex.local:32400", token: "owner-token", adminPlexUserId: "1", machineIdentifier: "m" }
const MOVIE = { ratingKey: "555", type: "movie", title: "Heat", guid: "plex://movie/heat", ids: { tmdb: 949 }, media: [], locations: [] }
const PLAYED = { player: "Living Room", transcoded: false, at: new Date(NOW.getTime() - 2 * DAY).toISOString() }
const TITLE = { userId: "member-1", item: MOVIE, server: SERVER, lastPlay: PLAYED }
const LEDGER = { memberSwaps: [new Date(NOW.getTime() - 3 * DAY)], titleRecent: 0, titleTwoMonths: 0, serverToday: 0 }
const settings = (automatic: "OFF" | "DRY_RUN" | "ON") => ({ automatic, automaticSince: null, weeklySwaps: 3, titleCooldownDays: 14, dailySwapCap: 10, breakerTrippedAt: null })
const day = (date: Date) => date.toISOString().slice(0, 10)
const REPORT = { userId: "member-1", item: MOVIE, server: SERVER, problem: "wont_start" as const, device: "others_play" as const, evidence: { lastPlay: PLAYED, playedToEnd: false }, chose: true }

beforeEach(() => {
  mockReset(prismaMock)
  jest.resetAllMocks()
  prismaMock.problemReportSettings.findUnique.mockResolvedValue(settings("ON") as never)
  prismaMock.user.findUnique.mockResolvedValue({ swapsNeedApproval: false, plexUserId: "42" } as never)
  jest.mocked(getActiveService).mockResolvedValue({ name: "Radarr", url: "http://radarr.local", apiKey: "key" } as never)
  jest.mocked(readSwapLedger).mockResolvedValue(LEDGER)
  jest.mocked(isPlexItemPlaying).mockResolvedValue(false)
})

describe("memberFixesFor", () => {
  it("offers a swap with the allowance in words, and fixes of the match, while members' swaps are On", async () => {
    await expect(memberFixesFor(TITLE, day, NOW)).resolves.toEqual({ swap: { ok: true, left: 2, of: 3, nextBack: "2026-11-13" }, matchFixes: true })
    expect(readSwapLedger).toHaveBeenCalledWith(prismaMock, { reporterId: "member-1", titleKey: "plex://movie/heat", cooldownDays: 14 }, NOW)
    expect(isPlexItemPlaying).not.toHaveBeenCalled()
  })

  it("says why with the date in words when the gate refuses", async () => {
    jest.mocked(readSwapLedger).mockResolvedValue({ ...LEDGER, memberSwaps: [1, 2, 3].map((days) => new Date(NOW.getTime() - days * DAY)) })

    await expect(memberFixesFor(TITLE, day, NOW)).resolves.toMatchObject({ swap: { ok: false, reason: "OUT_OF_SWAPS", until: "2026-11-13" } })
  })

  it("counts a title the member is watching now when Tautulli has no recent play of it", async () => {
    jest.mocked(isPlexItemPlaying).mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const old = { ...TITLE, lastPlay: { ...PLAYED, at: new Date(NOW.getTime() - 40 * DAY).toISOString() } }

    await expect(memberFixesFor(old, day, NOW)).resolves.toMatchObject({ swap: { ok: true } })
    expect(isPlexItemPlaying).toHaveBeenCalledWith(SERVER, "555", { plexUserId: "42", isOwner: false })
    await expect(memberFixesFor({ ...old, lastPlay: null }, day, NOW)).resolves.toMatchObject({ swap: { ok: false, reason: "NOT_PLAYED" } })
  })

  it("offers nothing in Dry run or Off, and no swap without the service that keeps the file", async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue(settings("DRY_RUN") as never)
    await expect(memberFixesFor(TITLE, day, NOW)).resolves.toEqual({ swap: null, matchFixes: false })

    prismaMock.problemReportSettings.findUnique.mockResolvedValue(settings("ON") as never)
    jest.mocked(getActiveService).mockResolvedValue(null)
    await expect(memberFixesFor(TITLE, day, NOW)).resolves.toEqual({ swap: null, matchFixes: true })
    await expect(memberFixesFor({ ...TITLE, item: { ...MOVIE, type: "show" } }, day, NOW)).resolves.toEqual({ swap: null, matchFixes: true })
  })
})

describe("decideSwapForMember", () => {
  it("starts a swap the member chose, within the limits", async () => {
    await expect(decideSwapForMember(REPORT, NOW)).resolves.toEqual({ startsFix: true, dryRun: false })
  })

  it("never spends a swap the member didn't choose while members' swaps are On", async () => {
    await expect(decideSwapForMember({ ...REPORT, chose: false }, NOW)).resolves.toBeNull()
  })

  it("tells the server admin why a member who sent it to them wasn't offered a swap", async () => {
    jest.mocked(readSwapLedger).mockResolvedValue({ ...LEDGER, memberSwaps: [1, 2, 3].map((days) => new Date(NOW.getTime() - days * DAY)) })

    await expect(decideSwapForMember({ ...REPORT, chose: false }, NOW)).resolves.toEqual({ startsFix: false, reason: "OUT_OF_SWAPS" })
  })

  it("runs a dry run on what the member described, chosen or not", async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue(settings("DRY_RUN") as never)

    await expect(decideSwapForMember({ ...REPORT, chose: false }, NOW)).resolves.toEqual({ startsFix: true, dryRun: true })
  })

  it("sends it to the server admin with the gate's reason, or because the copy played to the end", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ swapsNeedApproval: true, plexUserId: "42" } as never)
    await expect(decideSwapForMember(REPORT, NOW)).resolves.toEqual({ startsFix: false, reason: "NEEDS_APPROVAL" })

    await expect(decideSwapForMember({ ...REPORT, evidence: { ...REPORT.evidence, playedToEnd: true } }, NOW)).resolves.toEqual({ startsFix: false, reason: "PLAYED_TO_END" })
  })

  it("tells the server admin whether the breaker or today's limit paused it", async () => {
    jest.mocked(readSwapLedger).mockResolvedValue({ ...LEDGER, serverToday: 10 })
    await expect(decideSwapForMember(REPORT, NOW)).resolves.toEqual({ startsFix: false, reason: "PAUSED" })

    prismaMock.problemReportSettings.findUnique.mockResolvedValue({ ...settings("ON"), breakerTrippedAt: NOW } as never)
    await expect(decideSwapForMember(REPORT, NOW)).resolves.toEqual({ startsFix: false, reason: "BREAKER" })
  })

  it("leaves the report as it was while members' swaps are off, or when it isn't a swap's problem", async () => {
    await expect(decideSwapForMember({ ...REPORT, device: "nothing_plays" }, NOW)).resolves.toBeNull()
    prismaMock.problemReportSettings.findUnique.mockResolvedValue(settings("OFF") as never)
    await expect(decideSwapForMember(REPORT, NOW)).resolves.toBeNull()
    expect(readSwapLedger).not.toHaveBeenCalled()
  })
})

describe("decideMatchForMember", () => {
  const DIFFERS = { verdict: "DIFFERS" as const, target: { ratingKey: "555", sectionId: "1", type: "movie" as const, guid: "plex://movie/heap", title: "Heap" }, expected: { ids: { tmdb: 949, imdb: null }, title: "Heat", year: 1995 } }

  it("fixes a match that differs while members' swaps are On", async () => {
    jest.mocked(checkMatch).mockResolvedValue(DIFFERS)

    await expect(decideMatchForMember(SERVER, MOVIE)).resolves.toEqual({ startsFix: true })
    expect(checkMatch).toHaveBeenCalledWith(SERVER, "555")
  })

  it("tells the server admin what the check found in Dry run, or when the match agrees or can't be told", async () => {
    jest.mocked(checkMatch).mockResolvedValueOnce({ verdict: "AGREES" }).mockResolvedValueOnce({ verdict: "UNKNOWN", reason: "EPISODE_ORDER" }).mockResolvedValueOnce(DIFFERS)
    await expect(decideMatchForMember(SERVER, MOVIE)).resolves.toEqual({ startsFix: false, reason: "IDS_AGREE" })
    await expect(decideMatchForMember(SERVER, MOVIE)).resolves.toEqual({ startsFix: false, reason: "EPISODE_ORDER" })

    prismaMock.problemReportSettings.findUnique.mockResolvedValue(settings("DRY_RUN") as never)
    await expect(decideMatchForMember(SERVER, MOVIE)).resolves.toEqual({ startsFix: false, reason: "MISMATCH" })
  })

  it("checks nothing while members' swaps are off", async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue(settings("OFF") as never)

    await expect(decideMatchForMember(SERVER, MOVIE)).resolves.toBeNull()
    expect(checkMatch).not.toHaveBeenCalled()
  })

  it("fixes the match for a member whose swaps need approval, past the swap limits and while the breaker is tripped, since a match changes no file", async () => {
    jest.mocked(checkMatch).mockResolvedValue(DIFFERS)
    prismaMock.problemReportSettings.findUnique.mockResolvedValue({ ...settings("ON"), breakerTrippedAt: NOW } as never)
    prismaMock.user.findUnique.mockResolvedValue({ swapsNeedApproval: true, plexUserId: "42" } as never)
    jest.mocked(readSwapLedger).mockResolvedValue({ ...LEDGER, memberSwaps: [NOW, NOW, NOW], serverToday: 10 })

    await expect(decideMatchForMember(SERVER, MOVIE)).resolves.toEqual({ startsFix: true })
    await expect(memberFixesFor(TITLE, day, NOW)).resolves.toMatchObject({ matchFixes: true })
  })
})
