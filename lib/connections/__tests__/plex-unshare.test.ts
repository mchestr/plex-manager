/**
 * @jest-environment node
 */

/**
 * Tests for unshareUserFromPlexServer (GAP-04): it removes only this server's
 * share, found by machine identifier and share id, against recorded plex.tv
 * responses in fixtures/plex-tv/.
 */

import { readFileSync } from "fs"
import path from "path"

import { unshareUserFromPlexServer } from "@/lib/connections/plex-invitations"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  sanitizeUrlForLogging: (url: string) => url,
}))

const FIXTURES = path.join(__dirname, "fixtures", "plex-tv")
const USERS_XML = readFileSync(path.join(FIXTURES, "users.xml"), "utf8")
const DELETE_RESPONSES = JSON.parse(readFileSync(path.join(FIXTURES, "shared-server-delete.json"), "utf8")) as Record<
  "200" | "404" | "401" | "429",
  { status: number; contentType: string; body: string }
>

const SERVER = { url: "https://plex.example.com:32400", token: "owner-token" }
const IDENTITY_XML = '<MediaContainer size="0" machineIdentifier="this-server-machine-id" version="1.41.0"/>'

type Recorded = { url: string; method: string; headers: Record<string, string> }

let requests: Recorded[]
let deleteResponse: keyof typeof DELETE_RESPONSES
let usersResponse: { status: number; body: string }

function respond(status: number, body: string, contentType = "text/xml"): Response {
  return new Response(status === 204 || body === "" ? null : body, { status, headers: { "Content-Type": contentType } })
}

// replaceProperty needs the key to exist, and CI sets no PLEX_CLIENT_IDENTIFIER.
const originalEnv = process.env

beforeEach(() => {
  process.env = { ...originalEnv, PLEX_CLIENT_IDENTIFIER: "plex-manager-test" }
  requests = []
  deleteResponse = "200"
  usersResponse = { status: 200, body: USERS_XML }
  jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    requests.push({ url, method, headers: { ...(init?.headers as Record<string, string>) } })
    if (url === `${SERVER.url}/identity`) return respond(200, IDENTITY_XML)
    if (url === "https://clients.plex.tv/api/users") return respond(usersResponse.status, usersResponse.body)
    if (method === "DELETE") {
      const recorded = DELETE_RESPONSES[deleteResponse]
      return respond(recorded.status, recorded.body, recorded.contentType)
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  })
})

afterEach(() => {
  process.env = originalEnv
  jest.restoreAllMocks()
})

const deletes = () => requests.filter((request) => request.method === "DELETE")

describe("unshareUserFromPlexServer", () => {
  it("deletes only this server's share of a friend who has two servers", async () => {
    await expect(unshareUserFromPlexServer(SERVER, "1001")).resolves.toEqual({ success: true, status: "removed" })

    expect(deletes()).toHaveLength(1)
    expect(deletes()[0].url).toBe("https://plex.tv/api/servers/this-server-machine-id/shared_servers/48211")
    expect(deletes()[0].headers["X-Plex-Token"]).toBe("owner-token")
    // The other server's share id, and the friendship route, appear in no request.
    for (const request of requests) {
      expect(request.url).not.toContain("48299")
      expect(request.url).not.toContain("other-server-machine-id")
      expect(request.url).not.toContain("/friends")
      expect(request.url).not.toContain("/sharings")
    }
  })

  it("makes no DELETE when the user has no share of this server", async () => {
    await expect(unshareUserFromPlexServer(SERVER, "1003")).resolves.toEqual({
      success: true,
      status: "already_removed",
    })
    expect(deletes()).toHaveLength(0)
  })

  it("treats a managed home user, who has no share entry, as already removed", async () => {
    await expect(unshareUserFromPlexServer(SERVER, "1002")).resolves.toEqual({
      success: true,
      status: "already_removed",
    })
    expect(deletes()).toHaveLength(0)
  })

  it("makes no DELETE when the user is not in the owner's user list", async () => {
    await expect(unshareUserFromPlexServer(SERVER, "9999")).resolves.toEqual({
      success: true,
      status: "already_removed",
    })
    expect(deletes()).toHaveLength(0)
  })

  it("treats a 404 from plex.tv as already removed", async () => {
    deleteResponse = "404"
    await expect(unshareUserFromPlexServer(SERVER, "1001")).resolves.toEqual({
      success: true,
      status: "already_removed",
    })
  })

  it("returns PLEX_AUTH for a 401, with no Plex text", async () => {
    deleteResponse = "401"
    const result = await unshareUserFromPlexServer(SERVER, "1001")

    expect(result).toEqual({ success: false, code: "PLEX_AUTH" })
    expect(JSON.stringify(result)).not.toContain("owner@example.com")
  })

  it("returns PLEX_UNAVAILABLE for a 429, with no Plex text", async () => {
    deleteResponse = "429"
    const result = await unshareUserFromPlexServer(SERVER, "1001")

    expect(result).toEqual({ success: false, code: "PLEX_UNAVAILABLE" })
    expect(JSON.stringify(result)).not.toContain("Too many requests")
  })

  it("returns PLEX_AUTH when plex.tv rejects the token on the user list", async () => {
    usersResponse = { status: 401, body: DELETE_RESPONSES["401"].body }

    await expect(unshareUserFromPlexServer(SERVER, "1001")).resolves.toEqual({ success: false, code: "PLEX_AUTH" })
    expect(deletes()).toHaveLength(0)
  })

  it("returns PLEX_UNAVAILABLE when the user list fails with a 5xx", async () => {
    usersResponse = { status: 503, body: "" }

    await expect(unshareUserFromPlexServer(SERVER, "1001")).resolves.toEqual({
      success: false,
      code: "PLEX_UNAVAILABLE",
    })
    expect(deletes()).toHaveLength(0)
  })

  it("returns PLEX_UNAVAILABLE on a network error", async () => {
    jest.mocked(global.fetch).mockImplementation(async () => {
      throw new TypeError("fetch failed")
    })

    await expect(unshareUserFromPlexServer(SERVER, "1001")).resolves.toEqual({
      success: false,
      code: "PLEX_UNAVAILABLE",
    })
  })
})
