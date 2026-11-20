/**
 * @jest-environment node
 */

/**
 * The Plex collection and hub calls of Media cleanup (TS 8.10 steps 3 and 4):
 * the exact request of each call, the guarded delete, the 405 fallback, and
 * the rule that every Plex `DELETE` goes to a `/library/collections/` path.
 */

import { readFileSync } from "node:fs"
import path from "node:path"

import {
  addPlexCollectionItems,
  collectionGuardFailure,
  createPlexCollection,
  createPlexCollectionHub,
  deletePlexCollectionGuarded,
  getPlexCollection,
  getPlexCollectionHub,
  movePlexCollectionItem,
  removePlexCollectionItem,
  setPlexCollectionCustomOrder,
  setPlexCollectionSummary,
  updatePlexCollectionHub,
} from "@/lib/connections/plex-collections"
import { refreshPlexPath } from "@/lib/connections/plex-scan"

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(path.join(__dirname, "..", "..", "cleanup", "__tests__", "fixtures", name), "utf8"))
const CREATED = fixture("plex-collection-created.json")
const HUB = fixture("plex-hub.json")

const config = { url: "https://plex.example.com:32400", token: "plex-token" }
const stored = { ratingKey: "90001", sectionId: "1", title: "Movies leaving soon" }
const collectionMeta = { ratingKey: "90001", type: "collection", title: "Movies leaving soon", librarySectionID: 1 }

interface Recorded {
  method: string
  url: URL
  headers: Record<string, string>
  body: string | undefined
  timeoutMs: number | undefined
}

/** Every request of this file, for the DELETE path scan at the end. */
const everyRequest: Recorded[] = []
let requests: Recorded[] = []
let timeouts: number[] = []
let timeoutNow = false
/** A fresh answer for each request: a body stream can be read or cancelled only once. */
type Reply = () => Response

function text(status: number, body = ""): Reply {
  return () => new Response(body, { status })
}

function json(body: unknown, status = 200): Reply {
  return () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function metadata(...items: object[]): Reply {
  return json({ MediaContainer: { size: items.length, Metadata: items } })
}

let answer: (request: Recorded) => Response = text(200)

/** Answer each call in turn; the last answer repeats. */
function answers(...list: Reply[]): void {
  let index = 0
  answer = () => list[Math.min(index++, list.length - 1)]()
}

beforeEach(() => {
  requests = []
  timeouts = []
  timeoutNow = false
  answer = text(200)
  jest.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
    timeouts.push(ms)
    return timeoutNow ? AbortSignal.abort(new DOMException("The operation timed out.", "TimeoutError")) : new AbortController().signal
  })
  jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request: Recorded = {
      method: init?.method ?? "GET",
      url: new URL(String(input)),
      headers: Object.fromEntries(new Headers(init?.headers)),
      body: typeof init?.body === "string" ? init.body : undefined,
      timeoutMs: timeouts.at(-1),
    }
    requests.push(request)
    everyRequest.push(request)
    if (init?.signal?.aborted) throw init.signal.reason
    return answer(request)
  })
})

afterEach(() => jest.restoreAllMocks())

const sent = () => requests.map(({ method, url }) => `${method} ${url.pathname}${url.search}`)

