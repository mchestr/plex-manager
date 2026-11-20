/**
 * pickCandidate against interactive search results in the shape Radarr and
 * Sonarr answer (`fixtures/`, read through `searchArrReleases`): another release than the
 * bad one, by title or info hash; unrejected, rejected only because a file is
 * there, or only for now; at least the file's quality, revision and custom
 * format score; the file's languages; and for Sonarr exactly the file's
 * episodes, so no season packs and no single episode for a double one.
 */

import { searchArrReleases, type ArrRelease } from "@/lib/connections/arr-swap"
import { pickCandidate, type CandidateFile } from "@/lib/problem-reports/candidates"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const RADARR_JSON = jest.requireActual<unknown[]>("./fixtures/radarr-releases.json")
const SONARR_JSON = jest.requireActual<unknown[]>("./fixtures/sonarr-releases.json")
const ORDER = [[4], [3, 15], [7]]
const CONFIG = { url: "http://arr.local", apiKey: "k" }

async function searched(raw: unknown[], service: "radarr" | "sonarr"): Promise<ArrRelease[]> {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => raw }) as unknown as typeof fetch
  const result = await searchArrReleases(CONFIG, service === "radarr" ? { service, movieId: 5 } : { service, episodeId: 11 })
  if (!result.success) throw new Error(result.error)
  return result.data
}

const MOVIE_FILE: CandidateFile = { quality: { id: 7, name: "Bluray-1080p", version: 1, real: 0 }, customFormatScore: 0, languages: [1], episodeIds: [] }
const BAD = { titles: ["Heat.1995.1080p.BluRay.x264-BAD"], infoHash: "aaaa1111" }
const titleOf = (pick: ReturnType<typeof pickCandidate>) => (pick.ok ? pick.release.title : pick.reason)

