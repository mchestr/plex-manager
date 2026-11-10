/**
 * Look for a better copy: the start (resolve the file, ask its profile, gate
 * and record, then one search) and the wait (a new file is fixed; the queue
 * and the history since the search decide the rest).
 */

import { getArrCommandState, listTitleHistory, listTitleQueue } from "@/lib/connections/arr-upgrade"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { scanPlexFolder } from "@/lib/connections/plex-library-actions"
import { getRadarrMovieFile, startRadarrMovieSearch } from "@/lib/connections/radarr-movie"
import { listSonarrEpisodes, searchSonarrEpisodes } from "@/lib/connections/sonarr-episodes"
import { getActiveService } from "@/lib/data/active-service"
import { gateAndRecord } from "@/lib/problem-reports/ledger"
import { resolveFile, type ResolvedFile } from "@/lib/problem-reports/resolve"
import { runBetterCopy } from "@/lib/problem-reports/steps/better-copy"
import { readUpgrade } from "@/lib/problem-reports/upgrade"
import type { BetterCopyWatch, ProblemReportFixPayload } from "@/lib/queue/types"

jest.mock("@/lib/connections/arr-upgrade", () => ({ getArrCommandState: jest.fn(), listTitleHistory: jest.fn(), listTitleQueue: jest.fn() }))
jest.mock("@/lib/connections/plex-config", () => ({ getActivePlexServerConfig: jest.fn() }))
jest.mock("@/lib/connections/plex-library-actions", () => ({ scanPlexFolder: jest.fn() }))
jest.mock("@/lib/connections/radarr-movie", () => ({ getRadarrMovieFile: jest.fn(), startRadarrMovieSearch: jest.fn() }))
jest.mock("@/lib/connections/sonarr-episodes", () => ({ listSonarrEpisodes: jest.fn(), searchSonarrEpisodes: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/problem-reports/ledger", () => ({ gateAndRecord: jest.fn() }))
jest.mock("@/lib/problem-reports/resolve", () => ({ resolveFile: jest.fn() }))
jest.mock("@/lib/problem-reports/upgrade", () => ({ readUpgrade: jest.fn() }))

const NOW = new Date("2026-11-09T20:00:00Z")
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const SERVER = { name: "Home", url: "http://plex.local:32400", token: "owner-token", adminPlexUserId: "owner", machineIdentifier: "m" }
const RADARR = { name: "Radarr", url: "http://radarr.local:7878", apiKey: "radarr-key" }
const SONARR = { name: "Sonarr", url: "http://sonarr.local:8989", apiKey: "sonarr-key" }
const REPORT = { id: "report-1", runToken: 3, action: "BETTER_COPY" as const, reporterId: "member-1", plexRatingKey: "555" }
const START: ProblemReportFixPayload = { reportId: "report-1", runToken: 3, step: "start", trigger: "automatic", actorUserId: "member-1" }
const FILE = { id: 77, relativePath: "Heat (1995) WEBDL-720p.mkv", path: "/movies/Heat (1995)/Heat (1995) WEBDL-720p.mkv", size: 4200, qualityCutoffNotMet: true, customFormatScore: 0 }
const PLEX = { ratingKey: "555", sectionId: "1", file: "/data/movies/Heat (1995)/Heat (1995) WEBDL-720p.mkv", folder: "/data/movies/Heat (1995)" }
const MOVIE: ResolvedFile = { service: "radarr", config: RADARR, titleId: 5, qualityProfileId: 4, file: FILE, episodeIds: [], plex: PLEX }
const EPISODES: ResolvedFile = { ...MOVIE, service: "sonarr", config: SONARR, titleId: 42, qualityProfileId: 6, file: { ...FILE, id: 501 }, episodeIds: [11, 12] }

const SINCE = NOW.getTime() - 30 * MINUTE
const WATCH: BetterCopyWatch = { service: "radarr", titleId: 5, fileId: 77, episodeIds: [], commandId: 31, since: SINCE, sectionId: "1", folder: PLEX.folder }
const waiting = (watch: BetterCopyWatch = WATCH, deadline = SINCE + DAY): ProblemReportFixPayload => ({ ...START, step: "wait", watch, deadline })
const later = { next: { at: NOW.getTime() + 10 * MINUTE, data: {} } }

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(getActivePlexServerConfig).mockResolvedValue(SERVER)
  jest.mocked(getActiveService).mockImplementation((async (kind: string) => (kind === "radarr" ? RADARR : SONARR)) as never)
  jest.mocked(resolveFile).mockResolvedValue({ ok: true, resolved: MOVIE })
  jest.mocked(readUpgrade).mockResolvedValue(true)
  jest.mocked(gateAndRecord).mockResolvedValue(null)
  jest.mocked(startRadarrMovieSearch).mockResolvedValue({ success: true, data: { id: 31 } })
  jest.mocked(searchSonarrEpisodes).mockResolvedValue({ success: true, data: { id: 32 } })
  jest.mocked(getRadarrMovieFile).mockResolvedValue({ success: true, data: { id: 5, monitored: true, qualityProfileId: 4, path: "/movies/Heat (1995)", file: FILE } })
  jest.mocked(listSonarrEpisodes).mockResolvedValue({ success: true, data: [] })
  jest.mocked(listTitleQueue).mockResolvedValue({ success: true, data: [] })
  jest.mocked(listTitleHistory).mockResolvedValue({ success: true, data: [] })
  jest.mocked(getArrCommandState).mockResolvedValue({ success: true, data: "done" })
  jest.mocked(scanPlexFolder).mockResolvedValue(true)
})

describe("the start", () => {
  it("records the search, asks Radarr to search with the file in place, and waits ten minutes, for a day at most", async () => {
    await expect(runBetterCopy(REPORT, START, NOW)).resolves.toEqual({
      next: {
        at: NOW.getTime() + 10 * MINUTE,
        data: { step: "wait", deadline: NOW.getTime() + DAY, watch: { service: "radarr", titleId: 5, fileId: 77, episodeIds: [], commandId: 31, since: NOW.getTime(), sectionId: "1", folder: PLEX.folder } },
      },
    })
    expect(resolveFile).toHaveBeenCalledWith(SERVER, "555")
    expect(gateAndRecord).toHaveBeenCalledWith(
      expect.objectContaining({ target: "radarr:movie:5", action: "BETTER_COPY", traits: { searches: true, replacesFile: false }, trigger: "automatic", reportId: "report-1", runToken: 3 }),
      NOW
    )
    expect(startRadarrMovieSearch).toHaveBeenCalledWith(RADARR, 5)
  })

  it("asks Sonarr to search for the file's episodes", async () => {
    jest.mocked(resolveFile).mockResolvedValue({ ok: true, resolved: EPISODES })

    await expect(runBetterCopy(REPORT, START, NOW)).resolves.toMatchObject({ next: { data: { watch: { service: "sonarr", titleId: 42, fileId: 501, episodeIds: [11, 12], commandId: 32 } } } })
    expect(gateAndRecord).toHaveBeenCalledWith(expect.objectContaining({ target: "sonarr:episode:11,12" }), NOW)
    expect(searchSonarrEpisodes).toHaveBeenCalledWith(SONARR, [11, 12])
  })

  it("doesn't search twice when the step runs again after its row was recorded", async () => {
    jest.mocked(gateAndRecord).mockResolvedValue("ALREADY_RAN")

    await expect(runBetterCopy(REPORT, START, NOW)).resolves.toMatchObject({ next: { data: { step: "wait", watch: { commandId: null } } } })
    expect(startRadarrMovieSearch).not.toHaveBeenCalled()
  })

  it.each([
    ["the file can't be resolved", () => jest.mocked(resolveFile).mockResolvedValue({ ok: false, reason: "SEVERAL_VERSIONS" }), "SEVERAL_VERSIONS"],
    ["the profile wants no better copy", () => jest.mocked(readUpgrade).mockResolvedValue(false), "NO_UPGRADE"],
    ["the profile can't be read", () => jest.mocked(readUpgrade).mockResolvedValue(null), "UNAVAILABLE"],
    ["the gate refuses it", () => jest.mocked(gateAndRecord).mockResolvedValue("SEARCH_CAP"), "SEARCH_CAP"],
    ["Radarr refuses the search", () => jest.mocked(startRadarrMovieSearch).mockResolvedValue({ success: false, error: "down" }), "UNAVAILABLE"],
    ["no Plex server is active", () => jest.mocked(getActivePlexServerConfig).mockResolvedValue(null), "UNAVAILABLE"],
  ])("hands the report back when %s", async (_label, arrange, reason) => {
    arrange()

    await expect(runBetterCopy(REPORT, START, NOW)).resolves.toEqual({ toAdmin: reason })
  })

  it("records nothing and searches nothing when the profile wants no better copy", async () => {
    jest.mocked(readUpgrade).mockResolvedValue(false)

    await runBetterCopy(REPORT, START, NOW)
    expect(gateAndRecord).not.toHaveBeenCalled()
    expect(startRadarrMovieSearch).not.toHaveBeenCalled()
  })
})

describe("the wait", () => {
  it("is fixed once Radarr has a new file, and asks Plex to scan the folder for it", async () => {
    jest.mocked(getRadarrMovieFile).mockResolvedValue({ success: true, data: { id: 5, monitored: true, qualityProfileId: 4, path: null, file: { ...FILE, id: 78 } } })

    await expect(runBetterCopy(REPORT, waiting(), NOW)).resolves.toEqual({ fixed: true })
    expect(scanPlexFolder).toHaveBeenCalledWith(SERVER, "1", PLEX.folder)
    expect(listTitleQueue).not.toHaveBeenCalled()
  })

  it("is fixed once every episode of the file has a new file in Sonarr, and not before", async () => {
    const watch: BetterCopyWatch = { ...WATCH, service: "sonarr", titleId: 42, fileId: 501, episodeIds: [11, 12] }
    const episode = (id: number, episodeFileId: number | null) => ({ id, seasonNumber: 1, episodeNumber: id, airDateUtc: null, monitored: true, hasFile: episodeFileId !== null, episodeFileId })
    jest.mocked(listSonarrEpisodes).mockResolvedValueOnce({ success: true, data: [episode(11, 600), episode(12, 501), episode(13, 700)] })
    jest.mocked(listSonarrEpisodes).mockResolvedValueOnce({ success: true, data: [episode(11, 600), episode(12, 600)] })
    jest.mocked(listTitleQueue).mockResolvedValueOnce({ success: true, data: [{ downloadId: "B", episodeId: 12, status: "downloading", trackedDownloadState: "downloading", trackedDownloadStatus: "ok" }] })

    await expect(runBetterCopy(REPORT, waiting(watch), NOW)).resolves.toEqual(later)
    await expect(runBetterCopy(REPORT, waiting(watch), NOW)).resolves.toEqual({ fixed: true })
    expect(listSonarrEpisodes).toHaveBeenCalledWith(SONARR, 42)
  })

  it("hands the report back when the queue says the download is stuck", async () => {
    jest.mocked(listTitleQueue).mockResolvedValue({ success: true, data: [{ downloadId: "ABC", episodeId: null, status: "completed", trackedDownloadState: "importBlocked", trackedDownloadStatus: "warning" }] })

    await expect(runBetterCopy(REPORT, waiting(), NOW)).resolves.toEqual({ toAdmin: "IMPORT_BLOCKED" })
  })

  it("waits while a copy downloads, and hands the report back when it's still downloading a day on", async () => {
    jest.mocked(listTitleQueue).mockResolvedValue({ success: true, data: [{ downloadId: "ABC", episodeId: null, status: "downloading", trackedDownloadState: "downloading", trackedDownloadStatus: "ok" }] })

    await expect(runBetterCopy(REPORT, waiting(), NOW)).resolves.toEqual(later)
    await expect(runBetterCopy(REPORT, waiting(WATCH, NOW.getTime()), NOW)).resolves.toEqual({ toAdmin: "STILL_DOWNLOADING" })
  })

  it("waits for a grab that isn't in the queue yet", async () => {
    jest.mocked(listTitleHistory).mockResolvedValue({ success: true, data: [{ eventType: "grabbed", at: SINCE + MINUTE, downloadId: "ABC", episodeId: null }] })

    await expect(runBetterCopy(REPORT, waiting(), NOW)).resolves.toEqual(later)
    expect(getArrCommandState).not.toHaveBeenCalled()
  })

  it("hands the report back when the grab's download failed", async () => {
    jest.mocked(listTitleHistory).mockResolvedValue({
      success: true,
      data: [
        { eventType: "downloadFailed", at: SINCE + 5 * MINUTE, downloadId: "ABC", episodeId: null },
        { eventType: "grabbed", at: SINCE + MINUTE, downloadId: "ABC", episodeId: null },
      ],
    })

    await expect(runBetterCopy(REPORT, waiting(), NOW)).resolves.toEqual({ toAdmin: "DOWNLOAD_FAILED" })
  })

  it("finds no better copy once the search is done and grabbed nothing, ignoring history from before it", async () => {
    jest.mocked(listTitleHistory).mockResolvedValue({ success: true, data: [{ eventType: "grabbed", at: SINCE - DAY, downloadId: "OLD", episodeId: null }] })

    await expect(runBetterCopy(REPORT, waiting(), NOW)).resolves.toEqual({ noBetterCopy: true })
    expect(getArrCommandState).toHaveBeenCalledWith("Radarr", RADARR, 31)
  })

  it("ignores another episode's downloads in Sonarr", async () => {
    const watch: BetterCopyWatch = { ...WATCH, service: "sonarr", titleId: 42, fileId: 501, episodeIds: [11] }
    jest.mocked(listSonarrEpisodes).mockResolvedValue({ success: true, data: [{ id: 11, seasonNumber: 1, episodeNumber: 1, airDateUtc: null, monitored: true, hasFile: true, episodeFileId: 501 }] })
    jest.mocked(listTitleQueue).mockResolvedValue({ success: true, data: [{ downloadId: "B", episodeId: 99, status: "downloading", trackedDownloadState: "downloading", trackedDownloadStatus: "ok" }] })
    jest.mocked(listTitleHistory).mockResolvedValue({ success: true, data: [{ eventType: "grabbed", at: SINCE + MINUTE, downloadId: "B", episodeId: 99 }] })

    await expect(runBetterCopy(REPORT, waiting(watch), NOW)).resolves.toEqual({ noBetterCopy: true })
    expect(getArrCommandState).toHaveBeenCalledWith("Sonarr", SONARR, 31)
  })

  it.each([
    ["the service no longer has the command", "gone"],
    ["the step never sent one", null],
  ] as const)("finds no better copy when %s", async (_label, state) => {
    if (state) jest.mocked(getArrCommandState).mockResolvedValue({ success: true, data: state })

    await expect(runBetterCopy(REPORT, waiting(state ? WATCH : { ...WATCH, commandId: null }), NOW)).resolves.toEqual({ noBetterCopy: true })
  })

  it("waits while the search runs, and hands the report back when it hasn't finished in a day or failed", async () => {
    jest.mocked(getArrCommandState).mockResolvedValueOnce({ success: true, data: "running" }).mockResolvedValueOnce({ success: true, data: "running" }).mockResolvedValueOnce({ success: true, data: "failed" })

    await expect(runBetterCopy(REPORT, waiting(), NOW)).resolves.toEqual(later)
    await expect(runBetterCopy(REPORT, waiting(WATCH, NOW.getTime()), NOW)).resolves.toEqual({ toAdmin: "SEARCH_FAILED" })
    await expect(runBetterCopy(REPORT, waiting(), NOW)).resolves.toEqual({ toAdmin: "SEARCH_FAILED" })
  })

  it("waits out a service that doesn't answer, until the deadline", async () => {
    jest.mocked(getRadarrMovieFile).mockResolvedValue({ success: false, error: "down" })

    await expect(runBetterCopy(REPORT, waiting(), NOW)).resolves.toEqual(later)
    await expect(runBetterCopy(REPORT, waiting(WATCH, NOW.getTime()), NOW)).resolves.toEqual({ toAdmin: "UNAVAILABLE" })
  })

  it.each([
    ["the queue", () => jest.mocked(listTitleQueue).mockResolvedValue({ success: false, error: "down" })],
    ["the history", () => jest.mocked(listTitleHistory).mockResolvedValue({ success: false, error: "down" })],
    ["the command", () => jest.mocked(getArrCommandState).mockResolvedValue({ success: false, error: "down" })],
  ])("waits when %s can't be read", async (_label, arrange) => {
    arrange()

    await expect(runBetterCopy(REPORT, waiting(), NOW)).resolves.toEqual(later)
  })

  it("hands the report back when the service it waits on is no longer set up, or the run has nothing to wait on", async () => {
    jest.mocked(getActiveService).mockResolvedValue(null)

    await expect(runBetterCopy(REPORT, waiting(), NOW)).resolves.toEqual({ toAdmin: "NO_RADARR" })
    await expect(runBetterCopy(REPORT, waiting({ ...WATCH, service: "sonarr" }), NOW)).resolves.toEqual({ toAdmin: "NO_SONARR" })
    await expect(runBetterCopy(REPORT, { ...START, step: "wait" }, NOW)).resolves.toEqual({ toAdmin: "UNAVAILABLE" })
  })
})