describe("getPlexCollection", () => {
  it("reads GET /library/collections/{ratingKey} as JSON with the token header and a 10 s budget", async () => {
    answers(metadata(collectionMeta))

    const result = await getPlexCollection(config, "90001")

    expect(result).toEqual({
      ok: true,
      data: { ratingKey: "90001", type: "collection", title: "Movies leaving soon", smart: false, sectionId: "1" },
    })
    expect(sent()).toEqual(["GET /library/collections/90001"])
    expect(requests[0].url.origin).toBe("https://plex.example.com:32400")
    expect(requests[0].headers).toMatchObject({ "x-plex-token": "plex-token", accept: "application/json" })
    expect(requests[0].timeoutMs).toBe(10_000)
  })

  it("gives null on a 404, the only answer that proves the collection is gone", async () => {
    answers(text(404))

    expect(await getPlexCollection(config, "90001")).toEqual({ ok: true, data: null })
  })

  it.each([401, 500])("passes HTTP %i on as a failure", async (status) => {
    answers(text(status))

    expect(await getPlexCollection(config, "90001")).toEqual({ ok: false, code: "HTTP", status })
  })

  it("treats a 200 with no metadata as an invalid answer, not as gone", async () => {
    answers(metadata())

    expect(await getPlexCollection(config, "90001")).toEqual({ ok: false, code: "INVALID_RESPONSE" })
  })

  it.each([
    [undefined, false],
    [false, false],
    [0, false],
    ["0", false],
    [true, true],
    [1, true],
    ["1", true],
  ])("reads smart %p as %p", async (smart, expected) => {
    answers(metadata({ ...collectionMeta, smart }))

    const result = await getPlexCollection(config, "90001")

    expect(result.ok && result.data?.smart).toBe(expected)
  })

  it("reads the section from the container when the item has none, else keeps it null", async () => {
    const bare = { ratingKey: 90001, type: "collection", title: "Movies leaving soon" }

    answers(json({ MediaContainer: { size: 1, librarySectionID: 1, Metadata: [bare] } }))
    expect(await getPlexCollection(config, "90001")).toEqual({ ok: true, data: expect.objectContaining({ ratingKey: "90001", sectionId: "1" }) })

    answers(json({ MediaContainer: { size: 1, librarySectionID: 1, Metadata: [{ ...bare, librarySectionID: 2 }] } }))
    expect(await getPlexCollection(config, "90001")).toEqual({ ok: true, data: expect.objectContaining({ sectionId: "2" }) })

    answers(metadata(bare))
    expect(await getPlexCollection(config, "90001")).toEqual({ ok: true, data: expect.objectContaining({ sectionId: null }) })
  })
})

describe("collectionGuardFailure", () => {
  const meta = { ratingKey: "90001", type: "collection", title: "Movies leaving soon", smart: false, sectionId: "1" }

  it.each([
    ["our collection", meta, null],
    ["another key", { ...meta, ratingKey: "90002" }, "key"],
    ["a movie", { ...meta, type: "movie" }, "type"],
    ["a smart collection", { ...meta, smart: true }, "smart"],
    ["another section", { ...meta, sectionId: "2" }, "section"],
    ["no section", { ...meta, sectionId: null }, "section"],
    ["another title", { ...meta, title: "Seasonal favourites" }, "title"],
  ])("gives %s: %p", (_label, candidate, expected) => {
    expect(collectionGuardFailure(candidate, stored)).toBe(expected)
  })

  it("skips the title check when no title is given (TS 8.10 step 4.1)", () => {
    const renamed = { ...meta, title: "Renamed by hand" }

    expect(collectionGuardFailure(renamed, { ratingKey: "90001", sectionId: "1" })).toBeNull()
  })
})

describe("deletePlexCollectionGuarded", () => {
  it("reads GET /library/metadata/{ratingKey}, then sends DELETE /library/collections/{ratingKey}", async () => {
    answers(metadata(collectionMeta), text(200))

    const result = await deletePlexCollectionGuarded(config, stored)

    expect(result).toEqual({ ok: true, data: { guarded: false, gone: false } })
    expect(sent()).toEqual(["GET /library/metadata/90001", "DELETE /library/collections/90001"])
    expect(requests.map(({ timeoutMs }) => timeoutMs)).toEqual([10_000, 15_000])
    expect(requests[1].headers).toMatchObject({ "x-plex-token": "plex-token" })
  })

  it("refuses a key whose metadata is a movie, and sends no DELETE", async () => {
    answers(metadata({ ratingKey: "90001", type: "movie", title: "Movies leaving soon", librarySectionID: 1 }))

    const result = await deletePlexCollectionGuarded(config, stored)

    expect(result).toEqual({ ok: true, data: { guarded: true, reason: "type" } })
    expect(sent()).toEqual(["GET /library/metadata/90001"])
  })

  it.each([
    ["a smart collection", { ...collectionMeta, smart: "1" }, "smart"],
    ["another section", { ...collectionMeta, librarySectionID: "2" }, "section"],
    ["another title", { ...collectionMeta, title: "Seasonal favourites" }, "title"],
    ["another item", { ...collectionMeta, ratingKey: "90002" }, "key"],
  ])("refuses %s and sends no DELETE", async (_label, item, reason) => {
    answers(metadata(item))

    expect(await deletePlexCollectionGuarded(config, stored)).toEqual({ ok: true, data: { guarded: true, reason } })
    expect(requests.filter(({ method }) => method === "DELETE")).toHaveLength(0)
  })

  it("counts a 404 on the metadata read as done, with no DELETE", async () => {
    answers(text(404))

    expect(await deletePlexCollectionGuarded(config, stored)).toEqual({ ok: true, data: { guarded: false, gone: true } })
    expect(sent()).toEqual(["GET /library/metadata/90001"])
  })

  it("counts a 404 on the DELETE as done", async () => {
    answers(metadata(collectionMeta), text(404))

    expect(await deletePlexCollectionGuarded(config, stored)).toEqual({ ok: true, data: { guarded: false, gone: true } })
  })

  it("sends no DELETE when the metadata read fails or comes back empty", async () => {
    answers(text(401))
    expect(await deletePlexCollectionGuarded(config, stored)).toEqual({ ok: false, code: "HTTP", status: 401 })

    answers(metadata())
    expect(await deletePlexCollectionGuarded(config, stored)).toEqual({ ok: false, code: "INVALID_RESPONSE" })
    expect(requests.filter(({ method }) => method === "DELETE")).toHaveLength(0)
  })

  it("passes a failed DELETE on, and never retries it with another method", async () => {
    answers(metadata(collectionMeta), text(405))

    expect(await deletePlexCollectionGuarded(config, stored)).toEqual({ ok: false, code: "HTTP", status: 405 })
    expect(sent()).toEqual(["GET /library/metadata/90001", "DELETE /library/collections/90001"])
  })

  it.each([
    { ...stored, ratingKey: "90001/../2" },
    { ...stored, ratingKey: "" },
    { ...stored, sectionId: "1?x=1" },
  ])("refuses a key that is not a number before any request: %p", async (bad) => {
    expect(await deletePlexCollectionGuarded(config, bad)).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(requests).toHaveLength(0)
  })
})

