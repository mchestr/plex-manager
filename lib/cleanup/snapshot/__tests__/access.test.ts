/**
 * @jest-environment node
 */

/**
 * How a library read reaches its sources (TS 7.2.1, 7.3, 7.6 users, 7.8,
 * E23): plex.tv access with a managed Home user, a pending invite, the owner
 * and a null owner id, then the Radarr, Sonarr, Overseerr and Tautulli reads
 * and the limiter plumbing.
 */

const mockWarn = jest.fn()
const mockError = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: (...args: unknown[]) => mockError(...args) }),
}))
jest.mock("@/lib/queue/redis-semaphore", () => ({ redisLimiter: { run: jest.fn((_service: string, fn: () => Promise<unknown>) => fn()) } }))
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

import { buildPlexServer } from "@/__tests__/helpers/factories"
import {
  limited, notConfigured, readArr, readOverseerr, readPlexAccess, readTautulli, safe, statusOf,
} from "@/lib/cleanup/snapshot/access"
import { buildUsers } from "@/lib/cleanup/snapshot/facts"
import { buildOverseerrUserIndex } from "@/lib/connections/overseerr"
import { forEachRequest } from "@/lib/connections/overseerr-cleanup"
import { withMachineIdentifier } from "@/lib/connections/plex-machine-id"
import { getAllPlexServerUsers } from "@/lib/connections/plex-user-info"
import type { PlexServerUser } from "@/lib/connections/plex-core"
import * as radarr from "@/lib/connections/radarr-library"
import * as sonarr from "@/lib/connections/sonarr-library"
import { forEachHistoryRow } from "@/lib/connections/tautulli-history-all"
import { redisLimiter } from "@/lib/queue/redis-semaphore"

const NOW = new Date("2026-11-08T03:07:00.000Z")
const READ_AT = NOW.toISOString()
const SERVER = buildPlexServer({ adminPlexUserId: "9400000", machineIdentifier: "invented-machine" })
const ENDPOINT = { url: "https://arr.example.com", apiKey: "key" }
const user = (id: string, overrides: Partial<PlexServerUser> = {}): PlexServerUser =>
  ({ id, name: "", restricted: false, managed: false, pending: false, ...overrides })
const never = new AbortController().signal

/** `hasAccess` of each id, as the snapshot facts give it from this read. */
function access(read: Awaited<ReturnType<typeof readPlexAccess>>, ids: string[]) {
  const users = buildUsers({ access: read.status.state === "ok" ? read.access.userIds : null, ownerId: read.access.ownerId, lastPlays: null,
    requesters: ids })
  return Object.fromEntries(ids.map((id) => [id, users[id]?.hasAccess]))
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers({ now: NOW })
  jest.mocked(withMachineIdentifier).mockImplementation((async (row: unknown) => row) as never)
  jest.mocked(getAllPlexServerUsers).mockResolvedValue({ success: true, data: [
    user("9400002", { managed: true, restricted: true }),
    user("9400003"),
    user("9400009", { pending: true }),
    user("not-digits"),
  ] })
})

afterEach(() => jest.useRealTimers())

