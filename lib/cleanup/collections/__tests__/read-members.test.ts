/**
 * @jest-environment node
 */

/**
 * The collection steps of a library read (TS 7.3 steps 5 and 6, 7.8): P7 for
 * every movie and show section, P8 for the G13 names and Kometa's seasonal
 * titles, and which titles count as read.
 */

jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }))
jest.mock("@/lib/connections/plex-library-read", () => ({ listPlexCollections: jest.fn(), listPlexCollectionItems: jest.fn() }))

import { readCollectionMembers } from "@/lib/cleanup/collections/read-members"
import type { PlexCollectionItemRow, PlexCollectionRow, PlexSection } from "@/lib/cleanup/schema/upstream"
import { listPlexCollectionItems, listPlexCollections } from "@/lib/connections/plex-library-read"

const config = { url: "https://plex.example.com:32400", token: "plex-token" }
const section = (key: string, type: string): PlexSection => ({ key, type, title: `Section ${key}`, Location: [] })
const SECTIONS = [section("1", "movie"), section("2", "show"), section("3", "artist")]
const row = (ratingKey: string, title: string): PlexCollectionRow => ({ ratingKey, title, childCount: 1, smart: 0 })

const byKey: Record<string, PlexCollectionRow[]> = {
  "1": [row("11", "Christmas Movies"), row("12", "Kids Movies"), row("13", "Random")],
  "2": [row("21", " kids movies ")],
}
const members: Record<string, PlexCollectionItemRow[]> = { "11": [{ ratingKey: "101" }], "12": [{ ratingKey: "102" }], "21": [{ ratingKey: "201" }] }

function recorder() {
  const calls: [string, unknown][] = []
  return {
    calls,
    builder: {
      addCollections: (sectionId: string, rows: readonly PlexCollectionRow[]) => calls.push([`collections:${sectionId}`, rows.map((r) => r.ratingKey)]),
      addCollectionMembers: (title: string, rows: readonly PlexCollectionItemRow[] | null) => calls.push([`members:${title}`, rows && rows.map((r) => r.ratingKey)]),
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(listPlexCollections).mockImplementation(async (_config, sectionId) => ({ ok: true, data: byKey[sectionId] ?? [] }))
  jest.mocked(listPlexCollectionItems).mockImplementation(async (_config, id) => ({ ok: true, data: members[id] ?? [] }))
})

it("lists every movie and show section, and reads members of G13 names and seasonal titles only", async () => {
  const { calls, builder } = recorder()

  const read = await readCollectionMembers(config, SECTIONS, ["Kids Movies", "Missing"], builder, {})

  expect(read).toEqual({ failedSections: 0, failedCollections: 0 })
  expect(jest.mocked(listPlexCollections).mock.calls.map(([, id]) => id)).toEqual(["1", "2"])
  expect(calls).toEqual([
    ["collections:1", ["11", "12", "13"]],
    ["collections:2", ["21"]],
    ["members:Christmas Movies", ["101"]],
    ["members:Kids Movies", ["102"]],
    ["members: kids movies ", ["201"]],
    ["members:Missing", []],
  ])
})

it("marks a title failed when its member read fails", async () => {
  jest.mocked(listPlexCollectionItems).mockImplementation(async (_config, id) =>
    id === "12" ? { ok: false, code: "HTTP", status: 500 } : { ok: true, data: members[id] ?? [] })
  const { calls, builder } = recorder()

  const read = await readCollectionMembers(config, SECTIONS, ["Kids Movies"], builder, {})

  expect(read.failedCollections).toBe(1)
  expect(calls).toContainEqual(["members:Kids Movies", null])
})

it("reads no G13 name as empty when a section listing failed, and fails every picked title", async () => {
  jest.mocked(listPlexCollections).mockImplementation(async (_config, id) => (id === "2" ? { ok: false, code: "TIMEOUT" } : { ok: true, data: byKey[id] }))
  const { calls, builder } = recorder()

  const read = await readCollectionMembers(config, SECTIONS, ["Kids Movies", "Missing"], builder, {})

  expect(read).toEqual({ failedSections: 1, failedCollections: 0 })
  expect(calls.filter(([name]) => name.startsWith("members:") && calls.find(([n, v]) => n === name && v === null))
    .map(([name]) => name)).toEqual(expect.arrayContaining(["members:Kids Movies", "members:Missing", "members:Christmas Movies"]))
  expect(calls).not.toContainEqual(["members:Missing", []])
})

it("stops between calls once the read is aborted", async () => {
  const stop = new AbortController()
  jest.mocked(listPlexCollections).mockImplementation(async (_config, id) => {
    stop.abort()
    return { ok: true, data: byKey[id] }
  })
  const { calls, builder } = recorder()

  const read = await readCollectionMembers(config, SECTIONS, [], builder, { signal: stop.signal })

  expect(read.failedSections).toBe(1)
  expect(jest.mocked(listPlexCollections)).toHaveBeenCalledTimes(1)
  expect(calls).toEqual([["collections:1", ["11", "12", "13"]]])
})

it("fails the member reads it skips after an abort", async () => {
  const stop = new AbortController()
  jest.mocked(listPlexCollectionItems).mockImplementation(async (_config, id) => {
    stop.abort()
    return { ok: true, data: members[id] ?? [] }
  })
  const { calls, builder } = recorder()

  const read = await readCollectionMembers(config, [section("1", "movie")], ["Kids Movies"], builder, { signal: stop.signal })

  expect(read.failedCollections).toBe(1)
  expect(calls).toContainEqual(["members:Kids Movies", null])
  expect(listPlexCollectionItems).toHaveBeenCalledTimes(1)
})
