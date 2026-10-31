/**
 * @jest-environment node
 */

/**
 * PMS reads page with the container headers rather than `?limit=` (GAP-10),
 * and `matchesSessionUser` matches the owner's own stream as PMS user 1
 * (GAP-08), on the recorded responses in fixtures/pms/.
 */

import { readFileSync } from "fs"
import path from "path"

import { getPlexOnDeck, getPlexRecentlyAdded, matchesSessionUser } from "@/lib/connections/plex-sessions"

const FIXTURES = path.join(__dirname, "fixtures", "pms")
const RECENTLY_ADDED = readFileSync(path.join(FIXTURES, "recently-added.json"), "utf8")
const SESSIONS = JSON.parse(readFileSync(path.join(FIXTURES, "sessions-owner.json"), "utf8")) as {
  MediaContainer: { Metadata: { title: string; User: { id: string } }[] }
}

const SERVER = { url: "https://plex.example.com:32400", token: "owner-token" }

let fetchSpy: jest.SpyInstance

beforeEach(() => {
  fetchSpy = jest
    .spyOn(global, "fetch")
    .mockImplementation(async () => new Response(RECENTLY_ADDED, { status: 200, headers: { "Content-Type": "application/json" } }))
})

afterEach(() => {
  jest.restoreAllMocks()
})

function lastRequest(): { url: string; headers: Record<string, string> } {
  const [url, init] = fetchSpy.mock.calls.at(-1) as [string, RequestInit]
  return { url: String(url), headers: init.headers as Record<string, string> }
}

describe("getPlexRecentlyAdded", () => {
  it("asks for `limit` items with the container headers, not ?limit=", async () => {
    const result = await getPlexRecentlyAdded(SERVER, 5)

    expect(result.success).toBe(true)
    expect(result.data.MediaContainer.Metadata).toHaveLength(2)
    const request = lastRequest()
    expect(request.url).toBe(`${SERVER.url}/library/recentlyAdded`)
    expect(request.headers).toMatchObject({
      "X-Plex-Token": "owner-token",
      "X-Plex-Container-Start": "0",
      "X-Plex-Container-Size": "5",
    })
  })

  it("starts a later page at its offset from the newest", async () => {
    await getPlexRecentlyAdded(SERVER, 20, 40)

    expect(lastRequest().headers).toMatchObject({ "X-Plex-Container-Start": "40", "X-Plex-Container-Size": "20" })
  })
})

describe("getPlexOnDeck", () => {
  it("reads the first page of 50", async () => {
    await getPlexOnDeck(SERVER)

    const request = lastRequest()
    expect(request.url).toBe(`${SERVER.url}/library/onDeck`)
    expect(request.headers).toMatchObject({ "X-Plex-Container-Start": "0", "X-Plex-Container-Size": "50" })
  })
})

describe("matchesSessionUser", () => {
  const [ownerSession, memberSession] = SESSIONS.MediaContainer.Metadata

  it("matches the owner's own stream, which the PMS reports as user 1", () => {
    expect(matchesSessionUser(ownerSession, { plexUserId: "1000", isOwner: true })).toBe(true)
  })

  it("never gives user 1's stream to a member who is not the owner", () => {
    expect(matchesSessionUser(ownerSession, { plexUserId: "1001", isOwner: false })).toBe(false)
  })

  it("matches everyone else by their plex.tv account id, as a string or a number", () => {
    expect(matchesSessionUser(memberSession, { plexUserId: "1001", isOwner: false })).toBe(true)
    expect(matchesSessionUser({ user_id: 1001 }, { plexUserId: "1001", isOwner: false })).toBe(true)
    expect(matchesSessionUser(memberSession, { plexUserId: "1000", isOwner: true })).toBe(false)
  })
})