describe("pickCandidate: Radarr", () => {
  it("prefers the highest custom format score, a release held back only for now included", async () => {
    const releases = await searched(RADARR_JSON, "radarr")

    expect(pickCandidate(releases, MOVIE_FILE, BAD, ORDER, "radarr")).toEqual({ ok: true, release: expect.objectContaining({ title: "Heat.1995.1080p.BluRay.DTS.x264-WAIT", guid: "https://indexer.example/details/1007", indexerId: 5 }) })
  })

  it("passes over the bad release by title or by info hash, other rejections, lower qualities and other languages", async () => {
    const releases = (await searched(RADARR_JSON, "radarr")).filter((release) => !release.title.endsWith("-WAIT"))

    expect(titleOf(pickCandidate(releases, MOVIE_FILE, BAD, ORDER, "radarr"))).toBe("Heat.1995.1080p.BluRay.x264-GOOD")
  })

  it("matches the bad release's title without case, from the grab or the file's scene name", async () => {
    const releases = (await searched(RADARR_JSON, "radarr")).filter((release) => release.title.endsWith("-GOOD") || release.title.endsWith("-BAD"))

    expect(titleOf(pickCandidate(releases, MOVIE_FILE, { titles: ["heat.1995.1080p.bluray.x264-good"], infoHash: null }, ORDER, "radarr"))).toBe("Heat.1995.1080p.BluRay.x264-BAD")
  })

  it("says the only other copies are lower quality, or that there is no other copy", async () => {
    const releases = await searched(RADARR_JSON, "radarr")
    const bad = releases.filter((release) => release.title.endsWith("-BAD"))
    const lower = releases.filter((release) => release.title.endsWith("-BAD") || release.title.endsWith("-LOW"))

    expect(pickCandidate(lower, MOVIE_FILE, BAD, ORDER, "radarr")).toEqual({ ok: false, reason: "ONLY_LOWER" })
    expect(pickCandidate(bad, MOVIE_FILE, BAD, ORDER, "radarr")).toEqual({ ok: false, reason: "NO_OTHER_COPY" })
    expect(pickCandidate([], MOVIE_FILE, BAD, ORDER, "radarr")).toEqual({ ok: false, reason: "NO_OTHER_COPY" })
  })

  it("counts a lower revision or custom format score than the file's as lower", async () => {
    const good = (await searched(RADARR_JSON, "radarr")).filter((release) => release.title.endsWith("-GOOD"))

    expect(pickCandidate(good, { ...MOVIE_FILE, quality: { id: 7, name: "Bluray-1080p", version: 2, real: 0 } }, BAD, ORDER, "radarr")).toEqual({ ok: false, reason: "ONLY_LOWER" })
    expect(pickCandidate(good, { ...MOVIE_FILE, customFormatScore: 5 }, BAD, ORDER, "radarr")).toEqual({ ok: false, reason: "ONLY_LOWER" })
  })

  it("ranks a quality in the file's group as the same, and one the profile doesn't have as not allowed", async () => {
    const good = (await searched(RADARR_JSON, "radarr")).filter((release) => release.title.endsWith("-GOOD"))
    const asWeb = good.map((release) => ({ ...release, quality: { ...release.quality, id: 15 } }))
    const unknown = good.map((release) => ({ ...release, quality: { ...release.quality, id: 99 } }))
    const webFile = { ...MOVIE_FILE, quality: { id: 3, name: "WEBDL-1080p", version: 1, real: 0 } }

    expect(titleOf(pickCandidate(asWeb, webFile, BAD, ORDER, "radarr"))).toBe("Heat.1995.1080p.BluRay.x264-GOOD")
    expect(pickCandidate(unknown, MOVIE_FILE, BAD, ORDER, "radarr")).toEqual({ ok: false, reason: "ONLY_LOWER" })
  })

  it("ranks the qualities of one group as one, so a higher revision in it wins before seeders", async () => {
    const good = (await searched(RADARR_JSON, "radarr")).filter((release) => release.title.endsWith("-GOOD"))
    const webFile = { ...MOVIE_FILE, quality: { id: 3, name: "WEBDL-1080p", version: 1, real: 0 } }
    const busy = good.map((release) => ({ ...release, title: "Heat.1995.1080p.WEB-DL-BUSY", guid: "busy", seeders: 500, infoHash: null, quality: { ...release.quality, id: 3, name: "WEBDL-1080p", version: 1 } }))
    const proper = good.map((release) => ({ ...release, title: "Heat.1995.1080p.WEBRip.PROPER-FIX", guid: "proper", seeders: 5, infoHash: null, quality: { ...release.quality, id: 15, name: "WEBRip-1080p", version: 2 } }))

    expect(titleOf(pickCandidate([...busy, ...proper], webFile, BAD, ORDER, "radarr"))).toBe("Heat.1995.1080p.WEBRip.PROPER-FIX")
  })

  it("asks no language of a file whose languages aren't known", async () => {
    const french = (await searched(RADARR_JSON, "radarr")).filter((release) => release.title.endsWith("-FRENCH"))

    expect(titleOf(pickCandidate(french, { ...MOVIE_FILE, languages: [0] }, BAD, ORDER, "radarr"))).toBe("Heat.1995.1080p.BluRay.x264-FRENCH")
    expect(pickCandidate(french, MOVIE_FILE, BAD, ORDER, "radarr")).toEqual({ ok: false, reason: "NO_OTHER_COPY" })
  })

  it("breaks a tie on score and quality by seeders", async () => {
    const releases = await searched(RADARR_JSON, "radarr")
    const good = releases.filter((release) => release.title.endsWith("-GOOD"))
    const busier = good.map((release) => ({ ...release, title: "Heat.1995.1080p.BluRay.x264-BUSY", guid: "busy", seeders: 500, infoHash: null }))

    expect(titleOf(pickCandidate([...good, ...busier], MOVIE_FILE, BAD, ORDER, "radarr"))).toBe("Heat.1995.1080p.BluRay.x264-BUSY")
  })
})

describe("pickCandidate: Sonarr", () => {
  const DOUBLE: CandidateFile = { quality: { id: 3, name: "WEBDL-1080p", version: 1, real: 0 }, customFormatScore: 20, languages: [1], episodeIds: [12, 11] }

  it("takes only a release of exactly the file's episodes: no season pack, no single episode for a double one", async () => {
    const releases = await searched(SONARR_JSON, "sonarr")

    expect(titleOf(pickCandidate(releases, DOUBLE, { titles: [], infoHash: null }, ORDER, "sonarr"))).toBe("Show.S01E01E02.1080p.WEB-DL.DDP5.1-GRP")
    expect(titleOf(pickCandidate(releases, { ...DOUBLE, episodeIds: [11] }, { titles: [], infoHash: null }, ORDER, "sonarr"))).toBe("Show.S01E01.1080p.WEBRip-SINGLE")
  })

  it("passes over a release whose episodes Sonarr didn't map", async () => {
    const releases = (await searched(SONARR_JSON, "sonarr")).map((release) => ({ ...release, episodeIds: null }))

    expect(pickCandidate(releases, DOUBLE, { titles: [], infoHash: null }, ORDER, "sonarr")).toEqual({ ok: false, reason: "NO_OTHER_COPY" })
  })
})
