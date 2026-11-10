/**
 * Swap the copy: the start (wait to start, the bad copy, the gate, the
 * interactive search and the pick, the replacement's gate, the grab) and the
 * wait (the shared check, then the end once the new copy is in).
 */

import { getArrQualityProfile } from "@/lib/connections/arr-upgrade"
import { searchArrReleases, type ArrRelease } from "@/lib/connections/arr-swap"
import { grabArrRelease } from "@/lib/connections/arr-writes"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { findBadCopy } from "@/lib/problem-reports/bad-copy"
import { gateAndRecord, gateReplace } from "@/lib/problem-reports/ledger"
import type { ResolvedFile } from "@/lib/problem-reports/resolve"
import { checkCopy } from "@/lib/problem-reports/steps/copy-wait"
import { finishReplace, readyToReplace } from "@/lib/problem-reports/steps/replace"
import { runSwap } from "@/lib/problem-reports/steps/swap"
import type { CopyWatch, ProblemReportFixPayload, ReplaceWatch } from "@/lib/queue/types"

jest.mock("@/lib/connections/arr-upgrade", () => ({ ...jest.requireActual("@/lib/connections/arr-upgrade"), getArrQualityProfile: jest.fn() }))
jest.mock("@/lib/connections/arr-swap", () => ({ searchArrReleases: jest.fn() }))
jest.mock("@/lib/connections/arr-writes", () => ({ grabArrRelease: jest.fn() }))
jest.mock("@/lib/connections/plex-config", () => ({ getActivePlexServerConfig: jest.fn() }))
jest.mock("@/lib/problem-reports/bad-copy", () => ({ findBadCopy: jest.fn() }))
jest.mock("@/lib/problem-reports/ledger", () => ({ gateAndRecord: jest.fn(), gateReplace: jest.fn() }))
jest.mock("@/lib/problem-reports/steps/replace", () => ({ finishReplace: jest.fn(), readyToReplace: jest.fn() }))
jest.mock("@/lib/problem-reports/steps/copy-wait", () => ({ ...jest.requireActual("@/lib/problem-reports/steps/copy-wait"), checkCopy: jest.fn() }))

const NOW = new Date("2026-11-09T20:00:00Z")
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const SERVER = { name: "Home", url: "http://plex.local:32400", token: "owner-token", adminPlexUserId: "owner", machineIdentifier: "m" }
const RADARR = { name: "Radarr", url: "http://radarr.local:7878", apiKey: "radarr-key" }
const REPORT = { id: "report-1", runToken: 3, action: "SWAP" as const, reporterId: "member-1", plexRatingKey: "555", titleKey: "plex://movie/heat" }
const START: ProblemReportFixPayload = { reportId: "report-1", runToken: 3, step: "start", trigger: "web", actorUserId: "admin-1" }
const QUALITY = { id: 7, name: "Bluray-1080p", version: 1, real: 0 }
const FILE = {
  id: 77,
  relativePath: "Heat (1995).mkv",
  path: "/movies/Heat (1995)/Heat (1995).mkv",
  size: 4200,
  qualityCutoffNotMet: false,
  customFormatScore: 10,
  sceneName: "Heat.1995.1080p.BluRay.x264-BAD",
  quality: QUALITY,
  languages: [1],
}
const PLEX = { ratingKey: "555", guid: "plex://movie/heat", sectionId: "1", file: "/data/movies/Heat (1995)/Heat (1995).mkv", folder: "/data/movies/Heat (1995)" }
const MOVIE: ResolvedFile = { service: "radarr", config: RADARR, titleId: 5, qualityProfileId: 4, file: FILE, episodeIds: [], plex: PLEX }
const EPISODES: ResolvedFile = { ...MOVIE, service: "sonarr", titleId: 42, file: { ...FILE, id: 501 }, episodeIds: [11, 12] }
const BAD = { titles: ["Heat.1995.1080p.BluRay.x264-BAD"], infoHash: "aaaa1111", grab: { id: 10, downloadId: "ABC", title: "Heat.1995.1080p.BluRay.x264-BAD" } }

const release = (title: string, overrides: Partial<ArrRelease> = {}): ArrRelease => ({
  guid: `guid-${title}`,
  indexerId: 2,
  title,
  infoHash: null,
  quality: QUALITY,
  customFormatScore: 10,
  rejected: false,
  rejections: [],
  temporarilyRejected: false,
  languages: [1],
  seeders: 10,
  episodeIds: null,
  ...overrides,
})
const GOOD = release("Heat.1995.1080p.BluRay.x264-GOOD")

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(getActivePlexServerConfig).mockResolvedValue(SERVER)
  jest.mocked(readyToReplace).mockResolvedValue({ resolved: MOVIE, guid: "plex://movie/heat" })
  jest.mocked(getArrQualityProfile).mockResolvedValue({ success: true, data: { id: 4, upgradeAllowed: true, cutoffFormatScore: null, qualityOrder: [[4], [7]] } })
  jest.mocked(findBadCopy).mockResolvedValue(BAD)
  jest.mocked(gateAndRecord).mockResolvedValue(null)
  jest.mocked(searchArrReleases).mockResolvedValue({ success: true, data: [release(BAD.titles[0]), GOOD] })
  jest.mocked(gateReplace).mockResolvedValue(null)
  jest.mocked(grabArrRelease).mockResolvedValue({ success: true, data: null })
})