describe("createPlexCollection", () => {
  it("sends POST /library/collections with type, title, smart=0 and sectionId, and reads Metadata[0]", async () => {
    answers(json(CREATED))

    const result = await createPlexCollection(config, { sectionId: "1", level: "movie", title: "Movies leaving soon" })

    expect(result).toEqual({ ok: true, data: { ratingKey: "90001" } })
    expect(sent()).toEqual(["POST /library/collections?type=1&title=Movies%20leaving%20soon&smart=0&sectionId=1"])
    expect(requests[0].headers).toMatchObject({ "x-plex-token": "plex-token", accept: "application/json" })
    expect(requests[0].body).toBeUndefined()
    expect(requests[0].timeoutMs).toBe(15_000)
  })

  it.each([
    ["show", 2, "Shows leaving soon"],
    ["season", 3, "Seasons leaving soon"],
  ] as const)("uses type %s = %i", async (level, type, title) => {
    answers(json(CREATED))

    await createPlexCollection(config, { sectionId: "2", level, title })

    expect(requests[0].url.searchParams.get("type")).toBe(String(type))
    expect(requests[0].url.searchParams.get("title")).toBe(title)
  })

  it.each([
    ["no metadata", { MediaContainer: { size: 0 } }],
    ["a key that is not a number", { MediaContainer: { Metadata: [{ ratingKey: "abc" }] } }],
  ])("refuses an answer with %s", async (_label, body) => {
    answers(json(body))

    expect(await createPlexCollection(config, { sectionId: "1", level: "movie", title: "Movies leaving soon" })).toEqual({
      ok: false,
      code: "INVALID_RESPONSE",
    })
  })

  it("passes a 401 on, and refuses a bad section id before any request", async () => {
    answers(text(401))
    expect(await createPlexCollection(config, { sectionId: "1", level: "movie", title: "T" })).toEqual({ ok: false, code: "HTTP", status: 401 })

    expect(await createPlexCollection(config, { sectionId: "one", level: "movie", title: "T" })).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(requests).toHaveLength(1)
  })
})

