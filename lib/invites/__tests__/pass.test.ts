/**
 * `getInvitePass` (P10.26, UI-36): every state, the Jellyfin rule, the
 * inviter and library names, and one limiter point per request.
 */

import { mockReset } from "jest-mock-extended"

import { buildInvite, buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getJellyfinLibraries } from "@/lib/connections/jellyfin-connection"
import { serviceFetch } from "@/lib/connections/http"
import { getInvitePass } from "@/lib/invites/pass"
import { consume } from "@/lib/security/rate-limit"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/brand", () => ({
  serverName: jest.fn().mockResolvedValue("Northfield Plex"),
  monogramFor: (name: string) => name[0]?.toUpperCase() ?? null,
}))
jest.mock("@/lib/security/rate-limit", () => ({
  consume: jest.fn(),
  actionClientIp: jest.fn().mockResolvedValue("203.0.113.7"),
}))
jest.mock("@/lib/settings/app-settings", () => ({
  getFormat: jest.fn().mockResolvedValue({ date: (value: Date) => value.toISOString().slice(0, 10) }),
}))
jest.mock("@/lib/connections/plex-config", () => ({
  getActivePlexServerConfig: jest.fn().mockResolvedValue({ name: "Plex", url: "http://plex.local:32400", token: "t" }),
}))
jest.mock("@/lib/connections/http", () => ({ serviceFetch: jest.fn(), serviceErrorMessage: () => "Plex failed" }))
jest.mock("@/lib/connections/jellyfin-connection", () => ({ getJellyfinLibraries: jest.fn() }))
jest.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }))
// The page test covers what the page draws; here only its lookups count.
jest.mock("@/components/invite/invite-pass", () => ({ InvitePass: () => null }))
jest.mock("@/components/status/not-found-screen", () => ({ notFoundInviteCode: jest.fn().mockResolvedValue(null) }))
// React's cache() only memoises inside a server render; this stands in for one request.
jest.mock("react", () => {
  const actual = jest.requireActual("react")
  return {
    ...actual,
    cache: (fn: (key: string) => unknown) => {
      const seen = new Map<string, unknown>()
      return (key: string) => {
        if (!seen.has(key)) seen.set(key, fn(key))
        return seen.get(key)
      }
    },
  }
})

const mockConsume = jest.mocked(consume)
const mockServiceFetch = jest.mocked(serviceFetch)
const DAY = 24 * 60 * 60 * 1000

let codeSeq = 0
/** A fresh code per test, since the stand-in cache lives for the whole file. */
function nextCode() {
  codeSeq += 1
  return `CODE${codeSeq}`
}

async function passFor(overrides: Parameters<typeof buildInvite>[0] = {}) {
  const code = nextCode()
  prismaMock.invite.findUnique.mockResolvedValue(buildInvite({ code, ...overrides }))
  const lookup = await getInvitePass(code)
  if (!lookup.ok) throw new Error("rate limited")
  return lookup.pass
}

beforeEach(() => {
  mockReset(prismaMock)
  mockConsume.mockReset().mockResolvedValue({ ok: true })
  mockServiceFetch.mockReset()
})

