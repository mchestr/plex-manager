/**
 * @jest-environment node
 */

/**
 * Tests for lib/connections/radarr-library.ts: the Radarr reads of media
 * cleanup (TS 7.2.2 R1 to R5, TS 8.8 row 1) against the fixtures of
 * lib/cleanup/__tests__/fixtures.
 */

import diskspace from "@/lib/cleanup/__tests__/fixtures/arr-diskspace.json"
import importLists from "@/lib/cleanup/__tests__/fixtures/arr-importlist.json"
import rootFolders from "@/lib/cleanup/__tests__/fixtures/arr-rootfolder.json"
import tags from "@/lib/cleanup/__tests__/fixtures/arr-tag.json"
import movieList from "@/lib/cleanup/__tests__/fixtures/radarr-movie-list.json"
import movie from "@/lib/cleanup/__tests__/fixtures/radarr-movie.json"
import {
  getRadarrDisk,
  getRadarrMovie,
  listRadarrImportLists,
  listRadarrMovies,
  listRadarrRootFolders,
  listRadarrTags,
} from "@/lib/connections/radarr-library"

const CONFIG = { url: "http://radarr.invalid:7878/", apiKey: "radarr-key" }

let fetchSpy: jest.SpyInstance
let timeouts: jest.SpyInstance

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function lastRequest() {
  const [url, init] = fetchSpy.mock.calls.at(-1) as [string, RequestInit]
  return { url: String(url), method: init.method, headers: init.headers as Record<string, string>, body: init.body }
}

beforeEach(() => {
  fetchSpy = jest.spyOn(global, "fetch")
  timeouts = jest.spyOn(AbortSignal, "timeout")
})

afterEach(() => jest.restoreAllMocks())

describe("listRadarrMovies", () => {
  it("reads every movie without covers, with the key in a header and a 60 s budget", async () => {
    fetchSpy.mockResolvedValue(json(movieList))

    const result = await listRadarrMovies(CONFIG)

    expect(result.ok && result.data.map((m) => m.id)).toEqual([11, 12, 13])
    expect(lastRequest()).toEqual({
      url: "http://radarr.invalid:7878/api/v3/movie?excludeLocalCovers=true",
      method: "GET",
      headers: { Accept: "application/json", "X-Api-Key": "radarr-key" },
      body: undefined,
    })
    expect(timeouts).toHaveBeenCalledWith(60_000)
  })

  it("keeps only the declared fields", async () => {
    fetchSpy.mockResolvedValue(json(movieList))

    const result = await listRadarrMovies(CONFIG)

    const first = result.ok ? result.data[0] : undefined
    expect(first).not.toHaveProperty("overview")
    expect(first).not.toHaveProperty("images")
    expect(first).not.toHaveProperty("ratings")
    expect(first).toMatchObject({ tmdbId: 990101, path: "/data/movies/The Lantern Keeper (2014)", hasFile: true, movieFileId: 1101 })
  })

  it("fails above 1 % bad rows", async () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")
    fetchSpy.mockResolvedValue(json([...movieList, { ...movie, id: "eleven" }]))

    expect(await listRadarrMovies(CONFIG)).toEqual({ ok: false, code: "ROWS_INVALID" })
  })

  it("fails when the answer is not a list", async () => {
    fetchSpy.mockResolvedValue(json({ message: "not a list" }))

    expect(await listRadarrMovies(CONFIG)).toEqual({ ok: false, code: "INVALID_RESPONSE" })
  })

  it("returns a 401 at once, with no retry", async () => {
    fetchSpy.mockImplementation(async () => json({}, 401))

    expect(await listRadarrMovies(CONFIG)).toEqual({ ok: false, code: "HTTP", status: 401 })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe("getRadarrMovie", () => {
  it("reads one movie again, 10 s", async () => {
    fetchSpy.mockResolvedValue(json(movie))

    const result = await getRadarrMovie(CONFIG, 11)

    expect(result).toMatchObject({ ok: true, data: { id: 11, imdbId: "tt9900101", tags: [1] } })
    expect(lastRequest()).toMatchObject({ url: "http://radarr.invalid:7878/api/v3/movie/11", method: "GET" })
    expect(timeouts).toHaveBeenCalledWith(10_000)
  })

  it("reports a gone movie as HTTP 404", async () => {
    fetchSpy.mockResolvedValue(json({ message: "NotFound" }, 404))

    expect(await getRadarrMovie(CONFIG, 11)).toEqual({ ok: false, code: "HTTP", status: 404 })
  })

  it.each([0, -1, 1.5, Number.NaN])("refuses the id %p before any request", async (id) => {
    expect(await getRadarrMovie(CONFIG, id)).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("takes one attempt and the act step's budget when asked", async () => {
    fetchSpy.mockImplementation(async () => json({}, 500))

    await getRadarrMovie(CONFIG, 11, { attempts: 1, timeoutMs: 60_000 })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(timeouts).toHaveBeenCalledWith(60_000)
  })
})

describe("the small Radarr lists", () => {
  it.each([
    ["listRadarrTags", listRadarrTags, "/api/v3/tag", tags, [{ id: 1, label: "keep" }, { id: 2, label: "list-import" }]],
    ["listRadarrImportLists", listRadarrImportLists, "/api/v3/importlist", importLists, [{ tags: [2] }]],
    ["listRadarrRootFolders", listRadarrRootFolders, "/api/v3/rootfolder", rootFolders, [{ path: "/data/movies" }]],
    [
      "getRadarrDisk",
      getRadarrDisk,
      "/api/v3/diskspace",
      diskspace,
      [
        { path: "/data", freeSpace: 1099511627776, totalSpace: 8796093022208 },
        { path: "/", freeSpace: 53687091200, totalSpace: 107374182400 },
      ],
    ],
  ] as const)("%s reads %s, 10 s", async (_name, read, path, body, expected) => {
    fetchSpy.mockResolvedValue(json(body))

    expect(await read(CONFIG)).toEqual({ ok: true, data: expected })
    expect(lastRequest()).toMatchObject({ url: `http://radarr.invalid:7878${path}`, method: "GET" })
    expect(timeouts).toHaveBeenCalledWith(10_000)
  })

  it("fails a small list of another shape", async () => {
    fetchSpy.mockResolvedValue(json([{ id: "one" }]))

    expect(await listRadarrTags(CONFIG)).toEqual({ ok: false, code: "INVALID_RESPONSE" })
  })

  it("never puts the API key in a URL", async () => {
    fetchSpy.mockImplementation(async () => json([]))

    await listRadarrTags(CONFIG)
    await listRadarrRootFolders(CONFIG)

    for (const [url] of fetchSpy.mock.calls) expect(String(url)).not.toContain("radarr-key")
  })
})
