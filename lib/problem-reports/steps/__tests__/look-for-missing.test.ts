/**
 * Look for the episodes: the start (gate, then a search or a scan, once)
 * and the wait (fixed when nothing is missing, one scan for files Plex
 * lacks, and the server admin at the deadline).
 */

import { scanPlexFolder } from "@/lib/connections/plex-library-actions"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { searchSonarrEpisodes } from "@/lib/connections/arr-writes"
import { gateAndRecord } from "@/lib/problem-reports/ledger"
import { runLookForMissing } from "@/lib/problem-reports/steps/look-for-missing"
import { readMissingState, type MissingState } from "@/lib/problem-reports/steps/missing-state"

jest.mock("@/lib/connections/plex-config", () => ({ getActivePlexServerConfig: jest.fn() }))
jest.mock("@/lib/connections/plex-library-actions", () => ({ scanPlexFolder: jest.fn() }))
jest.mock("@/lib/connections/arr-writes", () => ({ searchSonarrEpisodes: jest.fn() }))
jest.mock("@/lib/problem-reports/ledger", () => ({ gateAndRecord: jest.fn() }))
jest.mock("@/lib/problem-reports/steps/missing-state", () => ({ readMissingState: jest.fn() }))

const NOW = new Date("2026-11-09T20:00:00Z")
const MINUTE = 60_000
const SERVER = { name: "Home", url: "http://plex.local:32400", token: "owner-token", adminPlexUserId: "owner", machineIdentifier: "m" }
const REPORT = { id: "report-1", runToken: 3, action: "LOOK_FOR_MISSING" as const, reporterId: "member-1", plexRatingKey: "6999", titleKey: "plex://show/the-office" }
const START = { reportId: "report-1", runToken: 3, step: "start" as const, trigger: "automatic" as const, actorUserId: "member-1" }
const SHOW = { ratingKey: "6999", type: "show", title: "The Office", ids: { tvdb: 73244 }, librarySectionId: "2", media: [], locations: ["/tv/The Office"] }
const SONARR = { name: "Sonarr", url: "http://sonarr.local:8989", apiKey: "arr-key" }
const state = (decision: Extract<MissingState, { ok: true }>["decision"]): MissingState => ({ ok: true, sonarr: SONARR, show: SHOW, seriesId: 42, decision })

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getActivePlexServerConfig).mockResolvedValue(SERVER)
  jest.mocked(gateAndRecord).mockResolvedValue(null)
  jest.mocked(searchSonarrEpisodes).mockResolvedValue({ success: true, data: { id: 900 } })
  jest.mocked(scanPlexFolder).mockResolvedValue(true)
})

describe("the start", () => {
  it("records the search, asks Sonarr for the episodes, and waits ten minutes, for a day at most", async () => {
    jest.mocked(readMissingState).mockResolvedValue(state({ kind: "SEARCH", episodeIds: [11, 12] }))

    await expect(runLookForMissing(REPORT, START, NOW)).resolves.toEqual({
      next: { at: NOW.getTime() + 10 * MINUTE, data: { step: "wait", targets: [11, 12], deadline: NOW.getTime() + 24 * 60 * MINUTE } },
    })
    expect(gateAndRecord).toHaveBeenCalledWith(expect.objectContaining({ target: "sonarr:series:42", action: "LOOK_FOR_MISSING", traits: { searches: true, replacesFile: false, changesPlex: false }, trigger: "automatic" }), NOW)
    expect(searchSonarrEpisodes).toHaveBeenCalledWith(SONARR, [11, 12])
  })

  it("scans the show's folder for files Sonarr has, which is not a search", async () => {
    jest.mocked(readMissingState).mockResolvedValue(state({ kind: "SCAN", episodeIds: [13] }))

    await expect(runLookForMissing(REPORT, START, NOW)).resolves.toEqual({
      next: { at: NOW.getTime() + 2 * MINUTE, data: { step: "wait", targets: [13], deadline: NOW.getTime() + 30 * MINUTE, scannedAt: NOW.getTime() } },
    })
    expect(gateAndRecord).toHaveBeenCalledWith(expect.objectContaining({ action: "SCAN", traits: { searches: false, replacesFile: false, changesPlex: false } }), NOW)
    expect(scanPlexFolder).toHaveBeenCalledWith(SERVER, "2", "/tv/The Office")
    expect(searchSonarrEpisodes).not.toHaveBeenCalled()
  })

  it("doesn't search twice when the step runs again after its row was recorded", async () => {
    jest.mocked(readMissingState).mockResolvedValue(state({ kind: "SEARCH", episodeIds: [11] }))
    jest.mocked(gateAndRecord).mockResolvedValue("ALREADY_RAN")

    await expect(runLookForMissing(REPORT, START, NOW)).resolves.toMatchObject({ next: { data: { step: "wait", targets: [11] } } })
    expect(searchSonarrEpisodes).not.toHaveBeenCalled()
  })

  it.each([
    ["the gate refuses it", () => jest.mocked(gateAndRecord).mockResolvedValue("SEARCH_CAP"), "SEARCH_CAP"],
    ["Sonarr refuses the search", () => jest.mocked(searchSonarrEpisodes).mockResolvedValue({ success: false, error: "Sonarr is down" }), "UNAVAILABLE"],
  ])("hands the report back when %s", async (_label, arrange, reason) => {
    jest.mocked(readMissingState).mockResolvedValue(state({ kind: "SEARCH", episodeIds: [11] }))
    arrange()

    await expect(runLookForMissing(REPORT, START, NOW)).resolves.toEqual({ toAdmin: reason })
  })

  it("hands the report back when there is nothing to search or scan, or Sonarr can't be read", async () => {
    jest.mocked(readMissingState).mockResolvedValueOnce(state({ kind: "NOTHING_MISSING" })).mockResolvedValueOnce({ ok: false, reason: "NOT_IN_SONARR" })

    await expect(runLookForMissing(REPORT, START, NOW)).resolves.toEqual({ toAdmin: "NOTHING_MISSING" })
    await expect(runLookForMissing(REPORT, START, NOW)).resolves.toEqual({ toAdmin: "NOT_IN_SONARR" })
    expect(gateAndRecord).not.toHaveBeenCalled()
  })

  it("needs a Plex server", async () => {
    jest.mocked(getActivePlexServerConfig).mockResolvedValue(null)

    await expect(runLookForMissing(REPORT, START, NOW)).resolves.toEqual({ toAdmin: "UNAVAILABLE" })
  })
})