describe("readPlexAccess", () => {
  it("gives a managed Home user and an accepted share access, a pending invite none, and adds the owner", async () => {
    const read = await readPlexAccess(SERVER)

    expect(read).toEqual({
      status: { service: "plex", part: "shares", state: "ok", readAt: READ_AT, rows: 3 },
      access: { userIds: ["9400000", "9400002", "9400003"], ownerId: "9400000", machineIdentifier: "invented-machine" },
    })
    expect(access(read, ["9400000", "9400002", "9400003", "9400009"])).toEqual({ "9400000": true, "9400002": true, "9400003": true, "9400009": false })
  })

  it("fails the shares part with NO_OWNER for a null owner id, so every hasAccess is null, and does not ask plex.tv", async () => {
    const read = await readPlexAccess({ ...SERVER, adminPlexUserId: null })

    expect(read).toEqual({
      status: { service: "plex", part: "shares", state: "failed", readAt: READ_AT, errorCode: "NO_OWNER" },
      access: { userIds: null, ownerId: null, machineIdentifier: "invented-machine" },
    })
    expect(getAllPlexServerUsers).not.toHaveBeenCalled()
    expect(access(read, ["9400002", "9400009"])).toEqual({ "9400002": null, "9400009": null })
    expect(mockWarn).toHaveBeenCalledWith("cleanup.read_access_failed", { code: "NO_OWNER" })
  })

  it("treats an owner id that is not digits as no owner", async () => {
    expect((await readPlexAccess({ ...SERVER, adminPlexUserId: " abc " })).status.errorCode).toBe("NO_OWNER")
  })

  it("fails with NO_MACHINE_ID when the server identity cannot be read", async () => {
    jest.mocked(withMachineIdentifier).mockImplementation((async () => ({ ...SERVER, machineIdentifier: null })) as never)

    const read = await readPlexAccess(SERVER)

    expect(read.status).toMatchObject({ state: "failed", errorCode: "NO_MACHINE_ID" })
    expect(read.access.machineIdentifier).toBeNull()
  })

  it("keeps the stored row when the identity lookup throws", async () => {
    jest.mocked(withMachineIdentifier).mockRejectedValue(new Error("db"))

    expect((await readPlexAccess(SERVER)).access.machineIdentifier).toBe("invented-machine")
  })

  it.each([
    ["answers a failure", () => jest.mocked(getAllPlexServerUsers).mockResolvedValue({ success: false, error: "Plex is temporarily unavailable" })],
    ["throws", () => jest.mocked(getAllPlexServerUsers).mockRejectedValue(new Error("network"))],
  ])("fails with UPSTREAM_ERROR when plex.tv %s, never no access", async (_name, arrange) => {
    arrange()

    const read = await readPlexAccess(SERVER)

    expect(read.status).toMatchObject({ state: "failed", errorCode: "UPSTREAM_ERROR" })
    expect(access(read, ["9400003"])).toEqual({ "9400003": null })
  })

  it("runs both calls through the caller's wrapper", async () => {
    let runs = 0
    const run = <R>(call: () => Promise<R>) => {
      runs++
      return call()
    }

    await readPlexAccess(SERVER, { run })

    expect(runs).toBe(2)
  })
})

describe("the limiter plumbing", () => {
  it("runs each call inside redisLimiter.run with the service and the signal", async () => {
    const opts = limited("sonarr", never)

    await expect(opts.run!(async () => 7)).resolves.toBe(7)

    expect(opts.signal).toBe(never)
    expect(redisLimiter.run).toHaveBeenCalledWith("sonarr", expect.any(Function), { signal: never })
  })

  it("turns a thrown call into REDIS_UNAVAILABLE, or ABORTED once the signal aborted", async () => {
    const boom = async () => {
      throw new Error("boom")
    }
    await expect(safe(never, boom)).resolves.toEqual({ ok: false, code: "REDIS_UNAVAILABLE" })
    expect(mockError).toHaveBeenCalledTimes(1)

    await expect(safe(AbortSignal.abort(), boom)).resolves.toEqual({ ok: false, code: "ABORTED" })
    expect(mockError).toHaveBeenCalledTimes(1)
  })

  it("writes statuses with the time read, the rows or the code", () => {
    expect(statusOf("radarr", { ok: true, data: [] }, 4)).toEqual({ service: "radarr", state: "ok", readAt: READ_AT, rows: 4 })
    expect(statusOf("radarr", { ok: false, code: "TIMEOUT" }, 4)).toEqual({ service: "radarr", state: "failed", readAt: READ_AT, errorCode: "TIMEOUT" })
    expect(notConfigured("sonarr")).toEqual({ service: "sonarr", state: "notConfigured", readAt: null })
  })
})

