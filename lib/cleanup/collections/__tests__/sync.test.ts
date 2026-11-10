/**
 * @jest-environment node
 */

/**
 * `syncCollections()` end to end (TS 8.10, E26) on the real claims, the
 * real Plex clients and a fake Plex server behind `fetch`, with the settings
 * row and the items in a fake database: create, adopt, add, remove, the
 * fewest moves, hubs, delete on empty, notices, guards, the 405 fallback,
 * the busy claim and the extra rounds.
 */

const mockWarn = jest.fn()
const mockError = jest.fn()
const mockEnqueue = jest.fn()
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: (...args: unknown[]) => mockError(...args) }),
}))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/brand", () => ({ serverName: async () => "Example Plex" }))
jest.mock("@/lib/env", () => ({ ...jest.requireActual("@/lib/env"), getBaseUrl: jest.fn(() => "https://members.example.com/") }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: () => true }))
jest.mock("@/lib/queue/request-path", () => ({ enqueueFromRequest: (...args: unknown[]) => mockEnqueue(...args) }))

import { mockReset } from "jest-mock-extended"

import { buildPlexServer } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"
import { MAX_ROUNDS, syncCollections } from "@/lib/cleanup/collections/sync"
import { COLLECTION_TITLES } from "@/lib/cleanup/constants"
import { type CleanupRuntime, parseRuntime } from "@/lib/cleanup/schema/runtime"
import { getActiveService } from "@/lib/data/active-service"
import { getBaseUrl } from "@/lib/env"
import type { CleanupSettings } from "@/lib/generated/prisma/client"

const NOW = new Date("2026-11-08T12:41:00.000Z")
const BASE = "https://plex.example.com:32400"
const MACHINE = "invented-machine-id"
const MOVIES = COLLECTION_TITLES.movie

/* ----------------------------------------------------------- fake Plex */

interface FakeItem {
  ratingKey: string
  type: string
  title: string
  sectionId: string
  smart?: boolean
  members: string[]
  summary?: string
  sort?: string
}
interface FakeHub { identifier: string; sectionId: string; recommended: boolean; ownHome: boolean; sharedHome: boolean }
/** Answer `status` to the matching requests after the first `skip`, `times` times. */
interface Fault { method: string; path: RegExp; status: number; times: number; skip?: number }

const plex = {
  items: new Map<string, FakeItem>(),
  hubs: new Map<string, FakeHub>(),
  next: 90001,
  requests: [] as string[],
  faults: [] as Fault[],
  removeAnswers405: false,
  onCreate: null as null | (() => void),
  /** Metadata answers that differ from the listing (a key Plex now gives to something else). */
  metaOverrides: new Map<string, Partial<FakeItem>>(),
}
const everyDelete: string[] = []

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const text = (status = 200) => new Response("", { status })
const flag = (value: boolean) => (value ? 1 : 0)

function addCollection(item: Partial<FakeItem> & { ratingKey: string }): FakeItem {
  const full: FakeItem = { type: "collection", title: MOVIES, sectionId: "1", members: [], ...item }
  plex.items.set(full.ratingKey, full)
  return full
}

function metaOf(item: FakeItem) {
  return { MediaContainer: { size: 1, Metadata: [{ ratingKey: item.ratingKey, type: item.type, title: item.title, smart: item.smart ? 1 : 0,
    librarySectionID: Number(item.sectionId) }] } }
}