describe("the start", () => {
  it("records the run with the bad copy, picks another release, gates the replacement and grabs it", async () => {
    await expect(runSwap(REPORT, START, NOW)).resolves.toEqual({
      next: {
        at: NOW.getTime() + 10 * MINUTE,
        data: {
          step: "wait",
          deadline: NOW.getTime() + DAY,
          watch: { service: "radarr", titleId: 5, fileId: 77, episodeIds: [], commandId: null, since: NOW.getTime(), sectionId: "1", folder: PLEX.folder },
          replace: { guid: "plex://movie/heat", badGrabId: 10, badRelease: "Heat.1995.1080p.BluRay.x264-BAD", release: "Heat.1995.1080p.BluRay.x264-GOOD" },
        },
      },
    })
    expect(gateAndRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "radarr:movie:5",
        action: "SWAP",
        traits: { searches: true, replacesFile: true, changesPlex: false },
        trigger: "web",
        actorUserId: "admin-1",
        file: { id: 77, release: "Heat.1995.1080p.BluRay.x264-BAD" },
      }),
      NOW
    )
    expect(searchArrReleases).toHaveBeenCalledWith(RADARR, { service: "radarr", movieId: 5 })
    expect(gateReplace).toHaveBeenCalledWith({ reportId: "report-1", runToken: 3 }, NOW)
    expect(grabArrRelease).toHaveBeenCalledWith("Radarr", RADARR, GOOD)
  })

  it("searches Sonarr by the file's first episode, and grabs only a release of all its episodes", async () => {
    jest.mocked(readyToReplace).mockResolvedValue({ resolved: EPISODES, guid: "plex://episode/pilot" })
    const double = release("Show.S01E01E02.GOOD", { episodeIds: [11, 12] })
    jest.mocked(searchArrReleases).mockResolvedValue({ success: true, data: [release("Show.S01E01.SINGLE", { episodeIds: [11] }), double] })

    await expect(runSwap(REPORT, START, NOW)).resolves.toMatchObject({ next: { data: { replace: { release: "Show.S01E01E02.GOOD" } } } })
    expect(searchArrReleases).toHaveBeenCalledWith(RADARR, { service: "sonarr", episodeId: 11 })
    expect(grabArrRelease).toHaveBeenCalledWith("Sonarr", RADARR, double)
  })

  it("passes on what waiting to start decided", async () => {
    jest.mocked(readyToReplace).mockResolvedValue({ outcome: { toAdmin: "BUSY" } })

    await expect(runSwap(REPORT, START, NOW)).resolves.toEqual({ toAdmin: "BUSY" })
    expect(gateAndRecord).not.toHaveBeenCalled()
  })

  it.each([
    ["only the bad release turns up", [release(BAD.titles[0])], "NO_OTHER_COPY"],
    ["the other copies are lower quality", [release("Heat.1995.720p.WEB-LOW", { quality: { id: 4, name: "WEBDL-720p", version: 1, real: 0 } })], "ONLY_LOWER"],
  ])("changes nothing when %s", async (_label, releases, reason) => {
    jest.mocked(searchArrReleases).mockResolvedValue({ success: true, data: releases })

    await expect(runSwap(REPORT, START, NOW)).resolves.toEqual({ toAdmin: reason })
    expect(gateReplace).not.toHaveBeenCalled()
    expect(grabArrRelease).not.toHaveBeenCalled()
  })

  it.each([
    ["the profile can't be read", () => jest.mocked(getArrQualityProfile).mockResolvedValue({ success: false, error: "down" }), "UNAVAILABLE"],
    ["the history can't be read", () => jest.mocked(findBadCopy).mockResolvedValue(null), "UNAVAILABLE"],
    ["the gate refuses the search", () => jest.mocked(gateAndRecord).mockResolvedValue("SEARCH_CAP"), "SEARCH_CAP"],
    ["the breaker is tripped before the search", () => jest.mocked(gateAndRecord).mockResolvedValue("BREAKER"), "BREAKER"],
    ["the interactive search fails", () => jest.mocked(searchArrReleases).mockResolvedValue({ success: false, error: "timeout" }), "UNAVAILABLE"],
    ["the breaker trips at the grab", () => jest.mocked(gateReplace).mockResolvedValue("BREAKER"), "BREAKER"],
    ["the run's row is gone", () => jest.mocked(gateReplace).mockResolvedValue("NO_RUN"), "UNAVAILABLE"],
    ["Radarr doesn't take the grab", () => jest.mocked(grabArrRelease).mockResolvedValue({ success: false, error: "not in cache" }), "GRAB_FAILED"],
    ["no Plex server is active", () => jest.mocked(getActivePlexServerConfig).mockResolvedValue(null), "UNAVAILABLE"],
  ])("hands the report back when %s", async (_label, arrange, reason) => {
    arrange()

    await expect(runSwap(REPORT, START, NOW)).resolves.toEqual({ toAdmin: reason })
  })

  it.each(["BREAKER", "NO_RUN"] as const)("grabs nothing when the replacement's gate answers %s", async (answer) => {
    jest.mocked(gateReplace).mockResolvedValue(answer)

    await runSwap(REPORT, START, NOW)
    expect(grabArrRelease).not.toHaveBeenCalled()
  })

  it("searches only once the gate allows it, and grabs only once the breaker does", async () => {
    jest.mocked(gateAndRecord).mockResolvedValueOnce("SEARCH_CAP")
    await runSwap(REPORT, START, NOW)
    expect(searchArrReleases).not.toHaveBeenCalled()

    jest.mocked(gateReplace).mockResolvedValueOnce("BREAKER")
    await runSwap(REPORT, START, NOW)
    expect(grabArrRelease).not.toHaveBeenCalled()
  })

  it("never grabs twice: a step that runs again after its row was marked replaced goes to the wait", async () => {
    jest.mocked(gateAndRecord).mockResolvedValue("ALREADY_RAN")
    jest.mocked(gateReplace).mockResolvedValue("ALREADY_REPLACED")

    await expect(runSwap(REPORT, START, NOW)).resolves.toMatchObject({ next: { data: { step: "wait", replace: { release: null } } } })
    expect(grabArrRelease).not.toHaveBeenCalled()
  })
})