describe("readArr", () => {
  beforeEach(() => {
    for (const fn of [radarr.listRadarrRootFolders, radarr.listRadarrTags, radarr.listRadarrImportLists, radarr.getRadarrDisk,
      sonarr.listSonarrRootFolders, sonarr.listSonarrTags, sonarr.listSonarrImportLists, sonarr.getSonarrDisk]) {
      jest.mocked(fn).mockResolvedValue({ ok: true, data: [] } as never)
    }
    jest.mocked(radarr.listRadarrMovies).mockResolvedValue({ ok: true, data: [{ id: 1 }, { id: 2 }] } as never)
    jest.mocked(sonarr.listSonarrSeries).mockResolvedValue({ ok: true, data: [{ id: 3 }] } as never)
  })

  it("reads the five calls of each service with its own limiter and counts the records", async () => {
    const [movies, series] = await Promise.all([readArr("radarr", ENDPOINT, never), readArr("sonarr", ENDPOINT, never)])

    expect(movies).toEqual({ status: { service: "radarr", state: "ok", readAt: READ_AT, rows: 2 },
      read: { records: [{ id: 1 }, { id: 2 }], rootFolders: [], tags: [], importLists: [], disk: [] } })
    expect(series.status).toEqual({ service: "sonarr", state: "ok", readAt: READ_AT, rows: 1 })
    expect(jest.mocked(radarr.listRadarrMovies).mock.calls[0][0]).toBe(ENDPOINT)
  })

  it("fails the whole service with the code of its first failed call", async () => {
    jest.mocked(radarr.getRadarrDisk).mockResolvedValue({ ok: false, code: "HTTP", status: 401 })
    jest.mocked(radarr.listRadarrTags).mockResolvedValue({ ok: false, code: "TIMEOUT" })

    expect(await readArr("radarr", ENDPOINT, never)).toEqual({ status: { service: "radarr", state: "failed", readAt: READ_AT, errorCode: "TIMEOUT" },
      read: null })
  })

  it("is notConfigured without a row and calls nothing", async () => {
    expect(await readArr("sonarr", null, never)).toEqual({ status: notConfigured("sonarr"), read: null })
    expect(sonarr.listSonarrSeries).not.toHaveBeenCalled()
  })
})

describe("readOverseerr and readTautulli", () => {
  it("are notConfigured without a row", async () => {
    const builder = { addRequests: jest.fn(), addHistory: jest.fn() }

    expect(await readOverseerr(null, builder, never)).toEqual({ status: notConfigured("overseerr"), users: null })
    expect(await readTautulli(null, builder, never)).toEqual(notConfigured("tautulli"))
    expect(buildOverseerrUserIndex).not.toHaveBeenCalled()
    expect(forEachHistoryRow).not.toHaveBeenCalled()
  })

  it("read the user index, then every request, and the whole history, into the builder", async () => {
    const index = new Map([[9400001, 2]])
    jest.mocked(buildOverseerrUserIndex).mockResolvedValue({ ok: true, data: index })
    jest.mocked(forEachRequest).mockImplementation((async (_c: unknown, onRows: (rows: unknown[]) => void) => {
      onRows([{ id: 1 }])
      return { ok: true, data: { rows: 1, pages: 1 } }
    }) as never)
    jest.mocked(forEachHistoryRow).mockImplementation((async (_c: unknown, query: unknown, onRows: (rows: unknown[]) => void) => {
      expect(query).toEqual({})
      onRows([{ row_id: "1" }])
      return { ok: true, data: { rows: 1, pages: 1, complete: true } }
    }) as never)
    const builder = { addRequests: jest.fn(), addHistory: jest.fn() }

    expect(await readOverseerr(ENDPOINT, builder, never)).toEqual({ status: statusOf("overseerr", { ok: true, data: null }, 1), users: index })
    expect(await readTautulli(ENDPOINT, builder, never)).toEqual(statusOf("tautulli", { ok: true, data: null }, 1))
    expect(builder.addRequests).toHaveBeenCalledWith([{ id: 1 }])
    expect(builder.addHistory).toHaveBeenCalledWith([{ row_id: "1" }])
    expect(redisLimiter.run).toHaveBeenCalledWith("overseerr", expect.any(Function), { signal: never })
  })

  it("fail Overseerr on a failed user index, before any request", async () => {
    jest.mocked(buildOverseerrUserIndex).mockResolvedValue({ ok: false, code: "PAGE_LIMIT" })

    expect(await readOverseerr(ENDPOINT, { addRequests: jest.fn() }, never)).toEqual({
      status: { service: "overseerr", state: "failed", readAt: READ_AT, errorCode: "PAGE_LIMIT" }, users: null,
    })
    expect(forEachRequest).not.toHaveBeenCalled()
  })
})