function route(method: string, url: URL): Response {
  const path = url.pathname
  const q = url.searchParams
  let m: RegExpMatchArray | null
  if (method === "GET" && (m = path.match(/^\/library\/(?:metadata|collections)\/(\d+)$/))) {
    const item = plex.items.get(m[1])
    return item ? json(metaOf({ ...item, ...plex.metaOverrides.get(m[1]) })) : text(404)
  }
  if (method === "DELETE" && (m = path.match(/^\/library\/collections\/(\d+)$/))) {
    return plex.items.delete(m[1]) ? text(200) : text(404)
  }
  if (method === "POST" && path === "/library/collections") {
    const item = addCollection({ ratingKey: String(plex.next++), title: q.get("title") ?? "", sectionId: q.get("sectionId") ?? "" })
    plex.onCreate?.()
    return json({ MediaContainer: { size: 1, Metadata: [{ ratingKey: item.ratingKey, type: "collection" }] } })
  }
  if (method === "PUT" && (m = path.match(/^\/library\/sections\/(\d+)\/all$/))) {
    plex.items.get(q.get("id") ?? "")!.summary = q.get("summary.value") ?? ""
    return text(200)
  }
  if (method === "PUT" && (m = path.match(/^\/library\/metadata\/(\d+)\/prefs$/))) {
    plex.items.get(m[1])!.sort = q.get("collectionSort") ?? ""
    return text(200)
  }
  if (method === "GET" && (m = path.match(/^\/library\/sections\/(\d+)\/all$/))) {
    const rows = [...plex.items.values()].filter((item) => item.type === "collection" && item.sectionId === m![1])
      .map((item) => ({ ratingKey: item.ratingKey, title: item.title, childCount: item.members.length, smart: item.smart ? 1 : 0 }))
    return json({ MediaContainer: { totalSize: rows.length, size: rows.length, Metadata: rows } })
  }
  if (method === "GET" && (m = path.match(/^\/library\/collections\/(\d+)\/items$/))) {
    const members = plex.items.get(m[1])?.members ?? []
    return json({ MediaContainer: { totalSize: members.length, size: members.length, Metadata: members.map((key) => ({ ratingKey: key, type: "movie" })) } })
  }
  if (method === "PUT" && (m = path.match(/^\/library\/collections\/(\d+)\/items$/))) {
    const uri = q.get("uri") ?? ""
    const prefix = `server://${MACHINE}/com.plexapp.plugins.library/library/metadata/`
    if (!uri.startsWith(prefix)) return text(400)
    const item = plex.items.get(m[1])!
    for (const key of uri.slice(prefix.length).split(",")) if (!item.members.includes(key)) item.members.push(key)
    return text(200)
  }
  if ((method === "DELETE" || method === "PUT") && (m = path.match(/^\/library\/collections\/(\d+)\/items\/(\d+)$/))) {
    if (method === "DELETE" && plex.removeAnswers405) return text(405)
    const item = plex.items.get(m[1])!
    item.members = item.members.filter((key) => key !== m![2])
    return text(200)
  }
  if (method === "PUT" && (m = path.match(/^\/library\/collections\/(\d+)\/items\/(\d+)\/move$/))) {
    const item = plex.items.get(m[1])!
    const list = item.members.filter((key) => key !== m![2])
    const after = q.get("after")
    list.splice(after === null ? 0 : list.indexOf(after) + 1, 0, m[2])
    item.members = list
    return text(200)
  }
  if (method === "GET" && (m = path.match(/^\/hubs\/sections\/(\d+)\/manage$/))) {
    const hub = plex.hubs.get(q.get("metadataItemId") ?? "")
    const builtIn = { identifier: "movie.recentlyadded", promotedToRecommended: 1, promotedToOwnHome: 1, promotedToSharedHome: 1 }
    const own = hub ? [{ identifier: hub.identifier, promotedToRecommended: flag(hub.recommended), promotedToOwnHome: flag(hub.ownHome),
      promotedToSharedHome: flag(hub.sharedHome) }] : []
    return json({ MediaContainer: { size: own.length + 1, Hub: [builtIn, ...own] } })
  }
  const flags = () => ({ recommended: q.get("promotedToRecommended") === "1", ownHome: q.get("promotedToOwnHome") === "1",
    sharedHome: q.get("promotedToSharedHome") === "1" })
  if (method === "POST" && (m = path.match(/^\/hubs\/sections\/(\d+)\/manage$/))) {
    const rk = q.get("metadataItemId") ?? ""
    plex.hubs.set(rk, { identifier: `custom.collection.${m[1]}.${rk}`, sectionId: m[1], ...flags() })
    return text(200)
  }
  if (method === "PUT" && (m = path.match(/^\/hubs\/sections\/(\d+)\/manage\/([\w.-]+)$/))) {
    const hub = [...plex.hubs.values()].find((h) => h.identifier === m![2])
    if (!hub) return text(404)
    Object.assign(hub, flags())
    return text(200)
  }
  return text(404)
}

/* ------------------------------------------------------- fake database */

interface ItemRow { itemKey: string; level: string; sectionId: string; ratingKey: string; leaveOn: string | null; sizeBytes: bigint; state: string }

let settings: CleanupSettings
let items: ItemRow[]
let outcomes: { ratingKey: string }[]

type Where = Record<string, unknown>
function matches(row: object, where: Where): boolean {
  return Object.entries(where).every(([field, want]) => {
    if (field === "OR") return (want as Where[]).some((part) => matches(row, part))
    const value: unknown = Reflect.get(row, field)
    if (want === null) return value === null
    if (want instanceof Date) return value instanceof Date && value.getTime() === want.getTime()
    if (typeof want === "object" && want !== null && "lt" in want) return value instanceof Date && value < (want as { lt: Date }).lt
    if (typeof want === "object" && want !== null && "in" in want) return (want as { in: unknown[] }).in.includes(value)
    return value === want
  })
}

function installDatabase(): void {
  prismaMock.cleanupSettings.findUnique.mockImplementation((async () => ({ ...settings })) as never)
  prismaMock.cleanupSettings.upsert.mockImplementation((async ({ update }: { update: Partial<CleanupSettings> }) =>
    Object.assign(settings, update)) as never)
  prismaMock.cleanupSettings.updateMany.mockImplementation((async ({ where, data }: { where: Where; data: Partial<CleanupSettings> }) => {
    if (!matches(settings, where)) return { count: 0 }
    Object.assign(settings, data)
    return { count: 1 }
  }) as never)
  prismaMock.cleanupSettings.update.mockImplementation((async ({ data }: { data: Partial<CleanupSettings> }) => Object.assign(settings, data)) as never)
  prismaMock.cleanupItem.findMany.mockImplementation((async ({ where }: { where: Where }) =>
    items.filter((item) => matches(item, where))) as never)
  prismaMock.cleanupOutcome.findMany.mockImplementation((async ({ where }: { where: Where }) =>
    outcomes.filter((outcome) => matches(outcome, where))) as never)
}

