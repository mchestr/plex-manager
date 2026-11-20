/**
 * @jest-environment node
 */

/**
 * `readLibrary()` (TS 7.1, 7.3, 7.8, 17.1) on the recorded fixtures, with the
 * real snapshot builder and every upstream client mocked: the source order
 * and the limiter, each failure row of TS 7.8, the season-open skip, busy,
 * abort, the 20-minute stop, the row baseline and the claim on every path.
 */

const mockWarn = jest.fn()
const mockError = jest.fn()
const mockLog: string[] = []
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: (...args: unknown[]) => mockError(...args) }),
}))
jest.mock("@/lib/cleanup/claims", () => ({ claim: jest.fn(), release: jest.fn() }))
jest.mock("@/lib/cleanup/settings", () => ({ readCleanupSettingsRow: jest.fn() }))
jest.mock("@/lib/cleanup/snapshot/store", () => ({
  createSnapshotHeader: jest.fn(), failSnapshot: jest.fn(), writeSnapshot: jest.fn(), pruneSnapshots: jest.fn(), loadPreviousCompleteHeader: jest.fn(),
}))
jest.mock("@/lib/wrapped/season", () => ({ getSeasonState: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/queue/redis-semaphore", () => ({
  redisLimiter: { run: jest.fn((service: string, fn: () => Promise<unknown>) => (mockLog.push(`limit:${service}`), fn())) },
}))
jest.mock("@/lib/connections/plex-library-read", () => ({
  ...jest.requireActual("@/lib/connections/plex-library-read"),
  listPlexSections: jest.fn(), forEachPlexRow: jest.fn(), listPlexCollections: jest.fn(), listPlexCollectionItems: jest.fn(),
}))
jest.mock("@/lib/connections/plex-user-info", () => ({ getAllPlexServerUsers: jest.fn() }))
jest.mock("@/lib/connections/plex-machine-id", () => ({ withMachineIdentifier: jest.fn() }))
jest.mock("@/lib/connections/radarr-library", () => ({
  listRadarrRootFolders: jest.fn(), listRadarrMovies: jest.fn(), listRadarrTags: jest.fn(), listRadarrImportLists: jest.fn(), getRadarrDisk: jest.fn(),
}))
jest.mock("@/lib/connections/sonarr-library", () => ({
  listSonarrRootFolders: jest.fn(), listSonarrSeries: jest.fn(), listSonarrTags: jest.fn(), listSonarrImportLists: jest.fn(), getSonarrDisk: jest.fn(),
}))
jest.mock("@/lib/connections/tautulli-history-all", () => ({ forEachHistoryRow: jest.fn() }))
jest.mock("@/lib/connections/overseerr", () => ({ buildOverseerrUserIndex: jest.fn() }))
jest.mock("@/lib/connections/overseerr-cleanup", () => ({ forEachRequest: jest.fn() }))

import type { z } from "zod"

