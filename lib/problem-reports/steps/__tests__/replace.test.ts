/**
 * What Swap the copy and Remove the file and search share: waiting to start
 * while the title plays or downloads, and the end once the new copy is in
 * (the bad copy marked failed and found on the blocklist, the Plex item
 * found again).
 */

import { listTitleQueue } from "@/lib/connections/arr-upgrade"
import { listTitleBlocklist } from "@/lib/connections/arr-swap"
import { failArrGrab } from "@/lib/connections/arr-writes"
import { getPlexItemMetadata } from "@/lib/connections/plex"
import { findPlexItemByGuid, isPlexItemPlaying } from "@/lib/connections/plex-file-state"
import { scanPlexFolder } from "@/lib/connections/plex-library-actions"
import { resolveFile, type ResolvedFile } from "@/lib/problem-reports/resolve"
import { finishReplace, readyToReplace } from "@/lib/problem-reports/steps/replace"
import type { CopyWatch, ProblemReportFixPayload, ReplaceWatch } from "@/lib/queue/types"

jest.mock("@/lib/connections/arr-upgrade", () => ({ ...jest.requireActual("@/lib/connections/arr-upgrade"), listTitleQueue: jest.fn() }))
jest.mock("@/lib/connections/arr-swap", () => ({ listTitleBlocklist: jest.fn() }))
jest.mock("@/lib/connections/arr-writes", () => ({ failArrGrab: jest.fn() }))
jest.mock("@/lib/connections/plex", () => ({ getPlexItemMetadata: jest.fn() }))
jest.mock("@/lib/connections/plex-file-state", () => ({ findPlexItemByGuid: jest.fn(), isPlexItemPlaying: jest.fn() }))
jest.mock("@/lib/connections/plex-library-actions", () => ({ scanPlexFolder: jest.fn() }))
jest.mock("@/lib/problem-reports/resolve", () => ({ resolveFile: jest.fn() }))

const NOW = new Date("2026-11-09T20:00:00Z")
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const SERVER = { url: "http://plex.local:32400", token: "owner-token" }
const RADARR = { name: "Radarr", url: "http://radarr.local:7878", apiKey: "radarr-key" }
const REPORT = { id: "report-1", runToken: 3, action: "SWAP" as const, reporterId: "member-1", plexRatingKey: "555", titleKey: "plex://movie/heat" }
const START: ProblemReportFixPayload = { reportId: "report-1", runToken: 3, step: "start", trigger: "automatic", actorUserId: "member-1" }
const FILE = {
  id: 77,
  relativePath: "Heat (1995).mkv",
  path: "/movies/Heat (1995)/Heat (1995).mkv",
  size: 4200,
  qualityCutoffNotMet: false,
  customFormatScore: 0,
  sceneName: null,
  quality: null,
  languages: [],
}
const PLEX = { ratingKey: "555", guid: "plex://movie/heat", sectionId: "1", file: "/data/movies/Heat (1995)/Heat (1995).mkv", folder: "/data/movies/Heat (1995)" }
const MOVIE: ResolvedFile = { service: "radarr", config: RADARR, titleId: 5, qualityProfileId: 4, file: FILE, episodeIds: [], plex: PLEX }
const EPISODES: ResolvedFile = { ...MOVIE, service: "sonarr", titleId: 42, file: { ...FILE, id: 501 }, episodeIds: [11, 12] }
const queued = (episodeId: number | null) => ({ downloadId: "D", episodeId, status: "downloading", trackedDownloadState: "downloading", trackedDownloadStatus: "ok" })

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(resolveFile).mockResolvedValue({ ok: true, resolved: MOVIE })
  jest.mocked(isPlexItemPlaying).mockResolvedValue(false)
  jest.mocked(listTitleQueue).mockResolvedValue({ success: true, data: [] })
  jest.mocked(failArrGrab).mockResolvedValue({ success: true, data: null })
  jest.mocked(listTitleBlocklist).mockResolvedValue({ success: true, data: ["heat.1995.1080p.bluray.x264-bad"] })
  jest.mocked(getPlexItemMetadata).mockResolvedValue({ status: "found", item: { ratingKey: "555", type: "movie", title: "Heat", ids: {}, media: [], locations: [] } })
  jest.mocked(scanPlexFolder).mockResolvedValue(true)
})