const runtime = (): CleanupRuntime => parseRuntime(settings.runtime)

function storeRuntime(value: Partial<CleanupRuntime>): void {
  settings.runtime = { collections: {}, notices: [], ...value } as never
}

const stored = (ratingKey: string, overrides: Partial<CleanupRuntime["collections"][string]> = {}) => ({
  ratingKey, title: MOVIES, createdAt: "2026-11-01T00:00:00.000Z", lastSyncAt: "2026-11-08T11:41:00.000Z", count: 0,
  hub: { ownHome: true, sharedHome: true, recommended: false }, ...overrides,
})

let nextItem = 1
function leaving(ratingKey: string, overrides: Partial<ItemRow> = {}): ItemRow {
  const row: ItemRow = { itemKey: `movie:tmdb:${nextItem++}`, level: "movie", sectionId: "1", ratingKey, leaveOn: "2026-12-01", sizeBytes: BigInt(1),
    state: "leaving", ...overrides }
  items.push(row)
  return row
}

const server = buildPlexServer({ url: BASE, token: "plex-token", machineIdentifier: MACHINE, adminPlexUserId: "1" })
const warned = (message: string) => mockWarn.mock.calls.filter(([text]) => text === message).map(([, meta]) => meta)
const sent = (pattern: RegExp) => plex.requests.filter((request) => pattern.test(request))

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.useFakeTimers({ now: NOW })
  plex.items.clear()
  plex.hubs.clear()
  plex.next = 90001
  plex.requests = []
  plex.faults = []
  plex.removeAnswers405 = false
  plex.onCreate = null
  plex.metaOverrides.clear()
  nextItem = 1
  items = []
  outcomes = []
  settings = { id: "cleanup", enabled: true, enabledAt: null, pausedAt: null, pausedBy: null, holdUntil: null, runClaimAt: null, readClaimAt: null,
    collectionsClaimAt: null, collectionsDirtyAt: null, options: {}, runtime: {}, updatedAt: NOW, updatedBy: null }
  installDatabase()
  jest.mocked(getActiveService).mockResolvedValue(server)
  mockEnqueue.mockResolvedValue({ ok: true, jobId: "job-1" })
  jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method ?? "GET"
    plex.requests.push(`${method} ${url.pathname}${url.search}`)
    if (method === "DELETE") everyDelete.push(url.pathname)
    const fault = plex.faults.find((f) => f.method === method && f.path.test(url.pathname) && f.times > 0)
    if (fault && (fault.skip ?? 0) > 0) fault.skip = (fault.skip ?? 0) - 1
    else if (fault) {
      fault.times--
      return text(fault.status)
    }
    return route(method, url)
  })
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

afterAll(() => {
  // TS 8.10: every DELETE that the sync sends goes to a /library/collections/ path.
  expect(everyDelete.length).toBeGreaterThan(0)
  expect(everyDelete.every((path) => path.startsWith("/library/collections/"))).toBe(true)
})

/* ---------------------------------------------------------------- tests */