import { buildPlexServer } from "@/__tests__/helpers/factories"
import { buildOptions, buildSnapshotFacts, buildSourceStatuses } from "@/lib/cleanup/__tests__/helpers/builders"
import diskspace from "@/lib/cleanup/__tests__/fixtures/arr-diskspace.json"
import importLists from "@/lib/cleanup/__tests__/fixtures/arr-importlist.json"
import rootFolders from "@/lib/cleanup/__tests__/fixtures/arr-rootfolder.json"
import tags from "@/lib/cleanup/__tests__/fixtures/arr-tag.json"
import collectionItems from "@/lib/cleanup/__tests__/fixtures/plex-collection-items.json"
import collectionsPage from "@/lib/cleanup/__tests__/fixtures/plex-collections.json"
import episodesPage from "@/lib/cleanup/__tests__/fixtures/plex-episodes-page.json"
import moviesPage from "@/lib/cleanup/__tests__/fixtures/plex-movies-page.json"
import seasonsPage from "@/lib/cleanup/__tests__/fixtures/plex-seasons-page.json"
import sectionsPage from "@/lib/cleanup/__tests__/fixtures/plex-sections.json"
import showsPage from "@/lib/cleanup/__tests__/fixtures/plex-shows-page.json"
import radarrList from "@/lib/cleanup/__tests__/fixtures/radarr-movie-list.json"
import requestPage from "@/lib/cleanup/__tests__/fixtures/seerr-request-page.json"
import seerrUsers from "@/lib/cleanup/__tests__/fixtures/seerr-users-page.json"
import sonarrList from "@/lib/cleanup/__tests__/fixtures/sonarr-series-list.json"
import historyPage from "@/lib/cleanup/__tests__/fixtures/tautulli-history-page.json"
import { claim, type Claim, release } from "@/lib/cleanup/claims"
import { type SnapshotFacts, type SnapshotItem, snapshotFactsSchema, snapshotItemSchema, type SourceStatus } from "@/lib/cleanup/schema/snapshot"
import {
  arrDiskSchema, arrImportListSchema, arrRootFolderSchema, arrTagSchema, historyRowSchema, plexCollectionItemRow, plexCollectionRow, plexSectionSchema,
  radarrMovieSchema, seerrRequestSchema, sonarrSeriesSchema,
} from "@/lib/cleanup/schema/upstream"
import { readCleanupSettingsRow } from "@/lib/cleanup/settings"
import { inSeasonOpenWindow, readLibrary, READ_TIMEOUT_MS } from "@/lib/cleanup/snapshot/read"
import type { CleanupReadOptions, OnRows } from "@/lib/cleanup/snapshot/rows"
import { createSnapshotHeader, failSnapshot, loadPreviousCompleteHeader, pruneSnapshots, writeSnapshot } from "@/lib/cleanup/snapshot/store"
import { buildOverseerrUserIndex } from "@/lib/connections/overseerr"
import { forEachRequest } from "@/lib/connections/overseerr-cleanup"
import { forEachPlexRow, listPlexCollectionItems, listPlexCollections, listPlexSections } from "@/lib/connections/plex-library-read"
import { withMachineIdentifier } from "@/lib/connections/plex-machine-id"
import { getAllPlexServerUsers } from "@/lib/connections/plex-user-info"
import * as radarr from "@/lib/connections/radarr-library"
import * as sonarr from "@/lib/connections/sonarr-library"
import { forEachHistoryRow } from "@/lib/connections/tautulli-history-all"
import { getActiveService } from "@/lib/data/active-service"
import { redisLimiter } from "@/lib/queue/redis-semaphore"
import { getSeasonState } from "@/lib/wrapped/season"

const NOW = new Date("2026-11-08T03:07:00.000Z")
const OPENS = new Date("2026-12-01T00:00:00.000Z")
const SERVER = buildPlexServer({ url: "https://plex.example.com:32400", token: "plex-token", adminPlexUserId: "9400000", machineIdentifier: "invented-machine" })
const ENDPOINT = { url: "https://arr.example.com", apiKey: "key" }
const SECTIONS = sectionsPage.MediaContainer.Directory.map((r) => plexSectionSchema.parse(r))
const LISTINGS: Record<string, unknown[]> = {
  "1:1": moviesPage.MediaContainer.Metadata, "3:1": [], "2:2": showsPage.MediaContainer.Metadata, "2:3": seasonsPage.MediaContainer.Metadata,
  "2:4": episodesPage.MediaContainer.Metadata,
}
const ok = <T>(data: T) => ({ ok: true as const, data })
const failure = (code: string) => ({ ok: false as const, code })
type Failure = ReturnType<typeof failure>

/** Per call name, the answer to give instead of the fixture. */
let faults: Record<string, Failure | (() => Promise<Failure>)> = {}
let lost: AbortController
let written: { parts: Record<string, SnapshotItem[]>; sources: SourceStatus[]; facts: SnapshotFacts } | null