describe("readyToReplace", () => {
  it("hands over the file and the Plex guid when nobody plays it and nothing downloads it", async () => {
    await expect(readyToReplace(SERVER, REPORT, START, NOW)).resolves.toEqual({ resolved: MOVIE, guid: "plex://movie/heat" })
    expect(resolveFile).toHaveBeenCalledWith(SERVER, "555")
    expect(isPlexItemPlaying).toHaveBeenCalledWith(SERVER, "555")
    expect(listTitleQueue).toHaveBeenCalledWith(RADARR, { service: "radarr", id: 5 })
  })

  it("hands the report back when the file can't be resolved, or Plex has no guid for it", async () => {
    jest.mocked(resolveFile).mockResolvedValueOnce({ ok: false, reason: "UNMONITORED" }).mockResolvedValueOnce({ ok: true, resolved: { ...MOVIE, plex: { ...PLEX, guid: null } } })

    await expect(readyToReplace(SERVER, REPORT, START, NOW)).resolves.toEqual({ outcome: { toAdmin: "UNMONITORED" } })
    await expect(readyToReplace(SERVER, REPORT, START, NOW)).resolves.toEqual({ outcome: { toAdmin: "NO_IDS" } })
  })

  it("waits ten minutes while the title plays, for a day at most, noting the file it saw", async () => {
    jest.mocked(isPlexItemPlaying).mockResolvedValue(true)

    await expect(readyToReplace(SERVER, REPORT, START, NOW)).resolves.toEqual({
      outcome: { next: { at: NOW.getTime() + 10 * MINUTE, data: { deadline: NOW.getTime() + DAY, seenFileId: 77 } } },
    })
    await expect(readyToReplace(SERVER, REPORT, { ...START, deadline: NOW.getTime() + MINUTE, seenFileId: 77 }, NOW)).resolves.toMatchObject({
      outcome: { next: { data: { deadline: NOW.getTime() + MINUTE } } },
    })
    await expect(readyToReplace(SERVER, REPORT, { ...START, deadline: NOW.getTime(), seenFileId: 77 }, NOW)).resolves.toEqual({ outcome: { toAdmin: "BUSY" } })
  })

  it("waits only out the 15 minutes an admin's tap holds, then hands the report back", async () => {
    jest.mocked(isPlexItemPlaying).mockResolvedValue(true)
    const tap: ProblemReportFixPayload = { ...START, trigger: "web", actorUserId: "admin-1", claimedAt: NOW.getTime() - MINUTE }

    await expect(readyToReplace(SERVER, REPORT, tap, NOW)).resolves.toEqual({
      outcome: { next: { at: NOW.getTime() + 10 * MINUTE, data: { deadline: NOW.getTime() + 14 * MINUTE, seenFileId: 77 } } },
    })
    await expect(readyToReplace(SERVER, REPORT, { ...tap, deadline: NOW.getTime(), seenFileId: 77 }, NOW)).resolves.toEqual({ outcome: { toAdmin: "APPROVAL_EXPIRED" } })
    await expect(readyToReplace(SERVER, REPORT, { ...tap, claimedAt: undefined }, NOW)).resolves.toEqual({ outcome: { toAdmin: "APPROVAL_EXPIRED" } })
  })

  it("waits while Plex can't say whether it plays, or Radarr is downloading a copy", async () => {
    jest.mocked(isPlexItemPlaying).mockResolvedValueOnce(null)
    jest.mocked(listTitleQueue).mockResolvedValueOnce({ success: true, data: [] }).mockResolvedValueOnce({ success: true, data: [queued(null)] }).mockResolvedValueOnce({ success: false, error: "down" })

    for (let check = 0; check < 3; check++) await expect(readyToReplace(SERVER, REPORT, START, NOW)).resolves.toMatchObject({ outcome: { next: {} } })
  })

  it("waits for a download of the file's own episodes in Sonarr, not another episode's", async () => {
    jest.mocked(resolveFile).mockResolvedValue({ ok: true, resolved: EPISODES })
    jest.mocked(listTitleQueue).mockResolvedValueOnce({ success: true, data: [queued(13)] }).mockResolvedValueOnce({ success: true, data: [queued(12)] })

    await expect(readyToReplace(SERVER, REPORT, START, NOW)).resolves.toMatchObject({ resolved: EPISODES })
    await expect(readyToReplace(SERVER, REPORT, START, NOW)).resolves.toMatchObject({ outcome: { next: { data: { seenFileId: 501 } } } })
  })

  it("is fixed when the file changed while it waited: the copy that was reported is gone", async () => {
    await expect(readyToReplace(SERVER, REPORT, { ...START, deadline: NOW.getTime() + DAY, seenFileId: 76 }, NOW)).resolves.toEqual({ outcome: { fixed: true } })
    expect(isPlexItemPlaying).not.toHaveBeenCalled()
  })
})