describe("the wait", () => {
  const WATCH: CopyWatch = { service: "radarr", titleId: 5, fileId: 77, episodeIds: [], commandId: null, since: NOW.getTime() - MINUTE, sectionId: "1", folder: PLEX.folder }
  const REPLACE: ReplaceWatch = { guid: "plex://movie/heat", badGrabId: 10, badRelease: BAD.grab.title, release: GOOD.title }
  const waiting = (deadline = NOW.getTime() + DAY): ProblemReportFixPayload => ({ ...START, step: "wait", deadline, watch: WATCH, replace: REPLACE })

  it("ends with the bad copy marked failed once the new copy is in", async () => {
    jest.mocked(checkCopy).mockResolvedValue({ imported: true, config: RADARR })
    jest.mocked(finishReplace).mockResolvedValue({ fixed: true, details: { release: GOOD.title, blocklisted: true } })

    await expect(runSwap(REPORT, waiting(), NOW)).resolves.toEqual({ fixed: true, details: { release: GOOD.title, blocklisted: true } })
    expect(checkCopy).toHaveBeenCalledWith(WATCH, NOW.getTime() + DAY, NOW)
    expect(finishReplace).toHaveBeenCalledWith(SERVER, REPORT, RADARR, { watch: WATCH, replace: REPLACE }, { markFailed: true })
  })

  it("passes on what the check decided: still downloading, stuck, or failed", async () => {
    jest.mocked(checkCopy).mockResolvedValue({ outcome: { toAdmin: "DOWNLOAD_FAILED" } })

    await expect(runSwap(REPORT, waiting(), NOW)).resolves.toEqual({ toAdmin: "DOWNLOAD_FAILED" })
  })

  it("waits while nothing is downloading, and says the grab didn't take after a day", async () => {
    jest.mocked(checkCopy).mockResolvedValueOnce({ idle: true, config: RADARR, pastDeadline: false }).mockResolvedValueOnce({ idle: true, config: RADARR, pastDeadline: true })

    await expect(runSwap(REPORT, waiting(), NOW)).resolves.toEqual({ next: { at: NOW.getTime() + 10 * MINUTE, data: {} } })
    await expect(runSwap(REPORT, waiting(NOW.getTime()), NOW)).resolves.toEqual({ toAdmin: "GRAB_FAILED" })
  })

  it("stops at the first check with nothing downloading when the step ran again past its grab, which may never have gone out", async () => {
    jest.mocked(checkCopy).mockResolvedValue({ idle: true, config: RADARR, pastDeadline: false })

    await expect(runSwap(REPORT, { ...waiting(), replace: { ...REPLACE, release: null } }, NOW)).resolves.toEqual({ toAdmin: "INTERRUPTED" })
  })

  it("hands the report back without what it waits on", async () => {
    await expect(runSwap(REPORT, { ...waiting(), replace: undefined }, NOW)).resolves.toEqual({ toAdmin: "UNAVAILABLE" })
    expect(checkCopy).not.toHaveBeenCalled()
  })
})