/** Logs the call and answers its fault or the fixture, through the caller's limiter. */
function answer<T>(name: string, opts: CleanupReadOptions | undefined, data: () => T | Promise<T>) {
  const call = async () => {
    mockLog.push(name)
    const fault = faults[name]
    if (fault) return typeof fault === "function" ? fault() : fault
    return ok(await data())
  }
  return opts?.run ? opts.run(call) : call()
}

function install(): void {
  jest.mocked(claim).mockImplementation(async (): Promise<Claim> => ({ column: "readClaimAt", lost: lost.signal, value: () => NOW }))
  jest.mocked(release).mockResolvedValue(true)
  jest.mocked(readCleanupSettingsRow).mockResolvedValue({ options: buildOptions({ protections: { g13: { enabled: true, collections: ["Leaving soon"] } } }) } as never)
  jest.mocked(createSnapshotHeader).mockResolvedValue("snap-2")
  jest.mocked(failSnapshot).mockResolvedValue(true)
  jest.mocked(writeSnapshot).mockImplementation(async (_id, input) => {
    written = { parts: { ...input.parts }, sources: [...input.sources], facts: input.facts } as never
    return { ok: true }
  })
  jest.mocked(pruneSnapshots).mockResolvedValue(0)
  jest.mocked(loadPreviousCompleteHeader).mockResolvedValue(null)
  jest.mocked(getSeasonState).mockResolvedValue({ seasonYear: 2026, isOpen: false, opensAt: OPENS, closesAt: new Date("2027-02-01T00:00:00.000Z") })
  jest.mocked(getActiveService).mockImplementation((async (kind: string) => (kind === "plex" ? SERVER : ENDPOINT)) as never)
  jest.mocked(withMachineIdentifier).mockImplementation(async (row) => row)
  jest.mocked(getAllPlexServerUsers).mockImplementation(async () => {
    mockLog.push("plextv:users")
    return { success: true, data: [
      { id: "9400001", name: "", restricted: false, managed: false, pending: false },
      { id: "9400002", name: "", restricted: true, managed: true, pending: false },
      { id: "9400009", name: "", restricted: false, managed: false, pending: true },
    ] }
  })
  jest.mocked(listPlexSections).mockImplementation((async (_c: unknown, opts?: CleanupReadOptions) => answer("plex:sections", opts, () => SECTIONS)) as never)
  jest.mocked(forEachPlexRow).mockImplementation((async (_c: unknown, id: string, type: number, schema: z.ZodType<unknown>, onRows: OnRows<unknown>,
    opts?: CleanupReadOptions) => answer(`plex:list:${id}:${type}`, opts, async () => {
    const raw = LISTINGS[`${id}:${type}`] ?? []
    await onRows(raw.map((r) => schema.parse(r)))
    return { rows: raw.length, pages: 1 }
  })) as never)
  jest.mocked(listPlexCollections).mockImplementation((async (_c: unknown, id: string, opts?: CleanupReadOptions) => answer(`plex:collections:${id}`, opts,
    () => (id === "1" ? collectionsPage.MediaContainer.Metadata.map((r) => plexCollectionRow.parse(r)) : [])) as never))
  jest.mocked(listPlexCollectionItems).mockImplementation((async (_c: unknown, id: string, opts?: CleanupReadOptions) => answer(`plex:members:${id}`, opts,
    () => collectionItems.MediaContainer.Metadata.map((r) => plexCollectionItemRow.parse(r)))) as never)
  const arr = (name: string, list: () => unknown) => (async (_c: unknown, opts?: CleanupReadOptions) => answer(name, opts, list)) as never
  jest.mocked(radarr.listRadarrRootFolders).mockImplementation(arr("radarr:rootfolder", () => arrRootFolderSchema.parse(rootFolders)))
  jest.mocked(radarr.listRadarrMovies).mockImplementation(arr("radarr:movie", () => radarrList.map((r) => radarrMovieSchema.parse(r))))
  jest.mocked(radarr.listRadarrTags).mockImplementation(arr("radarr:tag", () => arrTagSchema.parse(tags)))
  jest.mocked(radarr.listRadarrImportLists).mockImplementation(arr("radarr:importlist", () => arrImportListSchema.parse(importLists)))
  jest.mocked(radarr.getRadarrDisk).mockImplementation(arr("radarr:diskspace", () => arrDiskSchema.parse(diskspace)))
  jest.mocked(sonarr.listSonarrRootFolders).mockImplementation(arr("sonarr:rootfolder", () => [{ path: "/data/tv" }]))
  jest.mocked(sonarr.listSonarrSeries).mockImplementation(arr("sonarr:series", () => sonarrList.map((r) => sonarrSeriesSchema.parse(r))))
  jest.mocked(sonarr.listSonarrTags).mockImplementation(arr("sonarr:tag", () => arrTagSchema.parse(tags)))
  jest.mocked(sonarr.listSonarrImportLists).mockImplementation(arr("sonarr:importlist", () => arrImportListSchema.parse(importLists)))
  jest.mocked(sonarr.getSonarrDisk).mockImplementation(arr("sonarr:diskspace", () => arrDiskSchema.parse(diskspace)))
  jest.mocked(forEachHistoryRow).mockImplementation((async (_c: unknown, _q: unknown, onRows: OnRows<unknown>, opts?: CleanupReadOptions) =>
    answer("tautulli:history", opts, async () => {
      await onRows(historyPage.response.data.data.map((r) => historyRowSchema.parse(r)))
      return { rows: 3, pages: 1, complete: true }
    })) as never)
  jest.mocked(buildOverseerrUserIndex).mockImplementation((async () => {
    mockLog.push("overseerr:users")
    const fault = faults["overseerr:users"]
    return fault && typeof fault !== "function" ? fault : ok(new Map(seerrUsers.results.map((u) => [u.plexId, u.id])))
  }) as never)
  jest.mocked(forEachRequest).mockImplementation((async (_c: unknown, onRows: OnRows<unknown>, opts?: CleanupReadOptions) => answer("overseerr:requests", opts,
    async () => {
      await onRows(requestPage.results.map((r) => seerrRequestSchema.parse(r)))
      return { rows: 3, pages: 1 }
    })) as never)
}