describe("summary and order", () => {
  it("sets and locks the summary with PUT /library/sections/{id}/all?type=18", async () => {
    const summary = "These titles leave Example Server soon, the soonest first. To keep one, open https://app.example.com/leaving-soon"

    expect(await setPlexCollectionSummary(config, { sectionId: "1", ratingKey: "90001", summary })).toEqual({ ok: true, data: null })
    expect(sent()).toEqual([
      `PUT /library/sections/1/all?type=18&id=90001&summary.value=${encodeURIComponent(summary)}&summary.locked=1`,
    ])
    expect(requests[0].url.searchParams.get("summary.value")).toBe(summary)
    expect(requests[0].timeoutMs).toBe(15_000)
  })

  it("sets custom order with PUT /library/metadata/{ratingKey}/prefs?collectionSort=2", async () => {
    expect(await setPlexCollectionCustomOrder(config, "90001")).toEqual({ ok: true, data: null })
    expect(sent()).toEqual(["PUT /library/metadata/90001/prefs?collectionSort=2"])
  })

  it("refuses bad keys before any request", async () => {
    expect(await setPlexCollectionSummary(config, { sectionId: "1", ratingKey: "x", summary: "s" })).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(await setPlexCollectionCustomOrder(config, "-1")).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(requests).toHaveLength(0)
  })
})

describe("addPlexCollectionItems", () => {
  const withMachine = { ...config, machineIdentifier: "0123456789abcdef0123456789abcdef01234567" }
  const keys = Array.from({ length: 120 }, (_, index) => String(1000 + index))

  it("adds 50 keys per PUT with a URL-encoded server:// uri", async () => {
    expect(await addPlexCollectionItems(withMachine, "90001", keys)).toEqual({ ok: true, data: { added: 120 } })

    expect(requests.map(({ method, url }) => `${method} ${url.pathname}`)).toEqual(Array(3).fill("PUT /library/collections/90001/items"))
    const uris = requests.map(({ url }) => url.searchParams.get("uri"))
    const prefix = `server://${withMachine.machineIdentifier}/com.plexapp.plugins.library/library/metadata/`
    expect(uris).toEqual([
      prefix + keys.slice(0, 50).join(","),
      prefix + keys.slice(50, 100).join(","),
      prefix + keys.slice(100).join(","),
    ])
    expect(requests[0].url.search).toBe(`?uri=${encodeURIComponent(uris[0] ?? "")}`)
    expect(requests[0].url.search).toContain("server%3A%2F%2F")
    expect(requests[0].url.search).toContain("%2C")
    expect(requests.every(({ timeoutMs }) => timeoutMs === 15_000)).toBe(true)
  })

  it("sends nothing for an empty list", async () => {
    expect(await addPlexCollectionItems(withMachine, "90001", [])).toEqual({ ok: true, data: { added: 0 } })
    expect(requests).toHaveLength(0)
  })

  it("stops at the first failed batch", async () => {
    answers(text(200), text(500))

    expect(await addPlexCollectionItems(withMachine, "90001", keys)).toEqual({ ok: false, code: "HTTP", status: 500 })
    expect(requests).toHaveLength(2)
  })

  it.each([
    ["an item key", withMachine, ["1000", "10 01"]],
    ["the machine identifier", { ...withMachine, machineIdentifier: "abc/def" }, ["1000"]],
    ["an empty machine identifier", { ...withMachine, machineIdentifier: "" }, ["1000"]],
  ])("refuses a bad %s before any request", async (_label, target, itemKeys) => {
    expect(await addPlexCollectionItems(target, "90001", itemKeys)).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(requests).toHaveLength(0)
  })
})

describe("removePlexCollectionItem", () => {
  it("sends DELETE /library/collections/{ratingKey}/items/{itemKey}", async () => {
    expect(await removePlexCollectionItem(config, "90001", "1000")).toEqual({ ok: true, data: null })
    expect(sent()).toEqual(["DELETE /library/collections/90001/items/1000"])
    expect(requests[0].timeoutMs).toBe(15_000)
  })

  it("sends PUT exactly once when the DELETE answers 405", async () => {
    answers(text(405), text(200))

    expect(await removePlexCollectionItem(config, "90001", "1000")).toEqual({ ok: true, data: null })
    expect(sent()).toEqual(["DELETE /library/collections/90001/items/1000", "PUT /library/collections/90001/items/1000"])
  })

  it("stops after the one PUT when it answers 405 too", async () => {
    answers(text(405))

    expect(await removePlexCollectionItem(config, "90001", "1000")).toEqual({ ok: false, code: "HTTP", status: 405 })
    expect(requests).toHaveLength(2)
  })

  it.each([404, 401])("passes HTTP %i on with no fallback", async (status) => {
    answers(text(status))

    expect(await removePlexCollectionItem(config, "90001", "1000")).toEqual({ ok: false, code: "HTTP", status })
    expect(requests).toHaveLength(1)
  })

  it("refuses a bad item key before any request", async () => {
    expect(await removePlexCollectionItem(config, "90001", "1000,1001")).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(requests).toHaveLength(0)
  })
})

