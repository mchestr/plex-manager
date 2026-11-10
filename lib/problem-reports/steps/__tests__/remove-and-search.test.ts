/**
 * Remove the file and search: the start (wait to start, the bad copy, the
 * gate, the bad copy marked failed, then the delete), the search a minute
 * later (monitored again first) and the wait (the shared check, then the end
 * once the new copy is in, or nothing grabbed).
 */

import { getArrCommandState } from "@/lib/connections/arr-upgrade"
import { deleteArrFile, failArrGrab, monitorRadarrMovie, monitorSonarrEpisodes, searchSonarrEpisodes, startRadarrMovieSearch } from "@/lib/connections/arr-writes"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { getActiveService } from "@/lib/data/active-service"
import { findBadCopy } from "@/lib/problem-reports/bad-copy"
import { gateAndRecord } from "@/lib/problem-reports/ledger"
import type { ResolvedFile } from "@/lib/problem-reports/resolve"
import { checkCopy } from "@/lib/problem-reports/steps/copy-wait"
import { runRemoveAndSearch } from "@/lib/problem-reports/steps/remove-and-search"
import { finishReplace, readyToReplace } from "@/lib/problem-reports/steps/replace"
import type { CopyWatch, ProblemReportFixPayload, ReplaceWatch } from "@/lib/queue/types"