const items = () => [...written!.parts.movie, ...written!.parts.show, ...written!.parts.season]
const source = (service: string, part?: string) =>
  (written?.sources ?? []).find((s) => s.service === service && (part ? s.part === part : s.part !== "shares"))
const failedHeader = () => jest.mocked(failSnapshot).mock.calls[0]?.[1] ?? null
const status = (service: string, part: string | undefined, list: readonly SourceStatus[]) =>
  list.find((s) => s.service === service && (part ? s.part === part : s.part !== "shares"))

beforeEach(() => {
  jest.clearAllMocks()
  mockLog.length = 0
  faults = {}
  written = null
  lost = new AbortController()
  jest.useFakeTimers({ now: NOW })
  install()
})

afterEach(() => jest.useRealTimers())

describe("a complete read", () => {
  it("reads in the order of TS 7.3, each call inside the limiter of its service", async () => {
    const result = await readLibrary({ trigger: "scheduled" })

    expect(result).toEqual({ snapshotId: "snap-2", status: "complete", sources: written!.sources })
    const calls = mockLog.filter((entry) => !entry.startsWith("limit:"))
    const at = (name: string) => calls.indexOf(name)
    expect(calls.slice(0, 2)).toEqual(["plex:sections", "plextv:users"])
    expect(calls.filter((c) => c.startsWith("plex:list"))).toEqual(["plex:list:1:1", "plex:list:3:1", "plex:list:2:2", "plex:list:2:3", "plex:list:2:4"])
    for (const name of ["radarr:rootfolder", "radarr:movie", "radarr:diskspace", "sonarr:series", "overseerr:users"]) {
      expect(at(name)).toBeGreaterThan(at("plextv:users"))
      expect(at(name)).toBeLessThan(at("plex:list:1:1"))
    }
    expect(at("plex:collections:1")).toBeGreaterThan(at("plex:list:2:4"))
    expect(calls.filter((c) => c.startsWith("plex:collections"))).toEqual(["plex:collections:1", "plex:collections:2", "plex:collections:3"])
    expect(at("plex:members:501")).toBeGreaterThan(at("plex:collections:3"))
    expect(at("tautulli:history")).toBeGreaterThan(at("plex:members:501"))
    // Every call ran inside the limiter of its own service.
    const limits = mockLog.filter((entry) => entry.startsWith("limit:"))
    expect(new Set(limits)).toEqual(new Set(["limit:plex", "limit:radarr", "limit:sonarr", "limit:tautulli", "limit:overseerr"]))
    // One more: the machine identifier lookup of P2, which logs no call here.
    expect(limits).toHaveLength(calls.length + 1)
    expect(jest.mocked(redisLimiter.run).mock.calls.every(([, , options]) => options?.signal instanceof AbortSignal)).toBe(true)
    expect(release).toHaveBeenCalledTimes(1)
    expect(pruneSnapshots).toHaveBeenCalledTimes(1)
  })

  it("stores items and facts that parse, with rows on every source status", async () => {
    await readLibrary({ trigger: "admin", actorId: "admin-1" })

    expect(createSnapshotHeader).toHaveBeenCalledWith({ trigger: "admin", actorId: "admin-1", startedAt: NOW })
    for (const item of items()) expect(snapshotItemSchema.parse(item)).toEqual(item)
    expect(snapshotFactsSchema.parse(written!.facts)).toEqual(written!.facts)
    expect(written!.facts.takenAt).toBe(NOW.toISOString())
    const readAt = NOW.toISOString()
    expect(written!.sources).toEqual([
      { service: "plex", part: "server", state: "ok", readAt, rows: 14 },
      { service: "plex", part: "shares", state: "ok", readAt, rows: 3 },
      { service: "tautulli", state: "ok", readAt, rows: 3 },
      { service: "overseerr", state: "ok", readAt, rows: 3 },
      { service: "radarr", state: "ok", readAt, rows: 3 },
      { service: "sonarr", state: "ok", readAt, rows: 2 },
    ])
  })

  it("passes labels, episode files, members and access to the builder", async () => {
    await readLibrary({ trigger: "scheduled" })

    expect(written!.facts.membersRead).toEqual(["Leaving soon"])
    expect(written!.facts.labelsRead).toContain("1")
    expect(written!.facts.machineIdentifier).toBe("invented-machine")
    expect(written!.facts.users["9400002"]).toEqual(expect.objectContaining({ hasAccess: true }))
    expect(written!.facts.users["9400000"]).toEqual(expect.objectContaining({ hasAccess: true, owner: true }))
    const lantern = written!.parts.movie.find((item) => item.ratingKey === "101")!
    expect(lantern.collections).toEqual(["Leaving soon"])
    expect(lantern.labels.length).toBeGreaterThan(0)
    expect(written!.parts.show.some((item) => (item.sizeBytes ?? 0) > 0 && (item.episodeCount ?? 0) > 0)).toBe(true)
  })

  it("logs a failed prune and stays complete", async () => {
    jest.mocked(pruneSnapshots).mockRejectedValue(new Error("db"))

    expect(await readLibrary({ trigger: "scheduled" })).toMatchObject({ status: "complete" })
    expect(mockError).toHaveBeenCalledWith("cleanup.snapshot_prune_failed", expect.any(Error))
  })
})

