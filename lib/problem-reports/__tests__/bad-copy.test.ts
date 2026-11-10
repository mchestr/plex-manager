/**
 * The bad copy behind a file: its grab, found through the import that brought
 * the file in, with the release titles a swap passes over.
 */

import { listTitleHistory, type ArrHistoryRecord } from "@/lib/connections/arr-upgrade"
import { findBadCopy } from "@/lib/problem-reports/bad-copy"
import type { ResolvedFile } from "@/lib/problem-reports/resolve"

jest.mock("@/lib/connections/arr-upgrade", () => ({ listTitleHistory: jest.fn() }))

const RADARR = { name: "Radarr", url: "http://radarr.local:7878", apiKey: "radarr-key" }
const FILE = {
  id: 77,
  relativePath: "Heat (1995).mkv",
  path: "/movies/Heat (1995)/Heat (1995).mkv",
  size: 4200,
  qualityCutoffNotMet: false,
  customFormatScore: 0,
  sceneName: "Heat.1995.1080p.BluRay.x264-BAD",
  quality: { id: 7, name: "Bluray-1080p", version: 1, real: 0 },
  languages: [1],
}
const MOVIE: ResolvedFile = {
  service: "radarr",
  config: RADARR,
  titleId: 5,
  qualityProfileId: 4,
  file: FILE,
  episodeIds: [],
  plex: { ratingKey: "555", guid: "plex://movie/heat", sectionId: "1", file: "/data/movies/Heat (1995)/Heat (1995).mkv", folder: "/data/movies/Heat (1995)" },
}

const record = (overrides: Partial<ArrHistoryRecord>): ArrHistoryRecord => ({
  id: 1,
  eventType: "grabbed",
  at: Date.parse("2026-10-01T00:00:00Z"),
  sourceTitle: null,
  downloadId: null,
  episodeId: null,
  fileId: null,
  infoHash: null,
  ...overrides,
})

beforeEach(() => jest.resetAllMocks())

describe("findBadCopy", () => {
  it("finds the grab through the import of the file, with each title of the release once", async () => {
    jest.mocked(listTitleHistory).mockResolvedValue({
      success: true,
      data: [
        record({ id: 10, eventType: "grabbed", downloadId: "ABC", sourceTitle: "Heat.1995.1080p.BluRay.x264-BAD", infoHash: "aaaa1111" }),
        record({ id: 11, eventType: "downloadFolderImported", downloadId: "ABC", sourceTitle: "Heat.1995.1080p.BluRay.x264-BAD", fileId: 77, at: Date.parse("2026-10-01T01:00:00Z") }),
        record({ id: 12, eventType: "grabbed", downloadId: "OTHER", sourceTitle: "Heat.1995.720p.WEB-OLD" }),
      ],
    })

    await expect(findBadCopy(MOVIE)).resolves.toEqual({
      titles: ["Heat.1995.1080p.BluRay.x264-BAD"],
      infoHash: "aaaa1111",
      grab: { id: 10, downloadId: "ABC", title: "Heat.1995.1080p.BluRay.x264-BAD" },
    })
    expect(listTitleHistory).toHaveBeenCalledWith(RADARR, { service: "radarr", id: 5 })
  })

  it("takes the newest grab of the download, and every title the release went by", async () => {
    jest.mocked(listTitleHistory).mockResolvedValue({
      success: true,
      data: [
        record({ id: 20, downloadId: "ABC", sourceTitle: "Heat 1995 1080p", at: Date.parse("2026-09-30T00:00:00Z") }),
        record({ id: 21, downloadId: "ABC", sourceTitle: "Heat.1995.1080p.Retry", at: Date.parse("2026-10-01T00:00:00Z") }),
        record({ id: 22, eventType: "downloadFolderImported", downloadId: "ABC", sourceTitle: "Heat.1995.1080p.Folder", fileId: 77 }),
      ],
    })

    await expect(findBadCopy(MOVIE)).resolves.toMatchObject({
      titles: ["Heat.1995.1080p.Retry", "Heat.1995.1080p.Folder", "Heat.1995.1080p.BluRay.x264-BAD"],
      grab: { id: 21 },
    })
  })

  it("has no grab for a file added by hand, and passes over its scene name only", async () => {
    jest.mocked(listTitleHistory).mockResolvedValue({ success: true, data: [record({ id: 30, eventType: "movieFolderImported", fileId: 77 }), record({ id: 31, fileId: 78, eventType: "downloadFolderImported", downloadId: "X" })] })

    await expect(findBadCopy(MOVIE)).resolves.toEqual({ titles: ["Heat.1995.1080p.BluRay.x264-BAD"], infoHash: null, grab: null })
  })

  it("passes over the imported release when its grab has left the history, with no grab to mark", async () => {
    jest.mocked(listTitleHistory).mockResolvedValue({
      success: true,
      data: [record({ id: 40, eventType: "downloadFolderImported", downloadId: "ABC", sourceTitle: "Heat.1995.1080p.BluRay.x264-BAD.Folder", fileId: 77 })],
    })

    await expect(findBadCopy(MOVIE)).resolves.toEqual({ titles: ["Heat.1995.1080p.BluRay.x264-BAD.Folder", "Heat.1995.1080p.BluRay.x264-BAD"], infoHash: null, grab: null })
  })

  it("has nothing to pass over for a file added by hand without a scene name", async () => {
    jest.mocked(listTitleHistory).mockResolvedValue({ success: true, data: [] })

    await expect(findBadCopy({ ...MOVIE, file: { ...FILE, sceneName: null } })).resolves.toEqual({ titles: [], infoHash: null, grab: null })
  })

  it("is null when the history can't be read", async () => {
    jest.mocked(listTitleHistory).mockResolvedValue({ success: false, error: "down" })

    await expect(findBadCopy(MOVIE)).resolves.toBeNull()
  })
})