describe("getInvitePass states", () => {
  it("reads a usable invite as valid, with the stub fields", async () => {
    const expiresAt = new Date(Date.now() + 3 * DAY)
    const pass = await passFor({ maxUses: 5, useCount: 2, expiresAt })

    expect(pass).toMatchObject({
      state: "valid",
      serverType: "PLEX",
      serverName: "Northfield Plex",
      monogram: "N",
      usesLeft: { left: 3, total: 5 },
      expiresOn: expiresAt.toISOString().slice(0, 10),
      libraries: ["All libraries"],
    })
  })

  it("reads a past expiry as expired, before the uses", async () => {
    const pass = await passFor({ expiresAt: new Date(Date.now() - DAY), useCount: 1, maxUses: 1 })
    expect(pass.state).toBe("expired")
  })

  it("reads an invite with every use taken as used-up", async () => {
    const pass = await passFor({ maxUses: 2, useCount: 2 })
    expect(pass.state).toBe("used-up")
    expect(pass.usesLeft).toEqual({ left: 0, total: 2 })
  })

  it("reads a missing row as unknown, keeping the code", async () => {
    prismaMock.invite.findUnique.mockResolvedValue(null)
    const lookup = await getInvitePass("GONE1234")
    expect(lookup).toEqual({ ok: true, pass: expect.objectContaining({ state: "unknown", code: "GONE1234", inviter: null }) })
  })

  it("reads a code that is not a code as unknown without a lookup", async () => {
    const lookup = await getInvitePass("not a code!")
    expect(lookup).toEqual({ ok: true, pass: expect.objectContaining({ state: "unknown", code: "" }) })
    expect(prismaMock.invite.findUnique).not.toHaveBeenCalled()
  })

  it("names the Jellyfin server for a Jellyfin invite", async () => {
    prismaMock.jellyfinServer.findFirst.mockResolvedValue({ name: "Northfield Jellyfin" } as never)
    const pass = await passFor({ serverType: "JELLYFIN" })
    expect(pass).toMatchObject({ state: "valid", serverType: "JELLYFIN", serverName: "Northfield Jellyfin", monogram: "N" })
  })

  it("reads a Jellyfin invite as unknown while no Jellyfin server is active", async () => {
    prismaMock.jellyfinServer.findFirst.mockResolvedValue(null)
    const pass = await passFor({ serverType: "JELLYFIN" })
    expect(pass).toMatchObject({ state: "unknown", serverName: "Northfield Plex", inviter: null })
  })
})

describe("getInvitePass inviter and libraries", () => {
  it("names the inviter by name", async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ name: "Dana Whitfield", email: "dana@example.com" }))
    const pass = await passFor({ createdBy: "admin-1" })
    expect(pass.inviter).toBe("Dana Whitfield")
    expect(JSON.stringify(pass)).not.toContain("dana@example.com")
  })

  it("never shows an email-shaped name", async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ name: "dana@example.com" }))
    const pass = await passFor({ createdBy: "admin-1" })
    expect(pass.inviter).toBeNull()
  })

  it("resolves Plex section ids to their names", async () => {
    mockServiceFetch.mockResolvedValue({
      ok: true,
      data: { MediaContainer: { Directory: [{ key: "1", title: "Movies" }, { key: "2", title: "TV Shows" }, { key: "3", title: "Music" }] } },
    } as never)
    const pass = await passFor({ librarySectionIds: "[1,2]" })
    expect(pass.libraries).toEqual(["Movies", "TV Shows"])
  })

  it("falls back to a count when the listing fails, never an id", async () => {
    mockServiceFetch.mockResolvedValue({ ok: false, code: "NETWORK" } as never)
    const pass = await passFor({ librarySectionIds: "[1,2]" })
    expect(pass.libraries).toEqual(["2 libraries"])
  })

  it("resolves Jellyfin library ids to their names", async () => {
    prismaMock.jellyfinServer.findFirst.mockResolvedValue({ name: "Northfield Jellyfin", url: "http://jf", apiKey: "k" } as never)
    jest.mocked(getJellyfinLibraries).mockResolvedValue({
      success: true,
      data: [{ ItemId: "a".repeat(32), Name: "Films", Locations: [] }],
    })
    const pass = await passFor({ serverType: "JELLYFIN", jellyfinLibraryIds: JSON.stringify(["a".repeat(32), "b".repeat(32)]) })
    expect(pass.libraries).toEqual(["Films", "1 more"])
  })
})

describe("getInvitePass limit", () => {
  it("is RATE_LIMITED when the invite:validate point is spent, without a lookup", async () => {
    mockConsume.mockResolvedValue({ ok: false, retryAfterSec: 60 })
    await expect(getInvitePass(nextCode())).resolves.toEqual({ ok: false, code: "RATE_LIMITED" })
    expect(mockConsume).toHaveBeenCalledWith("invite:validate", "203.0.113.7")
    expect(prismaMock.invite.findUnique).not.toHaveBeenCalled()
  })

  it("spends one point across generateMetadata and the page", async () => {
    const { default: InvitePage, generateMetadata } = await import("@/app/invite/[code]/page")
    const code = nextCode()
    prismaMock.invite.findUnique.mockResolvedValue(buildInvite({ code }))
    const params = Promise.resolve({ code })

    await generateMetadata({ params })
    await InvitePage({ params })

    expect(mockConsume).toHaveBeenCalledTimes(1)
    expect(prismaMock.invite.findUnique).toHaveBeenCalledTimes(1)
  })
})