describe("the row baseline", () => {
  it("is empty with no earlier complete snapshot", async () => {
    await readLibrary({ trigger: "scheduled" })

    expect(loadPreviousCompleteHeader).toHaveBeenCalledWith("snap-2")
    expect(written!.facts.rowBaseline).toEqual({})
  })

  it("carries the baseline of a failed earlier read, and takes the counts of a good one", async () => {
    const prevFacts = buildSnapshotFacts({ history: { ...buildSnapshotFacts().history, usersWithPlay: 12 },
      rowBaseline: { overseerrRequests: 300, tautulliRows: 5000, usersWithPlay: 14 } })
    jest.mocked(loadPreviousCompleteHeader).mockResolvedValue({
      id: "snap-1", status: "complete", trigger: "scheduled", actorId: null, startedAt: NOW, finishedAt: NOW,
      sources: buildSourceStatuses({ tautulli: { state: "failed", errorCode: "TIMEOUT" }, overseerr: { rows: 310 } }), facts: prevFacts,
    })

    await readLibrary({ trigger: "scheduled" })

    expect(written!.facts.rowBaseline).toEqual({ overseerrRequests: 310, tautulliRows: 5000, usersWithPlay: 14 })
  })

  it("ignores an earlier header whose facts do not parse", async () => {
    jest.mocked(loadPreviousCompleteHeader).mockResolvedValue({ id: "snap-1", status: "complete", trigger: "scheduled", actorId: null, startedAt: NOW,
      finishedAt: NOW, sources: buildSourceStatuses(), facts: null })

    await readLibrary({ trigger: "scheduled" })

    expect(written!.facts.rowBaseline).toEqual({})
  })
})