describe("movePlexCollectionItem", () => {
  it("moves after the previous item", async () => {
    expect(await movePlexCollectionItem(config, "90001", "1001", "1000")).toEqual({ ok: true, data: null })
    expect(sent()).toEqual(["PUT /library/collections/90001/items/1001/move?after=1000"])
  })

  it("moves to the front with no after", async () => {
    await movePlexCollectionItem(config, "90001", "1001", null)

    expect(sent()).toEqual(["PUT /library/collections/90001/items/1001/move"])
  })

  it("refuses a bad after key before any request", async () => {
    expect(await movePlexCollectionItem(config, "90001", "1001", "1000&x=1")).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(requests).toHaveLength(0)
  })
})

describe("hub calls", () => {
  it("reads the collection's hub with its identifier and three flags", async () => {
    answers(json(HUB))

    const result = await getPlexCollectionHub(config, "1", "90001")

    expect(result).toEqual({
      ok: true,
      data: { identifier: "custom.collection.1.90001", recommended: true, ownHome: true, sharedHome: false },
    })
    expect(sent()).toEqual(["GET /hubs/sections/1/manage?metadataItemId=90001"])
    expect(requests[0].headers).toMatchObject({ accept: "application/json" })
    expect(requests[0].timeoutMs).toBe(15_000)
  })

  it("gives null with no hub", async () => {
    answers(json({ MediaContainer: { size: 0 } }))

    expect(await getPlexCollectionHub(config, "1", "90001")).toEqual({ ok: true, data: null })
  })

  it("never takes a built-in hub for the collection's own", async () => {
    const builtIn = { identifier: "movie.recentlyadded", promotedToRecommended: true, promotedToOwnHome: true, promotedToSharedHome: true }
    const other = { identifier: "custom.collection.1.190001", promotedToOwnHome: 1 }
    const own = { identifier: "custom.collection.1.90001", promotedToRecommended: "0", promotedToOwnHome: 1, promotedToSharedHome: "1" }

    answers(json({ MediaContainer: { Hub: [builtIn, other] } }))
    expect(await getPlexCollectionHub(config, "1", "90001")).toEqual({ ok: true, data: null })

    answers(json({ MediaContainer: { Hub: [builtIn, other, own] } }))
    expect(await getPlexCollectionHub(config, "1", "90001")).toEqual({
      ok: true,
      data: { identifier: "custom.collection.1.90001", recommended: false, ownHome: true, sharedHome: true },
    })
  })

  it("passes a 404 on and refuses bad keys before any request", async () => {
    answers(text(404))
    expect(await getPlexCollectionHub(config, "1", "90001")).toEqual({ ok: false, code: "HTTP", status: 404 })

    expect(await getPlexCollectionHub(config, "1", "x")).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(requests).toHaveLength(1)
  })

  it("creates a hub with POST and the three flags", async () => {
    const flags = { recommended: true, ownHome: false, sharedHome: true }

    expect(await createPlexCollectionHub(config, "1", "90001", flags)).toEqual({ ok: true, data: null })
    expect(sent()).toEqual([
      "POST /hubs/sections/1/manage?metadataItemId=90001&promotedToRecommended=1&promotedToOwnHome=0&promotedToSharedHome=1",
    ])
    expect(requests[0].timeoutMs).toBe(15_000)
  })

  it("updates a hub by the identifier from the GET, with three zeros when every flag is off", async () => {
    const off = { recommended: false, ownHome: false, sharedHome: false }

    expect(await updatePlexCollectionHub(config, "1", "custom.collection.1.90001", off)).toEqual({ ok: true, data: null })
    expect(sent()).toEqual([
      "PUT /hubs/sections/1/manage/custom.collection.1.90001?promotedToRecommended=0&promotedToOwnHome=0&promotedToSharedHome=0",
    ])
  })

  it("refuses a bad section id or identifier before any request", async () => {
    const on = { recommended: true, ownHome: true, sharedHome: true }

    expect(await createPlexCollectionHub(config, "1/2", "90001", on)).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(await updatePlexCollectionHub(config, "1", "custom/../x", on)).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(await updatePlexCollectionHub(config, "x", "custom.collection.1.90001", on)).toEqual({ ok: false, code: "INVALID_KEY" })
    expect(requests).toHaveLength(0)
  })
})

