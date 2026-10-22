/**
 * @jest-environment node
 */

/**
 * The one `/api/users` parser (GAP-06), on the recorded plex.tv list in
 * fixtures/plex-tv/: shares keep their machine identifier, share id, owned
 * and pending flags; a managed user with `username=""` is named from
 * `title`; and getAllPlexServerUsers returns only this server's users.
 */

import { readFileSync } from "fs"
import path from "path"

import { getAllPlexServerUsers, getPlexUsers } from "@/lib/connections/plex-user-info"
import { fetchPlexTvUsers, parsePlexTvUsers, parseRetryAfter } from "@/lib/connections/plex-tv-users"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  sanitizeUrlForLogging: (url: string) => url,
}))

const FIXTURES = path.join(__dirname, "fixtures", "plex-tv")
const USERS_XML = readFileSync(path.join(FIXTURES, "users.xml"), "utf8")
const ERRORS = JSON.parse(readFileSync(path.join(FIXTURES, "users-errors.json"), "utf8")) as Record<
  "429" | "503",
  { status: number; contentType: string; headers: Record<string, string>; body: string }
>

const SERVER = { url: "https://plex.example.com:32400", token: "owner-token", machineIdentifier: "this-server-machine-id" }
const originalEnv = process.env

function respondWith(status: number, body: string, headers: Record<string, string> = {}) {
  return jest
    .spyOn(global, "fetch")
    .mockResolvedValue(new Response(body, { status, headers: { "Content-Type": "text/xml", ...headers } }))
}

beforeEach(() => {
  process.env = { ...originalEnv, PLEX_CLIENT_IDENTIFIER: "plex-manager-test" }
})

afterEach(() => {
  process.env = originalEnv
  jest.restoreAllMocks()
})

describe("parsePlexTvUsers", () => {
  it("reads every user with their shares", () => {
    const users = parsePlexTvUsers(USERS_XML)

    expect(users?.map((user) => user.id)).toEqual(["1001", "1002", "1003", "1004"])
    expect(users?.[0]).toEqual({
      id: "1001",
      username: "alice",
      title: "alice",
      email: "alice@example.com",
      thumb: "https://plex.tv/users/a1b2c3/avatar?c=1700000000",
      home: false,
      restricted: false,
      servers: [
        { machineIdentifier: "this-server-machine-id", shareId: "48211", owned: true, pending: false },
        { machineIdentifier: "other-server-machine-id", shareId: "48299", owned: true, pending: false },
      ],
    })
  })

  it("names a managed user with an empty username from title, with no email", () => {
    const kids = parsePlexTvUsers(USERS_XML)?.find((user) => user.id === "1002")

    expect(kids).toMatchObject({ username: "Kids", title: "Kids", home: true, restricted: true, servers: [] })
    expect(kids?.email).toBeUndefined()
  })

  it("labels a pending share", () => {
    const carol = parsePlexTvUsers(USERS_XML)?.find((user) => user.id === "1004")

    expect(carol?.servers).toEqual([
      { machineIdentifier: "this-server-machine-id", shareId: "48407", owned: true, pending: true },
    ])
  })

  it("reads an empty list as no users and a body that is not the list as null", () => {
    expect(parsePlexTvUsers('<MediaContainer friendlyName="myPlex" size="0"></MediaContainer>')).toEqual([])
    expect(parsePlexTvUsers("<errors><error>nope</error></errors>")).toBeNull()
  })
})