describe("failures (TS 7.8)", () => {
  it.each([
    ["the sections", "plex:sections"],
    ["a movie page", "plex:list:1:1"],
    ["a show page", "plex:list:2:2"],
    ["a season page", "plex:list:2:3"],
    ["an episode page", "plex:list:2:4"],
  ])("fails the read when %s fails: a failed header and no parts", async (_name, call) => {
    faults[call] = failure("HTTP")

    const result = await readLibrary({ trigger: "scheduled" })

    expect(result).toMatchObject({ snapshotId: "snap-2", status: "failed", errorCode: "HTTP" })
    expect(writeSnapshot).not.toHaveBeenCalled()
    expect(pruneSnapshots).not.toHaveBeenCalled()
    expect(status("plex", "server", failedHeader()!)).toMatchObject({ state: "failed", errorCode: "HTTP" })
    expect(mockLog).not.toContain("tautulli:history")
    expect(release).toHaveBeenCalledTimes(1)
  })

  it("stops the parallel reads when a Plex page fails", async () => {
    let seen: AbortSignal | undefined
    jest.mocked(forEachRequest).mockImplementation((async (_c: unknown, _rows: unknown, opts: CleanupReadOptions) => {
      await Promise.resolve()
      seen = opts.signal
      return failure("ABORTED")
    }) as never)
    faults["plex:list:1:1"] = failure("ROWS_INVALID")

    await readLibrary({ trigger: "scheduled" })

    expect(seen?.aborted).toBe(true)
    expect(status("overseerr", undefined, failedHeader()!)).toMatchObject({ state: "failed", errorCode: "ABORTED" })
  })

  it("keeps Plex ok when a collection listing or a member read fails, and leaves the title out of membersRead", async () => {
    faults["plex:members:501"] = failure("TIMEOUT")

    await readLibrary({ trigger: "scheduled" })

    expect(source("plex")).toMatchObject({ state: "ok" })
    expect(written!.facts.membersRead).toEqual([])

    faults = { "plex:collections:3": failure("HTTP") }
    await readLibrary({ trigger: "scheduled" })
    expect(source("plex")).toMatchObject({ state: "ok" })
    expect(written!.facts.membersRead).toEqual([])
  })

  it.each([
    ["plex.tv does not answer", () => jest.mocked(getAllPlexServerUsers).mockResolvedValue({ success: false, error: "unavailable" }), "UPSTREAM_ERROR"],
    ["the Plex row has no owner id", () => jest.mocked(getActiveService).mockImplementation((async (kind: string) =>
      (kind === "plex" ? { ...SERVER, adminPlexUserId: null } : ENDPOINT)) as never), "NO_OWNER"],
  ])("fails the shares part when %s, so no user reads as without access", async (_name, arrange, code) => {
    arrange()

    expect(await readLibrary({ trigger: "scheduled" })).toMatchObject({ status: "complete" })

    expect(source("plex", "shares")).toMatchObject({ state: "failed", errorCode: code })
    expect(Object.values(written!.facts.users).map((user) => user.hasAccess)).toEqual(Object.values(written!.facts.users).map(() => null))
  })

  it("stores plays: null on every item when Tautulli fails", async () => {
    faults["tautulli:history"] = failure("TAUTULLI_ERROR")

    await readLibrary({ trigger: "scheduled" })

    expect(source("tautulli")).toMatchObject({ state: "failed", errorCode: "TAUTULLI_ERROR" })
    expect(items().every((item) => item.plays === null)).toBe(true)
    expect(items().some((item) => item.requests !== null)).toBe(true)
  })

  it.each(["overseerr:users", "overseerr:requests"])("stores requests: null on every item when %s fails", async (call) => {
    faults[call] = failure("HTTP")

    await readLibrary({ trigger: "scheduled" })

    expect(source("overseerr")).toMatchObject({ state: "failed", errorCode: "HTTP" })
    expect(items().every((item) => item.requests === null)).toBe(true)
  })

  it("gives movies arrFailed and no arr data when a Radarr call fails", async () => {
    faults["radarr:tag"] = failure("NETWORK")

    await readLibrary({ trigger: "scheduled" })

    expect(source("radarr")).toMatchObject({ state: "failed", errorCode: "NETWORK" })
    expect(written!.parts.movie.every((item) => item.match.state === "unknown" && item.match.cause === "arrFailed" && item.arr === null
      && item.added.arr === null)).toBe(true)
    expect(written!.parts.show.some((item) => item.arr !== null)).toBe(true)
  })

  it("gives shows and seasons arrFailed and show: null when a Sonarr call fails", async () => {
    faults["sonarr:series"] = failure("ROWS_INVALID")

    await readLibrary({ trigger: "scheduled" })

    expect(source("sonarr")).toMatchObject({ state: "failed", errorCode: "ROWS_INVALID" })
    expect([...written!.parts.show, ...written!.parts.season].every((item) => item.match.cause === "arrFailed" && item.show === null)).toBe(true)
  })

  it("records notConfigured for each service that is not set up", async () => {
    jest.mocked(getActiveService).mockImplementation((async (kind: string) => (kind === "plex" ? SERVER : null)) as never)

    await readLibrary({ trigger: "scheduled" })

    for (const service of ["tautulli", "overseerr", "radarr", "sonarr"]) expect(source(service)).toEqual({ service, state: "notConfigured", readAt: null })
    expect(mockLog.filter((c) => /^(limit:)?(radarr|sonarr|tautulli|overseerr)/.test(c))).toEqual([])
  })

  it("fails the read with no Plex server", async () => {
    jest.mocked(getActiveService).mockResolvedValue(null)

    expect(await readLibrary({ trigger: "scheduled" })).toMatchObject({ status: "failed", errorCode: "NO_PLEX_SERVER" })
    expect(failedHeader()).toEqual([{ service: "plex", part: "server", state: "notConfigured", readAt: null }])
  })

  it("records REDIS_UNAVAILABLE when the limiter throws", async () => {
    jest.mocked(redisLimiter.run).mockRejectedValueOnce(new Error("redis down"))

    expect(await readLibrary({ trigger: "scheduled" })).toMatchObject({ status: "failed", errorCode: "REDIS_UNAVAILABLE" })
    expect(mockError).toHaveBeenCalledWith("cleanup.read_call_failed", expect.any(Error))
  })

  it("fails a part above 20 MB with PART_TOO_LARGE", async () => {
    jest.mocked(writeSnapshot).mockResolvedValue({ ok: false, code: "PART_TOO_LARGE", level: "season", bytes: 21 * 1024 * 1024 })

    expect(await readLibrary({ trigger: "scheduled" })).toMatchObject({ status: "failed", errorCode: "PART_TOO_LARGE" })
    expect(pruneSnapshots).not.toHaveBeenCalled()
  })

  it("fails the header and releases the claim when a step throws", async () => {
    jest.mocked(writeSnapshot).mockRejectedValue(new Error("db"))

    expect(await readLibrary({ trigger: "scheduled" })).toEqual({ snapshotId: "snap-2", status: "failed", sources: [], errorCode: "INTERNAL" })
    expect(failSnapshot).toHaveBeenCalledWith("snap-2", [])
    expect(mockError).toHaveBeenCalledWith("cleanup.read_failed", expect.any(Error), { snapshotId: "snap-2" })
    expect(release).toHaveBeenCalledTimes(1)
  })
})

