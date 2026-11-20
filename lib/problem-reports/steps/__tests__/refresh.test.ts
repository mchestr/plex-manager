/**
 * Refresh the details: gated and recorded, then Plex reads the details
 * again. An admin's run goes back to them to check the details; a member's
 * run checks Plex's match first, and is fixed once Plex has the request.
 */

import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { refreshPlexItem } from "@/lib/connections/plex-library-actions"
import { gateAndRecord } from "@/lib/problem-reports/ledger"
import { checkMatch } from "@/lib/problem-reports/match"
import { runRefresh } from "@/lib/problem-reports/steps/refresh"

jest.mock("@/lib/connections/plex-config", () => ({ getActivePlexServerConfig: jest.fn() }))
jest.mock("@/lib/connections/plex-library-actions", () => ({ refreshPlexItem: jest.fn() }))
jest.mock("@/lib/problem-reports/ledger", () => ({ gateAndRecord: jest.fn() }))
jest.mock("@/lib/problem-reports/match", () => ({ checkMatch: jest.fn() }))

const NOW = new Date("2026-11-09T20:00:00Z")
const SERVER = { name: "Home", url: "http://plex.local:32400", token: "owner-token", adminPlexUserId: "owner", machineIdentifier: "m" }
const REPORT = { id: "report-1", runToken: 1, action: "REFRESH" as const, reporterId: "member-1", plexRatingKey: "555", titleKey: "plex://movie/heat" }
const DATA = { reportId: "report-1", runToken: 1, step: "start" as const, trigger: "web" as const, actorUserId: "admin-1" }
const MEMBER = { ...DATA, trigger: "automatic" as const, actorUserId: "member-1" }
const TARGET = { ratingKey: "555", sectionId: "1", type: "movie" as const, guid: "plex://movie/wrong", title: "Heat" }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getActivePlexServerConfig).mockResolvedValue(SERVER)
  jest.mocked(gateAndRecord).mockResolvedValue(null)
  jest.mocked(refreshPlexItem).mockResolvedValue(true)
  jest.mocked(checkMatch).mockResolvedValue({ verdict: "AGREES" })
})

describe("runRefresh: an admin's run", () => {
  it("records the run against the title's guid, asks Plex to refresh the item, and hands it back to check", async () => {
    await expect(runRefresh(REPORT, DATA, NOW)).resolves.toEqual({ toAdmin: "REFRESHED" })
    expect(gateAndRecord).toHaveBeenCalledWith(expect.objectContaining({ target: "plex:plex://movie/heat", action: "REFRESH", actorUserId: "admin-1", trigger: "web" }), NOW)
    expect(refreshPlexItem).toHaveBeenCalledWith(SERVER, "555")
    expect(checkMatch).not.toHaveBeenCalled()
  })

  it("says when Plex refused, and doesn't refresh twice", async () => {
    jest.mocked(refreshPlexItem).mockResolvedValue(false)
    await expect(runRefresh(REPORT, DATA, NOW)).resolves.toEqual({ toAdmin: "REFRESH_FAILED" })

    jest.mocked(refreshPlexItem).mockClear()
    jest.mocked(gateAndRecord).mockResolvedValue("ALREADY_RAN")
    await expect(runRefresh(REPORT, DATA, NOW)).resolves.toEqual({ toAdmin: "REFRESHED" })
    expect(refreshPlexItem).not.toHaveBeenCalled()
  })

  it("hands the report back past the hour's Plex changes, and needs a Plex server", async () => {
    jest.mocked(gateAndRecord).mockResolvedValue("PLEX_CAP")
    await expect(runRefresh(REPORT, DATA, NOW)).resolves.toEqual({ toAdmin: "PLEX_CAP" })

    jest.mocked(getActivePlexServerConfig).mockResolvedValue(null)
    await expect(runRefresh(REPORT, DATA, NOW)).resolves.toEqual({ toAdmin: "UNAVAILABLE" })
  })
})

describe("runRefresh: a member's run", () => {
  it("checks the match, refreshes, and is fixed", async () => {
    await expect(runRefresh(REPORT, MEMBER, NOW)).resolves.toEqual({ fixed: true })
    expect(checkMatch).toHaveBeenCalledWith(SERVER, "555")
    expect(refreshPlexItem).toHaveBeenCalledWith(SERVER, "555")
  })

  it("is fixed when the step runs again after its row was recorded, without refreshing twice", async () => {
    jest.mocked(gateAndRecord).mockResolvedValue("ALREADY_RAN")

    await expect(runRefresh(REPORT, MEMBER, NOW)).resolves.toEqual({ fixed: true })
    expect(refreshPlexItem).not.toHaveBeenCalled()
  })

  it.each([
    ["Plex has another title than Radarr", { verdict: "DIFFERS" as const, target: TARGET, expected: { ids: { tmdb: 949, imdb: null }, title: "Heat", year: 1995 } }, "MISMATCH"],
    ["the episode order differs", { verdict: "UNKNOWN" as const, reason: "EPISODE_ORDER" as const }, "EPISODE_ORDER"],
    ["the match can't be told", { verdict: "UNKNOWN" as const, reason: "NOT_IN_RADARR" as const }, "NOT_IN_RADARR"],
  ])("refreshes nothing and hands the report back when %s", async (_label, check, reason) => {
    jest.mocked(checkMatch).mockResolvedValue(check)

    await expect(runRefresh(REPORT, MEMBER, NOW)).resolves.toEqual({ toAdmin: reason })
    expect(gateAndRecord).not.toHaveBeenCalled()
    expect(refreshPlexItem).not.toHaveBeenCalled()
  })
})