describe("create", () => {
  it("makes the collection with its summary, custom order, members in order and hub, and stores it", async () => {
    leaving("201", { leaveOn: "2026-12-03" })
    leaving("202", { leaveOn: "2026-12-01", sizeBytes: BigInt(5) })
    leaving("203", { leaveOn: "2026-12-01", sizeBytes: BigInt(9) })

    const result = await syncCollections()

    expect(result).toEqual({ collections: 1, added: 3, removed: 0, moved: 0, recreated: 0, deleted: 0, busy: false, rounds: 1 })
    const made = plex.items.get("90001")!
    expect(made).toMatchObject({ title: MOVIES, sectionId: "1", members: ["203", "202", "201"], sort: "2",
      summary: "These titles leave Example Plex soon, the soonest first. To keep one, open https://members.example.com/leaving-soon" })
    expect(sent(/^POST \/library\/collections\?/)).toEqual([`POST /library/collections?type=1&title=${encodeURIComponent(MOVIES)}&smart=0&sectionId=1`])
    expect(plex.hubs.get("90001")).toEqual({ identifier: "custom.collection.1.90001", sectionId: "1", recommended: false, ownHome: true, sharedHome: true })
    expect(runtime().collections["1:movie"]).toEqual({ ratingKey: "90001", title: MOVIES, createdAt: NOW.toISOString(), lastSyncAt: NOW.toISOString(),
      count: 3, hub: { ownHome: true, sharedHome: true, recommended: false } })
    expect(runtime().lastSync).toEqual({ at: NOW.toISOString(), ok: true })
    expect(settings.collectionsClaimAt).toBeNull()
  })

  it("adds in batches of 50", async () => {
    for (let n = 0; n < 120; n++) leaving(String(1000 + n), { sizeBytes: BigInt(1000 - n) })

    await syncCollections()

    expect(sent(/^PUT \/library\/collections\/90001\/items\?/)).toHaveLength(3)
    expect(plex.items.get("90001")!.members).toHaveLength(120)
  })

  it("makes one collection per section and level, with the level's type and title", async () => {
    leaving("301", { level: "show", sectionId: "2", itemKey: "show:tvdb:1" })
    leaving("302", { level: "season", sectionId: "2", itemKey: "season:tvdb:1:1" })

    await syncCollections()

    expect(sent(/^POST \/library\/collections\?/)).toEqual([
      `POST /library/collections?type=3&title=${encodeURIComponent(COLLECTION_TITLES.season)}&smart=0&sectionId=2`,
      `POST /library/collections?type=2&title=${encodeURIComponent(COLLECTION_TITLES.show)}&smart=0&sectionId=2`,
    ])
    expect(Object.keys(runtime().collections).sort()).toEqual(["2:season", "2:show"])
  })

  it("keeps the old summary when the app URL is not set", async () => {
    jest.mocked(getBaseUrl).mockImplementationOnce(() => {
      throw new Error("not set")
    })
    leaving("201")

    await syncCollections()

    expect(sent(/^PUT \/library\/sections\//)).toEqual([])
    expect(plex.items.get("90001")!.sort).toBe("2")
    expect(warned("cleanup.collection_summary_unavailable")).toEqual([{ error: "Error" }])
  })

  it.each([
    ["summary", /^\/library\/sections\/1\/all$/],
    ["custom order", /^\/library\/metadata\/90001\/prefs$/],
  ])("records a failed %s and still fills the new collection", async (_name, path) => {
    leaving("201")
    plex.faults.push({ method: "PUT", path, status: 400, times: 1 })

    await syncCollections()

    expect(plex.items.get("90001")!.members).toEqual(["201"])
    expect(runtime().collections["1:movie"]).toMatchObject({ ratingKey: "90001", count: 1 })
    expect(runtime().lastSync).toMatchObject({ ok: false, errorCode: "HTTP" })
  })

  it("records a failed create and stores nothing", async () => {
    leaving("201")
    plex.faults.push({ method: "POST", path: /^\/library\/collections$/, status: 500, times: 1 })

    await syncCollections()

    expect(runtime().collections).toEqual({})
    expect(runtime().lastSync).toEqual({ at: NOW.toISOString(), ok: false, errorCode: "HTTP" })
  })
})

describe("adopt", () => {
  it("adopts an empty collection with the title instead of making one", async () => {
    addCollection({ ratingKey: "500" })
    leaving("201")

    await syncCollections()

    expect(sent(/^POST \/library\/collections\?/)).toEqual([])
    expect(plex.items.get("500")).toMatchObject({ members: ["201"], sort: "2" })
    expect(runtime().collections["1:movie"]).toMatchObject({ ratingKey: "500", count: 1 })
  })

  it("adopts a collection that holds only titles of cleanup items or outcomes", async () => {
    addCollection({ ratingKey: "500", members: ["201", "777"] })
    outcomes.push({ ratingKey: "777" })
    leaving("201")

    const result = await syncCollections()

    expect(plex.items.get("500")!.members).toEqual(["201"])
    expect(result).toMatchObject({ removed: 1, added: 0 })
  })

  it("never adopts a collection with other members, a smart one, or one with another title", async () => {
    addCollection({ ratingKey: "500", members: ["888"] })
    addCollection({ ratingKey: "501", smart: true })
    addCollection({ ratingKey: "502", title: "Movies leaving" })
    leaving("201")

    await syncCollections()

    expect(plex.items.get("500")!.members).toEqual(["888"])
    expect(plex.items.get("501")!.members).toEqual([])
    expect(runtime().collections["1:movie"]).toMatchObject({ ratingKey: "90001" })
    expect(warned("cleanup.collection_title_taken")).toEqual([{ key: "1:movie", ratingKey: "500" }])
  })

  it("adopts the lowest of two adoptable collections and deletes the other through the guard", async () => {
    addCollection({ ratingKey: "1200" })
    addCollection({ ratingKey: "950", members: ["201"] })
    leaving("201")

    const result = await syncCollections()

    expect(runtime().collections["1:movie"]).toMatchObject({ ratingKey: "950" })
    expect(plex.items.has("1200")).toBe(false)
    expect(sent(/^(GET \/library\/metadata\/1200|DELETE \/library\/collections\/1200)$/)).toEqual(["GET /library/metadata/1200", "DELETE /library/collections/1200"])
    expect(result.deleted).toBe(1)
  })

  it("keeps an extra adoptable collection whose metadata fails the guard, and records the refused delete", async () => {
    addCollection({ ratingKey: "950" })
    addCollection({ ratingKey: "1200" })
    plex.metaOverrides.set("1200", { smart: true })
    leaving("201")

    const result = await syncCollections()

    expect(sent(/^DELETE \/library\/collections\/1200$/)).toEqual([])
    expect(plex.items.has("1200")).toBe(true)
    expect(result.deleted).toBe(0)
    expect(runtime().lastSync).toMatchObject({ ok: false, errorCode: "GUARD" })
    expect(warned("cleanup.collection_guard")).toEqual([{ key: "1:movie", ratingKey: "1200", reason: "smart" }])
  })

  it("records a failed delete of an extra adoptable collection and goes on", async () => {
    addCollection({ ratingKey: "950" })
    addCollection({ ratingKey: "1200" })
    plex.faults.push({ method: "GET", path: /^\/library\/metadata\/1200$/, status: 401, times: 1 })
    leaving("201")

    await syncCollections()

    expect(plex.items.has("1200")).toBe(true)
    expect(plex.items.get("950")!.members).toEqual(["201"])
    expect(runtime().lastSync).toMatchObject({ ok: false, errorCode: "HTTP" })
  })

  it("stops this collection when the members of a candidate cannot be read", async () => {
    addCollection({ ratingKey: "500" })
    leaving("201")
    plex.faults.push({ method: "GET", path: /^\/library\/collections\/500\/items$/, status: 403, times: 1 })

    await syncCollections()

    expect(sent(/^POST \/library\/collections\?/)).toEqual([])
    expect(runtime().collections).toEqual({})
    expect(runtime().lastSync).toMatchObject({ ok: false, errorCode: "HTTP" })
  })

  it("stops this collection when the section's collections cannot be listed", async () => {
    leaving("201")
    plex.faults.push({ method: "GET", path: /^\/library\/sections\/1\/all$/, status: 403, times: 1 })

    await syncCollections()

    expect(sent(/^POST \/library\/collections\?/)).toEqual([])
    expect(runtime().lastSync).toMatchObject({ ok: false })
  })
})

describe("members and order", () => {
  it("removes titles that left, adds new ones, and keeps the rest", async () => {
    addCollection({ ratingKey: "500", members: ["201", "999"] })
    storeRuntime({ collections: { "1:movie": stored("500", { count: 2 }) } })
    leaving("201", { sizeBytes: BigInt(9) })
    leaving("202", { sizeBytes: BigInt(1) })

    const result = await syncCollections()

    expect(plex.items.get("500")!.members).toEqual(["201", "202"])
    expect(result).toMatchObject({ added: 1, removed: 1, moved: 0 })
    expect(sent(/^DELETE \/library\/collections\/500\/items\/999$/)).toHaveLength(1)
    expect(runtime().collections["1:movie"]).toMatchObject({ ratingKey: "500", count: 2, createdAt: "2026-11-01T00:00:00.000Z" })
  })

  it("moves only the item that is out of order", async () => {
    addCollection({ ratingKey: "500", members: ["203", "201", "202"] })
    storeRuntime({ collections: { "1:movie": stored("500") } })
    leaving("201", { leaveOn: "2026-12-01" })
    leaving("202", { leaveOn: "2026-12-02" })
    leaving("203", { leaveOn: "2026-12-03" })

    const result = await syncCollections()

    expect(sent(/\/move/)).toEqual(["PUT /library/collections/500/items/203/move?after=202"])
    expect(plex.items.get("500")!.members).toEqual(["201", "202", "203"])
    expect(result.moved).toBe(1)
  })

  it("moves a new first item to the front with no after", async () => {
    addCollection({ ratingKey: "500", members: ["202", "203"] })
    storeRuntime({ collections: { "1:movie": stored("500") } })
    leaving("201", { leaveOn: "2026-11-30" })
    leaving("202", { leaveOn: "2026-12-02" })
    leaving("203", { leaveOn: "2026-12-03" })

    await syncCollections()

    expect(sent(/\/move/)).toEqual(["PUT /library/collections/500/items/201/move"])
    expect(plex.items.get("500")!.members).toEqual(["201", "202", "203"])
  })

  it("sends PUT once when DELETE of a member answers 405", async () => {
    plex.removeAnswers405 = true
    addCollection({ ratingKey: "500", members: ["201", "999"] })
    storeRuntime({ collections: { "1:movie": stored("500") } })
    leaving("201")

    await syncCollections()

    expect(sent(/\/items\/999$/)).toEqual(["DELETE /library/collections/500/items/999", "PUT /library/collections/500/items/999"])
    expect(plex.items.get("500")!.members).toEqual(["201"])
  })

  it.each([
    ["a member read", "GET", /^\/library\/collections\/500\/items$/, 0],
    ["a removal", "PUT", /^\/library\/collections\/500\/items\/999$/, 2],
    ["an add", "PUT", /^\/library\/collections\/500\/items$/, 1],
    ["a move", "PUT", /\/move$/, 2],
  ])("stops the collection on a failed %s, keeps what it knows and skips the hub", async (_name, method, path, count) => {
    plex.removeAnswers405 = true
    addCollection({ ratingKey: "500", members: ["202", "999"] })
    storeRuntime({ collections: { "1:movie": stored("500") } })
    leaving("201", { leaveOn: "2026-11-30" })
    leaving("202")
    plex.faults.push({ method, path, status: 403, times: 1 })

    await syncCollections()

    expect(runtime().collections["1:movie"]).toMatchObject({ ratingKey: "500", count })
    expect(runtime().lastSync).toMatchObject({ ok: false, errorCode: "HTTP" })
    expect(sent(/^GET \/hubs\//)).toEqual([])
  })

  it("counts the members it knows when the read after an add fails", async () => {
    addCollection({ ratingKey: "500" })
    storeRuntime({ collections: { "1:movie": stored("500") } })
    leaving("201")
    plex.faults.push({ method: "GET", path: /^\/library\/collections\/500\/items$/, status: 403, times: 1, skip: 1 })

    await syncCollections()

    expect(plex.items.get("500")!.members).toEqual(["201"])
    expect(runtime().collections["1:movie"]).toMatchObject({ count: 1 })
    expect(runtime().lastSync).toMatchObject({ ok: false, errorCode: "HTTP" })
  })

  it("never adds without a machine identifier", async () => {
    jest.mocked(getActiveService).mockResolvedValue({ ...server, machineIdentifier: null })
    addCollection({ ratingKey: "500" })
    storeRuntime({ collections: { "1:movie": stored("500") } })
    leaving("201")

    await syncCollections()

    expect(sent(/^PUT \/library\/collections\/500\/items\?/)).toEqual([])
    expect(runtime().lastSync).toMatchObject({ ok: false, errorCode: "NO_MACHINE_ID" })
  })
})

describe("hub", () => {
  beforeEach(() => {
    addCollection({ ratingKey: "500", members: ["201"] })
    leaving("201")
    storeRuntime({ collections: { "1:movie": stored("500") } })
  })

  it("updates a hub with other flags, with the identifier from the GET", async () => {
    plex.hubs.set("500", { identifier: "custom.collection.1.500", sectionId: "1", recommended: true, ownHome: false, sharedHome: true })

    await syncCollections()

    expect(sent(/^PUT \/hubs\//)).toEqual(["PUT /hubs/sections/1/manage/custom.collection.1.500?promotedToRecommended=0&promotedToOwnHome=1&promotedToSharedHome=1"])
    expect(plex.hubs.get("500")).toMatchObject({ recommended: false, ownHome: true, sharedHome: true })
  })

  it("leaves an equal hub alone", async () => {
    plex.hubs.set("500", { identifier: "custom.collection.1.500", sectionId: "1", recommended: false, ownHome: true, sharedHome: true })

    await syncCollections()

    expect(sent(/^(PUT|POST) \/hubs\//)).toEqual([])
  })

  it("sends three zeros when every wanted flag is off, and makes no hub when none exists", async () => {
    settings.options = { plex: { showCollections: true, ownHome: false, sharedHome: false, recommended: false } }
    plex.hubs.set("500", { identifier: "custom.collection.1.500", sectionId: "1", recommended: false, ownHome: true, sharedHome: true })

    await syncCollections()

    expect(sent(/^PUT \/hubs\//)).toEqual(["PUT /hubs/sections/1/manage/custom.collection.1.500?promotedToRecommended=0&promotedToOwnHome=0&promotedToSharedHome=0"])
    expect(runtime().collections["1:movie"].hub).toEqual({ ownHome: false, sharedHome: false, recommended: false })

    plex.hubs.clear()
    plex.requests = []
    await syncCollections()
    expect(sent(/^(PUT|POST) \/hubs\//)).toEqual([])
  })

  it.each([
    ["GET", /^\/hubs\/sections\/1\/manage$/, null],
    ["POST", /^\/hubs\/sections\/1\/manage$/, null],
    ["PUT", /^\/hubs\/sections\/1\/manage\//, { recommended: true, ownHome: false, sharedHome: false }],
  ])("keeps the collection with errorCode HUB when the hub %s fails", async (method, path, existing) => {
    if (existing) plex.hubs.set("500", { identifier: "custom.collection.1.500", sectionId: "1", ...existing })
    plex.faults.push({ method, path, status: 500, times: 9 })

    await syncCollections()

    expect(runtime().collections["1:movie"]).toMatchObject({ ratingKey: "500", count: 1 })
    expect(runtime().lastSync).toEqual({ at: NOW.toISOString(), ok: false, errorCode: "HUB" })
    if (method === "GET") expect(runtime().collections["1:movie"].hub).toEqual(stored("500").hub)
    if (method === "POST") expect(runtime().collections["1:movie"].hub).toEqual({ ownHome: false, sharedHome: false, recommended: false })
    if (method === "PUT") expect(runtime().collections["1:movie"].hub).toEqual(existing)
  })
})

describe("delete on empty", () => {
  it("deletes a stored collection once nothing of its section and level is leaving", async () => {
    addCollection({ ratingKey: "500", members: ["201"] })
    storeRuntime({ collections: { "1:movie": stored("500") } })

    const result = await syncCollections()

    expect(sent(/^(GET \/library\/metadata|DELETE)/)).toEqual(["GET /library/metadata/500", "DELETE /library/collections/500"])
    expect(plex.items.has("500")).toBe(false)
    expect(runtime().collections).toEqual({})
    expect(result).toMatchObject({ deleted: 1, collections: 0 })
  })

  it.each([
    ["the feature is off", { enabled: false }],
    ["cleanup is paused", { pausedAt: NOW }],
    ["the collections are hidden", { options: { plex: { showCollections: false } } }],
  ])("empties every collection while %s", async (_name, change) => {
    addCollection({ ratingKey: "500", members: ["201"] })
    addCollection({ ratingKey: "600", title: COLLECTION_TITLES.season, sectionId: "2", members: ["301"] })
    storeRuntime({ collections: { "1:movie": stored("500"), "2:season": stored("600", { title: COLLECTION_TITLES.season }) } })
    Object.assign(settings, change)
    leaving("201")

    await syncCollections()

    expect(plex.items.size).toBe(0)
    expect(runtime().collections).toEqual({})
    expect(prismaMock.cleanupItem.findMany).not.toHaveBeenCalled()
  })

  it("counts a 404 as done", async () => {
    storeRuntime({ collections: { "1:movie": stored("500") } })

    const result = await syncCollections()

    expect(runtime().collections).toEqual({})
    expect(result.deleted).toBe(0)
    expect(runtime().lastSync).toMatchObject({ ok: true })
  })

  it("refuses a stored key whose metadata is now a movie: no DELETE, the key is forgotten", async () => {
    plex.items.set("500", { ratingKey: "500", type: "movie", title: "An Invented Film", sectionId: "1", members: [] })
    storeRuntime({ collections: { "1:movie": stored("500") } })

    await syncCollections()

    expect(sent(/^DELETE/)).toEqual([])
    expect(plex.items.has("500")).toBe(true)
    expect(runtime().collections).toEqual({})
    expect(runtime().lastSync).toMatchObject({ ok: false, errorCode: "GUARD" })
    expect(warned("cleanup.collection_guard")).toEqual([{ key: "1:movie", ratingKey: "500", reason: "type" }])
  })

  it("keeps the stored key when the metadata read fails", async () => {
    storeRuntime({ collections: { "1:movie": stored("500") } })
    plex.faults.push({ method: "GET", path: /^\/library\/metadata\/500$/, status: 401, times: 1 })

    await syncCollections()

    expect(runtime().collections["1:movie"]).toMatchObject({ ratingKey: "500" })
    expect(runtime().lastSync).toMatchObject({ ok: false, errorCode: "HTTP" })
  })

  it("drops a runtime key that is not a section and a level", async () => {
    storeRuntime({ collections: { "nonsense": stored("500") } })

    await syncCollections()

    expect(runtime().collections).toEqual({})
    expect(warned("cleanup.collection_key_invalid")).toEqual([{ key: "nonsense" }])
  })
})

describe("a stored collection that went away", () => {
  it("adds a notice on a 404 and makes the collection again, marked as made again", async () => {
    storeRuntime({ collections: { "1:movie": stored("500") } })
    leaving("201")

    const result = await syncCollections()

    expect(runtime().notices).toEqual([{ kind: "collectionRemoved", key: "1:movie", title: MOVIES, sectionId: "1", detectedAt: NOW.toISOString(),
      recreatedAt: NOW.toISOString() }])
    expect(runtime().collections["1:movie"]).toMatchObject({ ratingKey: "90001", createdAt: NOW.toISOString() })
    expect(result.recreated).toBe(1)
  })

  it("forgets a stored key whose metadata is not this section's plain collection, with no notice and no DELETE", async () => {
    plex.items.set("500", { ratingKey: "500", type: "movie", title: "An Invented Film", sectionId: "1", members: [] })
    addCollection({ ratingKey: "700", sectionId: "3" })
    storeRuntime({ collections: { "1:movie": stored("500"), "1:show": stored("700", { title: COLLECTION_TITLES.show }) } })
    leaving("201")
    leaving("401", { level: "show", itemKey: "show:tvdb:4" })

    await syncCollections()

    expect(sent(/^DELETE/)).toEqual([])
    expect(runtime().notices).toEqual([])
    expect(runtime().collections["1:movie"]).toMatchObject({ ratingKey: "90001" })
    expect(runtime().collections["1:show"]).toMatchObject({ ratingKey: "90002" })
    expect(warned("cleanup.collection_guard").map((meta) => (meta as { reason: string }).reason)).toEqual(["type", "section"])
  })

  it("stops on a failed read of the stored collection and keeps it", async () => {
    addCollection({ ratingKey: "500" })
    storeRuntime({ collections: { "1:movie": stored("500") } })
    leaving("201")
    plex.faults.push({ method: "GET", path: /^\/library\/collections\/500$/, status: 401, times: 1 })

    await syncCollections()

    expect(runtime().collections["1:movie"]).toEqual(stored("500"))
    expect(sent(/^POST/)).toEqual([])
  })

  it("prunes notices older than 30 days", async () => {
    const old = { kind: "collectionRemoved" as const, key: "1:movie", title: MOVIES, sectionId: "1", detectedAt: "2026-10-01T00:00:00.000Z",
      recreatedAt: "2026-10-01T00:41:00.000Z" }
    const recent = { ...old, detectedAt: "2026-11-01T00:00:00.000Z" }
    storeRuntime({ notices: [old, recent] })

    await syncCollections()

    expect(runtime().notices).toEqual([recent])
  })
})

describe("claim and rounds", () => {
  it("makes one collection when two syncs run at the same time: the second finds the claim busy", async () => {
    leaving("201")

    const [first, second] = await Promise.all([syncCollections(), syncCollections()])

    expect([first.busy, second.busy].sort()).toEqual([false, true])
    expect(sent(/^POST \/library\/collections\?/)).toHaveLength(1)
    expect([...plex.items.values()].filter((item) => item.title === MOVIES)).toHaveLength(1)
    expect(settings.collectionsClaimAt).toBeNull()
  })

  it("sets the dirty flag and returns while another sync holds the claim", async () => {
    settings.collectionsClaimAt = new Date(NOW.getTime() - 60_000)

    const result = await syncCollections()

    expect(result).toMatchObject({ busy: true, rounds: 0 })
    expect(settings.collectionsDirtyAt).toEqual(NOW)
    expect(plex.requests).toEqual([])
  })

  it("runs a second round when requestCollectionSync() comes during a sync", async () => {
    leaving("201")
    plex.onCreate = () => {
      jest.setSystemTime(NOW.getTime() + 1000)
      leaving("202", { leaveOn: "2026-12-05" })
      void requestCollectionSync("test")
    }

    const result = await syncCollections()

    expect(result.rounds).toBe(2)
    expect(plex.items.get("90001")!.members).toEqual(["201", "202"])
    expect(mockEnqueue).toHaveBeenCalledWith("cleanup:collections", { reason: "change" }, { attempts: 1, removeOnComplete: true, removeOnFail: { age: 604800 } })
    expect(settings.collectionsDirtyAt).toBeNull()
  })

  it("clears the dirty flag it read, and runs one round when nothing new came", async () => {
    settings.collectionsDirtyAt = new Date(NOW.getTime() - 5000)
    leaving("201")

    const result = await syncCollections()

    expect(result.rounds).toBe(1)
    expect(settings.collectionsDirtyAt).toBeNull()
  })

  it(`stops after ${MAX_ROUNDS} rounds`, async () => {
    leaving("201")
    let tick = 0
    prismaMock.cleanupSettings.update.mockImplementation((async ({ data }: { data: Partial<CleanupSettings> }) => {
      Object.assign(settings, data)
      settings.collectionsDirtyAt = new Date(NOW.getTime() + ++tick * 1000)
      jest.setSystemTime(NOW.getTime() + tick * 1000 - 500)
      return settings
    }) as never)

    const result = await syncCollections()

    expect(result.rounds).toBe(MAX_ROUNDS)
  })

  it("stops between collections when the job is stopped, and still writes what it did", async () => {
    leaving("201")
    leaving("301", { level: "show", sectionId: "2", itemKey: "show:tvdb:3" })
    const stop = new AbortController()
    plex.onCreate = () => stop.abort()

    const result = await syncCollections({ signal: stop.signal })

    expect(result.rounds).toBe(1)
    expect(sent(/^POST \/library\/collections\?/)).toHaveLength(1)
    expect(runtime().lastSync).toMatchObject({ ok: false })
    expect(settings.collectionsClaimAt).toBeNull()
  })

  it("starts no round with a job that is already stopped", async () => {
    const stop = new AbortController()
    stop.abort()

    expect(await syncCollections({ signal: stop.signal })).toMatchObject({ busy: false, rounds: 0 })
    expect(plex.requests).toEqual([])
  })

  it("stores no change but the last sync without an active Plex server", async () => {
    jest.mocked(getActiveService).mockResolvedValue(null)
    storeRuntime({ collections: { "1:movie": stored("500") } })

    await syncCollections()

    expect(runtime().collections).toEqual({ "1:movie": stored("500") })
    expect(runtime().lastSync).toEqual({ at: NOW.toISOString(), ok: false, errorCode: "NO_PLEX_SERVER" })
    expect(plex.requests).toEqual([])
  })

  it("logs a failed release and still returns the counts", async () => {
    leaving("201")
    const updateMany = prismaMock.cleanupSettings.updateMany.getMockImplementation()!
    prismaMock.cleanupSettings.updateMany.mockImplementation(((args: { data: Partial<CleanupSettings> }) =>
      "collectionsClaimAt" in args.data && args.data.collectionsClaimAt === null ? Promise.reject(new Error("db")) : updateMany(args as never)) as never)

    const result = await syncCollections()

    expect(result).toMatchObject({ busy: false, added: 1 })
    expect(mockError).toHaveBeenCalledWith("cleanup.claim_release_failed", expect.any(Error), { column: "collectionsClaimAt" })
  })
})