describe("claim, skip, abort and the time limit", () => {
  it("returns busy and writes nothing while another read holds the claim", async () => {
    jest.mocked(claim).mockResolvedValue(null)

    expect(await readLibrary({ trigger: "scheduled" })).toEqual({ busy: true })
    expect(createSnapshotHeader).not.toHaveBeenCalled()
    expect(release).not.toHaveBeenCalled()
  })

  it("skips in the season-open window, with no header, and releases the claim", async () => {
    jest.mocked(getSeasonState).mockResolvedValue({ seasonYear: 2026, isOpen: true, opensAt: new Date(NOW.getTime() - 60 * 60_000), closesAt: OPENS })

    expect(await readLibrary({ trigger: "scheduled" })).toEqual({ skipped: "seasonOpen" })
    expect(createSnapshotHeader).not.toHaveBeenCalled()
    expect(mockLog).toEqual([])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it.each([
    [14 * 60_000, false],
    [15 * 60_000, true],
    [8 * 60 * 60_000 - 1, true],
    [8 * 60 * 60_000, false],
    [-60_000, false],
  ])("puts %p ms after the season opens in the window: %p", (since, inside) => {
    expect(inSeasonOpenWindow(new Date(OPENS.getTime() + since), OPENS)).toBe(inside)
  })

  it.each([
    ["the job stops", (job: AbortController) => job.abort()],
    ["the claim is lost", () => lost.abort()],
  ])("leaves the header reading when %s between pages, and releases the claim", async (_name, stop) => {
    const job = new AbortController()
    faults["plex:list:2:3"] = async () => {
      stop(job)
      return failure("ABORTED")
    }

    const result = await readLibrary({ trigger: "scheduled", signal: job.signal })

    expect(result).toMatchObject({ status: "failed", errorCode: "ABORTED" })
    expect(failSnapshot).not.toHaveBeenCalled()
    expect(writeSnapshot).not.toHaveBeenCalled()
    expect(mockLog).not.toContain("plex:list:2:4")
    expect(release).toHaveBeenCalledTimes(1)
  })

  it("stops after 20 minutes with TIMEOUT and a failed header", async () => {
    let signal: AbortSignal | undefined
    jest.mocked(forEachPlexRow).mockImplementation((async (_c: unknown, _id: string, _t: number, _s: unknown, _r: unknown, opts: CleanupReadOptions) => {
      signal = opts.signal
      return new Promise((resolve) => opts.signal!.addEventListener("abort", () => resolve(failure("ABORTED"))))
    }) as never)

    const pending = readLibrary({ trigger: "scheduled" })
    await jest.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1)
    expect(signal?.aborted).toBe(false)
    await jest.advanceTimersByTimeAsync(1)
    const result = await pending

    expect(result).toMatchObject({ status: "failed", errorCode: "TIMEOUT" })
    expect(status("plex", "server", failedHeader()!)).toMatchObject({ state: "failed", errorCode: "TIMEOUT" })
    expect(release).toHaveBeenCalledTimes(1)
  })

  it("logs a failed release", async () => {
    jest.mocked(release).mockRejectedValue(new Error("db"))

    expect(await readLibrary({ trigger: "scheduled" })).toMatchObject({ status: "complete" })
    expect(mockError).toHaveBeenCalledWith("cleanup.claim_release_failed", expect.any(Error), { column: "readClaimAt" })
  })
})
