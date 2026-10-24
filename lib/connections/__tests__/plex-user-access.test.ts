/**
 * @jest-environment node
 */

/**
 * checkUserServerAccess is a tri-state (GAP-05), checked against recorded
 * plex.tv responses in fixtures/plex-tv/: granted for an accepted share of
 * this server, denied when plex.tv answers without one (a pending invite
 * included), and unknown when plex.tv or the PMS cannot answer.
 */

import { readFileSync } from "fs"
import path from "path"

import { checkUserServerAccess } from "@/lib/connections/plex-user-access"

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

const SERVER = {
  url: "https://plex.example.com:32400",
  token: "owner-token",
  adminPlexUserId: "1000",
  machineIdentifier: "this-server-machine-id",
}
const USERS_URL = "https://clients.plex.tv/api/users"
const originalEnv = process.env

let usersResponse: () => Promise<Response>
let identityResponse: () => Promise<Response>
let fetchSpy: jest.SpyInstance

beforeEach(() => {
  process.env = { ...originalEnv, PLEX_CLIENT_IDENTIFIER: "plex-manager-test" }
  usersResponse = async () => new Response(USERS_XML, { status: 200, headers: { "Content-Type": "text/xml" } })
  identityResponse = async () => new Response('<MediaContainer size="0" machineIdentifier="this-server-machine-id"/>', { status: 200 })
  fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = String(input)
    if (url === USERS_URL) return usersResponse()
    if (url === `${SERVER.url}/identity`) return identityResponse()
    throw new Error(`Unexpected request: ${url}`)
  })
})

afterEach(() => {
  process.env = originalEnv
  jest.restoreAllMocks()
})

const recorded = (code: "429" | "503") => async () =>
  new Response(ERRORS[code].body, {
    status: ERRORS[code].status,
    headers: { "Content-Type": ERRORS[code].contentType, ...ERRORS[code].headers },
  })

describe("checkUserServerAccess", () => {
  it("grants a member with an accepted share of this server", async () => {
    await expect(checkUserServerAccess(SERVER, "1001")).resolves.toEqual({ status: "granted" })
  })

  it("denies a friend who shares only another server", async () => {
    await expect(checkUserServerAccess(SERVER, "1003")).resolves.toEqual({ status: "denied" })
  })

  it("denies a pending share until it is accepted", async () => {
    await expect(checkUserServerAccess(SERVER, "1004")).resolves.toEqual({ status: "denied" })
  })

  it("denies an account plex.tv does not list", async () => {
    await expect(checkUserServerAccess(SERVER, "9999")).resolves.toEqual({ status: "denied" })
  })

  it("grants the owner with no call at all", async () => {
    await expect(checkUserServerAccess(SERVER, " 1000 ")).resolves.toEqual({ status: "granted" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("uses the stored machine identifier, so a PMS restart does not block the check", async () => {
    identityResponse = async () => {
      throw new TypeError("fetch failed")
    }

    await expect(checkUserServerAccess(SERVER, "1001")).resolves.toEqual({ status: "granted" })
    expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([USERS_URL])
  })

  it("is unknown when no machine identifier is stored and the PMS is down", async () => {
    identityResponse = async () => new Response("", { status: 503 })

    await expect(checkUserServerAccess({ ...SERVER, machineIdentifier: null }, "1001")).resolves.toEqual({
      status: "unknown",
      reason: "server_unreachable",
    })
  })

  it("is unknown on a 429, with its Retry-After", async () => {
    usersResponse = recorded("429")

    await expect(checkUserServerAccess(SERVER, "1001")).resolves.toEqual({
      status: "unknown",
      reason: "rate_limited",
      retryAfterSec: 30,
    })
  })

  it("is unknown on a 503", async () => {
    usersResponse = recorded("503")

    await expect(checkUserServerAccess(SERVER, "1001")).resolves.toEqual({ status: "unknown", reason: "plex_unavailable" })
  })

  it("is unknown on a timeout", async () => {
    usersResponse = async () => {
      const abort = new Error("aborted")
      abort.name = "AbortError"
      throw abort
    }

    await expect(checkUserServerAccess(SERVER, "1001")).resolves.toEqual({ status: "unknown", reason: "plex_unavailable" })
  })

  it("is unknown on a parse error", async () => {
    usersResponse = async () => new Response("<html>gateway</html>", { status: 200 })

    await expect(checkUserServerAccess(SERVER, "1001")).resolves.toEqual({ status: "unknown", reason: "plex_unavailable" })
  })

  it("is unknown, never denied, when plex.tv refuses the owner's token", async () => {
    usersResponse = async () => new Response("<errors/>", { status: 401 })

    await expect(checkUserServerAccess(SERVER, "1001")).resolves.toEqual({
      status: "unknown",
      reason: "server_token_invalid",
    })
  })

  it("is unknown when the stored token cannot be decrypted, and the owner still signs in (P11.1)", async () => {
    const unreadable = { ...SERVER, token: null }

    await expect(checkUserServerAccess(unreadable, "1001")).resolves.toEqual({ status: "unknown", reason: "server_token_invalid" })
    await expect(checkUserServerAccess(unreadable, "1000")).resolves.toEqual({ status: "granted" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