describe("the wait", () => {
  const WAIT = { ...START, step: "wait" as const, targets: [11], deadline: NOW.getTime() + 60 * MINUTE }

  it("is fixed once none of the episodes it waits for are missing", async () => {
    jest.mocked(readMissingState).mockResolvedValue(state({ kind: "NOTHING_MISSING" }))

    await expect(runLookForMissing(REPORT, WAIT, NOW)).resolves.toEqual({ fixed: true })
    expect(readMissingState).toHaveBeenCalledWith(SERVER, "6999", NOW, [11])
  })

  it("keeps waiting for a search until the deadline, then hands the report back", async () => {
    jest.mocked(readMissingState).mockResolvedValue(state({ kind: "SEARCH", episodeIds: [11] }))

    await expect(runLookForMissing(REPORT, WAIT, NOW)).resolves.toEqual({ next: { at: NOW.getTime() + 10 * MINUTE, data: {} } })
    await expect(runLookForMissing(REPORT, { ...WAIT, deadline: NOW.getTime() }, NOW)).resolves.toEqual({ toAdmin: "NOT_FOUND" })
  })

  it("scans once for files Sonarr found, and hands the report back if Plex still lacks them half an hour later", async () => {
    jest.mocked(readMissingState).mockResolvedValue(state({ kind: "SCAN", episodeIds: [11] }))

    await expect(runLookForMissing(REPORT, WAIT, NOW)).resolves.toEqual({ next: { at: NOW.getTime() + 2 * MINUTE, data: { scannedAt: NOW.getTime() } } })
    expect(scanPlexFolder).toHaveBeenCalledTimes(1)

    await expect(runLookForMissing(REPORT, { ...WAIT, scannedAt: NOW.getTime() - 10 * MINUTE }, NOW)).resolves.toEqual({ next: { at: NOW.getTime() + 2 * MINUTE, data: {} } })
    await expect(runLookForMissing(REPORT, { ...WAIT, scannedAt: NOW.getTime() - 30 * MINUTE }, NOW)).resolves.toEqual({ toAdmin: "PLEX_DIDNT_ADD" })
    expect(scanPlexFolder).toHaveBeenCalledTimes(1)
  })

  it("rides out a service that didn't answer until the deadline", async () => {
    jest.mocked(readMissingState).mockResolvedValue({ ok: false, reason: "UNAVAILABLE" })

    await expect(runLookForMissing(REPORT, WAIT, NOW)).resolves.toEqual({ next: { at: NOW.getTime() + 10 * MINUTE, data: {} } })
    await expect(runLookForMissing(REPORT, { ...WAIT, deadline: NOW.getTime() - 1 }, NOW)).resolves.toEqual({ toAdmin: "UNAVAILABLE" })
  })

  it("hands the report back when Sonarr changed under it", async () => {
    jest.mocked(readMissingState).mockResolvedValue(state({ kind: "NOT_ON_SERVER", seasons: [1] }))

    await expect(runLookForMissing(REPORT, WAIT, NOW)).resolves.toEqual({ toAdmin: "NOT_ON_SERVER" })
  })
})