const withMachine = { ...config, machineIdentifier: "0123456789abcdef0123456789abcdef01234567" }
const flags = { recommended: true, ownHome: true, sharedHome: false }

/** One call of every export of the two Plex write modules. */
const everyCall: [string, (signal?: AbortSignal) => Promise<{ ok: boolean }>][] = [
  ["getPlexCollection", (signal) => getPlexCollection(config, "90001", { signal })],
  ["deletePlexCollectionGuarded", (signal) => deletePlexCollectionGuarded(config, stored, { signal })],
  ["createPlexCollection", (signal) => createPlexCollection(config, { sectionId: "1", level: "movie", title: "T" }, { signal })],
  ["setPlexCollectionSummary", (signal) => setPlexCollectionSummary(config, { sectionId: "1", ratingKey: "90001", summary: "S" }, { signal })],
  ["setPlexCollectionCustomOrder", (signal) => setPlexCollectionCustomOrder(config, "90001", { signal })],
  ["addPlexCollectionItems", (signal) => addPlexCollectionItems(withMachine, "90001", ["1000"], { signal })],
  ["removePlexCollectionItem", (signal) => removePlexCollectionItem(config, "90001", "1000", { signal })],
  ["movePlexCollectionItem", (signal) => movePlexCollectionItem(config, "90001", "1001", "1000", { signal })],
  ["getPlexCollectionHub", (signal) => getPlexCollectionHub(config, "1", "90001", { signal })],
  ["createPlexCollectionHub", (signal) => createPlexCollectionHub(config, "1", "90001", flags, { signal })],
  ["updatePlexCollectionHub", (signal) => updatePlexCollectionHub(config, "1", "custom.collection.1.90001", flags, { signal })],
  ["refreshPlexPath", (signal) => refreshPlexPath(config, "1", "/data/movies/Example Movie (2001)", { signal })],
]

describe.each(everyCall)("%s", (_name, call) => {
  it("gives TIMEOUT when its budget runs out", async () => {
    timeoutNow = true

    expect(await call()).toEqual({ ok: false, code: "TIMEOUT" })
  })

  it("gives ABORTED when the job's signal aborts", async () => {
    const controller = new AbortController()
    controller.abort()

    expect(await call(controller.signal)).toEqual({ ok: false, code: "ABORTED" })
  })

  it("gives the 401 as a failure", async () => {
    answers(text(401))

    expect(await call()).toEqual({ ok: false, code: "HTTP", status: 401 })
  })
})

/** A Plex that answers every route with the same status, with plausible bodies on a 200. */
function plexAnswering(status: number): (request: Recorded) => Response {
  return ({ method, url }) => {
    if (status !== 200) return text(status)()
    if (method === "GET" && url.pathname.startsWith("/hubs/")) return json(HUB)()
    if (method === "GET") return metadata(collectionMeta)()
    if (method === "POST" && url.pathname === "/library/collections") return json(CREATED)()
    return text(200)()
  }
}

describe("the Plex request log", () => {
  it.each([200, 404, 405, 500])("sends every DELETE to a /library/collections/ path when Plex answers %i", async (status) => {
    answer = plexAnswering(status)

    for (const [, call] of everyCall) await call()

    const deletes = requests.filter(({ method }) => method === "DELETE").map(({ url }) => url.pathname)
    expect(deletes.length).toBeGreaterThan(0)
    expect(deletes.every((pathname) => pathname.startsWith("/library/collections/"))).toBe(true)
  })

  it("holds no DELETE outside /library/collections/ and no trash or media route across every test of this file", () => {
    expect(everyRequest.length).toBeGreaterThan(100)
    const deletes = everyRequest.filter(({ method }) => method === "DELETE").map(({ url }) => url.pathname)
    expect(deletes.length).toBeGreaterThan(10)
    for (const pathname of deletes) expect(pathname).toMatch(/^\/library\/collections\/\d+(\/items\/\d+)?$/)
    expect(everyRequest.filter(({ url }) => /emptyTrash/i.test(url.pathname))).toHaveLength(0)
  })

  it("names no retry helper, no trash route and no season pass in the module sources", () => {
    for (const file of ["plex-collections.ts", "plex-scan.ts"]) {
      const source = readFileSync(path.join(__dirname, "..", file), "utf8")
      expect(source).not.toMatch(/withRetry|emptyTrash|seasonpass/)
    }
  })
})