describe("fetchPlexTvUsers", () => {
  it("sends the owner token and client identifier as headers", async () => {
    const fetchSpy = respondWith(200, USERS_XML)

    await expect(fetchPlexTvUsers("owner-token")).resolves.toMatchObject({ ok: true })
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toBe("https://clients.plex.tv/api/users")
    expect(init?.headers).toMatchObject({ "X-Plex-Token": "owner-token", "X-Plex-Client-Identifier": "plex-manager-test" })
  })

  it("reads only a 401 as an invalid token", async () => {
    respondWith(401, "<errors/>")

    await expect(fetchPlexTvUsers("owner-token")).resolves.toEqual({ ok: false, kind: "invalid_token", status: 401 })
  })

  it("reads a 429 as unavailable, with its Retry-After", async () => {
    const recorded = ERRORS["429"]
    respondWith(recorded.status, recorded.body, { "Content-Type": recorded.contentType, ...recorded.headers })

    await expect(fetchPlexTvUsers("owner-token")).resolves.toEqual({
      ok: false,
      kind: "unavailable",
      reason: "rate_limited",
      status: 429,
      retryAfterSec: 30,
    })
  })

  it("reads a 503 as unavailable", async () => {
    const recorded = ERRORS["503"]
    respondWith(recorded.status, recorded.body, { "Content-Type": recorded.contentType })

    await expect(fetchPlexTvUsers("owner-token")).resolves.toEqual({
      ok: false,
      kind: "unavailable",
      reason: "http",
      status: 503,
    })
  })

  it("reads a body that does not parse as unavailable", async () => {
    respondWith(200, "<html>captive portal</html>")

    await expect(fetchPlexTvUsers("owner-token")).resolves.toEqual({ ok: false, kind: "unavailable", reason: "parse" })
  })

  it("reads a timeout as unavailable", async () => {
    const abort = new Error("aborted")
    abort.name = "AbortError"
    jest.spyOn(global, "fetch").mockRejectedValue(abort)

    await expect(fetchPlexTvUsers("owner-token")).resolves.toEqual({ ok: false, kind: "unavailable", reason: "timeout" })
  })
})

describe("parseRetryAfter", () => {
  it("reads seconds and an HTTP date", () => {
    expect(parseRetryAfter("30")).toBe(30)
    expect(parseRetryAfter("Thu, 01 Jan 2027 00:01:00 GMT", Date.parse("Thu, 01 Jan 2027 00:00:00 GMT"))).toBe(60)
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter("soon")).toBeUndefined()
  })
})

describe("getPlexUsers", () => {
  it("keeps every user and their shares, and reports a 429 as unavailable with its status", async () => {
    respondWith(200, USERS_XML)
    const ok = await getPlexUsers("owner-token")
    expect(ok.data).toHaveLength(4)

    jest.restoreAllMocks()
    respondWith(429, ERRORS["429"].body, ERRORS["429"].headers)
    await expect(getPlexUsers("owner-token")).resolves.toEqual({
      success: false,
      error: "Plex is temporarily unavailable",
      status: 429,
      retryAfterSec: 30,
    })
  })
})

describe("getAllPlexServerUsers", () => {
  it("returns only this server's users: members, pending invites labelled, and managed users", async () => {
    respondWith(200, USERS_XML)

    const result = await getAllPlexServerUsers(SERVER)

    expect(result).toEqual({
      success: true,
      data: [
        {
          id: "1001",
          name: "alice",
          email: "alice@example.com",
          thumb: "https://plex.tv/users/a1b2c3/avatar?c=1700000000",
          restricted: false,
          managed: false,
          pending: false,
        },
        {
          id: "1002",
          name: "Kids",
          thumb: "https://plex.tv/users/d4e5f6/avatar?c=1700000000",
          restricted: true,
          managed: true,
          pending: false,
        },
        {
          id: "1004",
          name: "carol",
          email: "carol@example.com",
          thumb: "https://plex.tv/users/j1k2l3/avatar?c=1700000000",
          restricted: false,
          managed: false,
          pending: true,
        },
      ],
    })
  })

  it("never returns a friend who shares only another server", async () => {
    respondWith(200, USERS_XML)

    const result = await getAllPlexServerUsers(SERVER)

    expect(result.data?.map((user) => user.id)).not.toContain("1003")
  })

  it("reads the machine identifier from the PMS when none is stored", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url === `${SERVER.url}/identity`) {
        return new Response('<MediaContainer size="0" machineIdentifier="other-server-machine-id"/>', { status: 200 })
      }
      return new Response(USERS_XML, { status: 200 })
    })

    const result = await getAllPlexServerUsers({ url: SERVER.url, token: SERVER.token })

    expect(fetchSpy).toHaveBeenCalledWith(`${SERVER.url}/identity`, expect.anything())
    expect(result.data?.map((user) => user.id)).toEqual(["1001", "1002", "1003"])
  })
})