jest.mock("@/lib/connections/arr-upgrade", () => ({ ...jest.requireActual("@/lib/connections/arr-upgrade"), getArrCommandState: jest.fn() }))
jest.mock("@/lib/connections/arr-writes", () => ({
  deleteArrFile: jest.fn(),
  failArrGrab: jest.fn(),
  monitorRadarrMovie: jest.fn(),
  monitorSonarrEpisodes: jest.fn(),
  searchSonarrEpisodes: jest.fn(),
  startRadarrMovieSearch: jest.fn(),
}))
jest.mock("@/lib/connections/plex-config", () => ({ getActivePlexServerConfig: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/problem-reports/bad-copy", () => ({ findBadCopy: jest.fn() }))
jest.mock("@/lib/problem-reports/ledger", () => ({ gateAndRecord: jest.fn() }))
jest.mock("@/lib/problem-reports/steps/replace", () => ({ finishReplace: jest.fn(), readyToReplace: jest.fn() }))
jest.mock("@/lib/problem-reports/steps/copy-wait", () => ({ ...jest.requireActual("@/lib/problem-reports/steps/copy-wait"), checkCopy: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const NOW = new Date("2026-11-09T20:00:00Z")
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const SERVER = { name: "Home", url: "http://plex.local:32400", token: "owner-token", adminPlexUserId: "owner", machineIdentifier: "m" }
const RADARR = { name: "Radarr", url: "http://radarr.local:7878", apiKey: "radarr-key" }
const SONARR = { name: "Sonarr", url: "http://sonarr.local:8989", apiKey: "sonarr-key" }
const REPORT = { id: "report-1", runToken: 3, action: "REMOVE_AND_SEARCH" as const, reporterId: "member-1", plexRatingKey: "555" }
const START: ProblemReportFixPayload = { reportId: "report-1", runToken: 3, step: "start", trigger: "web", actorUserId: "admin-1" }
const FILE = {
  id: 77,
  relativePath: "Heat (1995).mkv",
  path: "/movies/Heat (1995)/Heat (1995).mkv",
  size: 4200,
  qualityCutoffNotMet: false,
  customFormatScore: 0,
  sceneName: "Heat.1995.1080p.BluRay.x264-BAD",
  quality: null,
  languages: [],
}
const PLEX = { ratingKey: "555", guid: "plex://movie/heat", sectionId: "1", file: "/data/movies/Heat (1995)/Heat (1995).mkv", folder: "/data/movies/Heat (1995)" }
const MOVIE: ResolvedFile = { service: "radarr", config: RADARR, titleId: 5, qualityProfileId: 4, file: FILE, episodeIds: [], plex: PLEX }
const BAD = { titles: ["Heat.1995.1080p.BluRay.x264-BAD"], infoHash: null, grab: { id: 10, downloadId: "ABC", title: "Heat.1995.1080p.BluRay.x264-BAD" } }
const WATCH: CopyWatch = { service: "radarr", titleId: 5, fileId: 77, episodeIds: [], commandId: null, since: NOW.getTime(), skipDownloadId: "ABC", sectionId: "1", folder: PLEX.folder }
const REPLACE: ReplaceWatch = { guid: "plex://movie/heat", badGrabId: 10, badRelease: "Heat.1995.1080p.BluRay.x264-BAD", release: null }

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(getActivePlexServerConfig).mockResolvedValue(SERVER)
  jest.mocked(getActiveService).mockImplementation((async (kind: string) => (kind === "radarr" ? RADARR : SONARR)) as never)
  jest.mocked(readyToReplace).mockResolvedValue({ resolved: MOVIE, guid: "plex://movie/heat" })
  jest.mocked(findBadCopy).mockResolvedValue(BAD)
  jest.mocked(gateAndRecord).mockResolvedValue(null)
  jest.mocked(failArrGrab).mockResolvedValue({ success: true, data: null })
  jest.mocked(deleteArrFile).mockResolvedValue({ success: true, data: null })
  jest.mocked(monitorRadarrMovie).mockResolvedValue({ success: true, data: null })
  jest.mocked(monitorSonarrEpisodes).mockResolvedValue({ success: true, data: null })
  jest.mocked(startRadarrMovieSearch).mockResolvedValue({ success: true, data: { id: 31 } })
  jest.mocked(searchSonarrEpisodes).mockResolvedValue({ success: true, data: { id: 32 } })
})

describe("the start", () => {
  it("records the run as replacing, marks the bad copy failed, deletes the file and searches a minute later", async () => {
    await expect(runRemoveAndSearch(REPORT, START, NOW)).resolves.toEqual({ next: { at: NOW.getTime() + MINUTE, data: { step: "search", watch: WATCH, replace: REPLACE } } })
    expect(gateAndRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "radarr:movie:5",
        action: "REMOVE_AND_SEARCH",
        traits: { searches: true, replacesFile: true },
        replaces: true,
        file: { id: 77, release: "Heat.1995.1080p.BluRay.x264-BAD" },
      }),
      NOW
    )
    expect(failArrGrab).toHaveBeenCalledWith("Radarr", RADARR, 10)
    expect(deleteArrFile).toHaveBeenCalledWith("Radarr", RADARR, 77)
    expect(jest.mocked(failArrGrab).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(deleteArrFile).mock.invocationCallOrder[0])
    expect(startRadarrMovieSearch).not.toHaveBeenCalled()
  })

  it("deletes a file added by hand with nothing to mark failed", async () => {
    jest.mocked(findBadCopy).mockResolvedValue({ titles: ["Heat.1995.1080p.BluRay.x264-BAD"], infoHash: null, grab: null })

    await expect(runRemoveAndSearch(REPORT, START, NOW)).resolves.toMatchObject({
      next: { data: { watch: { skipDownloadId: null }, replace: { badGrabId: null, badRelease: null } } },
    })
    expect(failArrGrab).not.toHaveBeenCalled()
    expect(deleteArrFile).toHaveBeenCalled()
  })

  it("stops when the step runs again after its row was recorded, so it never deletes twice or deletes a copy that came in meanwhile", async () => {
    jest.mocked(gateAndRecord).mockResolvedValue("ALREADY_RAN")

    await expect(runRemoveAndSearch(REPORT, START, NOW)).resolves.toEqual({ toAdmin: "INTERRUPTED" })
    expect(failArrGrab).not.toHaveBeenCalled()
    expect(deleteArrFile).not.toHaveBeenCalled()
  })

  it("removes nothing when the bad copy can't be marked failed, so the search can't grab it again", async () => {
    jest.mocked(failArrGrab).mockResolvedValue({ success: false, error: "down" })

    await expect(runRemoveAndSearch(REPORT, START, NOW)).resolves.toEqual({ toAdmin: "UNAVAILABLE" })
    expect(deleteArrFile).not.toHaveBeenCalled()
  })

  it("stops at a failed delete, after the release was blocklisted: a 409 is a missing root folder, and trying again won't help", async () => {
    jest.mocked(deleteArrFile).mockResolvedValueOnce({ success: false, conflict: true, error: "root folder missing" }).mockResolvedValueOnce({ success: false, error: "down" })

    await expect(runRemoveAndSearch(REPORT, START, NOW)).resolves.toEqual({ toAdmin: "ROOT_FOLDER_MISSING" })
    await expect(runRemoveAndSearch(REPORT, START, NOW)).resolves.toEqual({ toAdmin: "DELETE_FAILED" })
    expect(failArrGrab).toHaveBeenCalledTimes(2)
  })

  it.each([
    ["waiting to start decided", () => jest.mocked(readyToReplace).mockResolvedValue({ outcome: { toAdmin: "BUSY" } }), "BUSY"],
    ["the history can't be read", () => jest.mocked(findBadCopy).mockResolvedValue(null), "UNAVAILABLE"],
    ["the gate refuses it", () => jest.mocked(gateAndRecord).mockResolvedValue("BREAKER"), "BREAKER"],
    ["no Plex server is active", () => jest.mocked(getActivePlexServerConfig).mockResolvedValue(null), "UNAVAILABLE"],
  ])("touches nothing when %s", async (_label, arrange, reason) => {
    arrange()

    await expect(runRemoveAndSearch(REPORT, START, NOW)).resolves.toEqual({ toAdmin: reason })
    expect(failArrGrab).not.toHaveBeenCalled()
    expect(deleteArrFile).not.toHaveBeenCalled()
  })
})

describe("the search", () => {
  const searching = (watch: CopyWatch = WATCH): ProblemReportFixPayload => ({ ...START, step: "search", watch, replace: REPLACE })

  it("monitors the movie again, then searches, and waits ten minutes, for a day at most", async () => {
    await expect(runRemoveAndSearch(REPORT, searching(), NOW)).resolves.toEqual({
      next: { at: NOW.getTime() + 10 * MINUTE, data: { step: "wait", deadline: NOW.getTime() + DAY, watch: { ...WATCH, commandId: 31, since: NOW.getTime() } } },
    })
    expect(monitorRadarrMovie).toHaveBeenCalledWith(RADARR, 5)
    expect(startRadarrMovieSearch).toHaveBeenCalledWith(RADARR, 5)
    expect(jest.mocked(monitorRadarrMovie).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(startRadarrMovieSearch).mock.invocationCallOrder[0])
  })

  it("monitors and searches for the file's episodes in Sonarr", async () => {
    await runRemoveAndSearch(REPORT, searching({ ...WATCH, service: "sonarr", titleId: 42, fileId: 501, episodeIds: [11, 12] }), NOW)

    expect(monitorSonarrEpisodes).toHaveBeenCalledWith(SONARR, [11, 12])
    expect(searchSonarrEpisodes).toHaveBeenCalledWith(SONARR, [11, 12])
  })

  it("still searches when the title can't be monitored again", async () => {
    jest.mocked(monitorRadarrMovie).mockResolvedValue({ success: false, error: "down" })

    await expect(runRemoveAndSearch(REPORT, searching(), NOW)).resolves.toMatchObject({ next: { data: { step: "wait" } } })
    expect(startRadarrMovieSearch).toHaveBeenCalled()
  })

  it("hands the report back when the search can't be sent, or Radarr isn't set up any more", async () => {
    jest.mocked(startRadarrMovieSearch).mockResolvedValue({ success: false, error: "down" })
    await expect(runRemoveAndSearch(REPORT, searching(), NOW)).resolves.toEqual({ toAdmin: "SEARCH_FAILED" })

    jest.mocked(getActiveService).mockResolvedValue(null)
    await expect(runRemoveAndSearch(REPORT, searching(), NOW)).resolves.toEqual({ toAdmin: "NO_RADARR" })
  })
})

describe("the wait", () => {
  const waiting = (deadline = NOW.getTime() + DAY): ProblemReportFixPayload => ({ ...START, step: "wait", deadline, watch: { ...WATCH, commandId: 31 }, replace: REPLACE })

  it("ends without marking the bad copy again once the new copy is in", async () => {
    jest.mocked(checkCopy).mockResolvedValue({ imported: true, config: RADARR })
    jest.mocked(finishReplace).mockResolvedValue({ fixed: true, details: { release: null, blocklisted: true } })

    await expect(runRemoveAndSearch(REPORT, waiting(), NOW)).resolves.toEqual({ fixed: true, details: { release: null, blocklisted: true } })
    expect(finishReplace).toHaveBeenCalledWith(SERVER, REPORT, RADARR, { watch: { ...WATCH, commandId: 31 }, replace: REPLACE }, { markFailed: false })
  })

  it("says the search grabbed nothing once it finished, waits while it runs, and hands back a failed one", async () => {
    jest.mocked(checkCopy).mockResolvedValue({ idle: true, config: RADARR, pastDeadline: false })
    jest.mocked(getArrCommandState)
      .mockResolvedValueOnce({ success: true, data: "done" })
      .mockResolvedValueOnce({ success: true, data: "running" })
      .mockResolvedValueOnce({ success: true, data: "failed" })

    await expect(runRemoveAndSearch(REPORT, waiting(), NOW)).resolves.toEqual({ toAdmin: "NOTHING_GRABBED" })
    await expect(runRemoveAndSearch(REPORT, waiting(), NOW)).resolves.toEqual({ next: { at: NOW.getTime() + 10 * MINUTE, data: {} } })
    await expect(runRemoveAndSearch(REPORT, waiting(), NOW)).resolves.toEqual({ toAdmin: "SEARCH_FAILED" })
    expect(getArrCommandState).toHaveBeenCalledWith("Radarr", RADARR, 31)
  })

  it("passes on what the check decided", async () => {
    jest.mocked(checkCopy).mockResolvedValue({ outcome: { toAdmin: "IMPORT_BLOCKED" } })

    await expect(runRemoveAndSearch(REPORT, waiting(), NOW)).resolves.toEqual({ toAdmin: "IMPORT_BLOCKED" })
  })
})