describe("finishReplace", () => {
  const WATCH: CopyWatch = { service: "radarr", titleId: 5, fileId: 77, episodeIds: [], commandId: null, since: NOW.getTime() - DAY, sectionId: "1", folder: PLEX.folder }
  const REPLACE: ReplaceWatch = { guid: "plex://movie/heat", badGrabId: 10, badRelease: "Heat.1995.1080p.BluRay.x264-BAD", release: "Heat.1995.1080p.BluRay.x264-GOOD" }
  const finish = (replace: ReplaceWatch = REPLACE, markFailed = true) => finishReplace(SERVER, REPORT, RADARR, { watch: WATCH, replace }, { markFailed })

  it("asks Plex to scan, marks the bad copy's grab failed and finds its release on the blocklist", async () => {
    await expect(finish()).resolves.toEqual({ fixed: true, details: { release: "Heat.1995.1080p.BluRay.x264-GOOD", blocklisted: true } })
    expect(scanPlexFolder).toHaveBeenCalledWith(SERVER, "1", PLEX.folder)
    expect(failArrGrab).toHaveBeenCalledWith("Radarr", RADARR, 10)
    expect(listTitleBlocklist).toHaveBeenCalledWith(RADARR, { service: "radarr", id: 5 })
  })

  it("says the release isn't on the blocklist when the mark failed or didn't write it, and doesn't know when the list can't be read", async () => {
    jest.mocked(failArrGrab).mockResolvedValueOnce({ success: false, error: "down" })
    await expect(finish()).resolves.toMatchObject({ details: { blocklisted: false } })

    jest.mocked(listTitleBlocklist).mockResolvedValueOnce({ success: true, data: ["Heat.1995.720p.WEB-OTHER"] })
    await expect(finish()).resolves.toMatchObject({ details: { blocklisted: false } })

    jest.mocked(listTitleBlocklist).mockResolvedValueOnce({ success: false, error: "down" })
    await expect(finish()).resolves.toMatchObject({ details: { blocklisted: null } })
  })

  it("marks nothing for a file added by hand, and leaves a removal's mark to the removal", async () => {
    await expect(finish({ ...REPLACE, badGrabId: null, badRelease: null })).resolves.toMatchObject({ details: { blocklisted: null } })
    await expect(finish(REPLACE, false)).resolves.toMatchObject({ details: { blocklisted: true } })
    expect(failArrGrab).not.toHaveBeenCalled()
  })

  it("keeps the new rating key of a title Plex added again, found by its guid", async () => {
    jest.mocked(getPlexItemMetadata).mockResolvedValue({ status: "missing" })
    jest.mocked(findPlexItemByGuid).mockResolvedValue({ status: "found", ratingKey: "9001" })

    await expect(finish()).resolves.toMatchObject({ details: { ratingKey: "9001" } })
    expect(findPlexItemByGuid).toHaveBeenCalledWith(SERVER, "1", "plex://movie/heat")
  })

  it("keeps the rating key when Plex can't be read or has no item with the guid", async () => {
    jest.mocked(getPlexItemMetadata).mockResolvedValueOnce({ status: "unknown" }).mockResolvedValueOnce({ status: "missing" })
    jest.mocked(findPlexItemByGuid).mockResolvedValue({ status: "missing" })

    await expect(finish()).resolves.toEqual({ fixed: true, details: { release: REPLACE.release, blocklisted: true } })
    await expect(finish()).resolves.toEqual({ fixed: true, details: { release: REPLACE.release, blocklisted: true } })
    expect(findPlexItemByGuid).toHaveBeenCalledTimes(1)
  })
})
