/**
 * @jest-environment node
 */

/**
 * proxy.ts in front of the public share page (P0.11, P7.5,
 * lib/rewind/share/share-gate.ts). The page cannot set its own status, so the
 * proxy answers:
 *
 * - 429 with the static branded page for a visitor over `rw:share-page`
 *   (60 a minute per IP), before any database read;
 * - 503 with `Retry-After: 30` when the database probe fails;
 * - the same page with a 404 status for a token that shares nothing, by the
 *   rule of `getShareSafeRewind` (the hashed v3 lookup, refused when revoked,
 *   rotated or expired, and the v2 fallback until the season closes).
 *
 * The rate limiter is the real in-memory one (no `REDIS_URL`).
 */

import { createHash } from "node:crypto"

import { mockReset } from "jest-mock-extended"
import { NextRequest } from "next/server"

import { buildConfig, buildPlexWrapped, buildRewindShare } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { resetShareProbe } from "@/lib/rewind/share/share-gate"
import { proxy } from "@/proxy"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next-auth/jwt", () => ({ getToken: jest.fn().mockResolvedValue(null) }))

const mockLogError = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  ...jest.requireActual("@/lib/utils/logger"),
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: (...args: unknown[]) => mockLogError(...args) }),
}))

/** Tokens of the shape `generateShareToken` and `mintCredentials` make. */
const V3_TOKEN = "Kf-qkQFsJ4E6X_vMSKq1PiT624JyrVJtTNbepCgWYl8"
const V2_TOKEN = "vZ2bLJpJkqoegfJ4-9rodbBNhGs3XZ-sdNzNXJC96wI"
const UNKNOWN = "Zz2bLJpJkqoegfJ4-9rodbBNhGs3XZ-sdNzNXJC96wI"

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

let ipCounter = 0
/** A fresh client address per request unless one is given, so limits never carry over. */
function request(path: string, ip = `203.0.113.${++ipCounter % 250}`) {
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers: { "x-forwarded-for": ip } })
}

function share(overrides: Parameters<typeof buildRewindShare>[0] = {}, status = "completed") {
  return { ...buildRewindShare(overrides), wrapped: { id: "wrapped-1", status } }
}

function expectNotFoundRewrite(response: Response, path: string) {
  expect(response.status).toBe(404)
  expect(new URL(response.headers.get("x-middleware-rewrite") ?? "").pathname).toBe(path)
}

function expectPassedThrough(response: Response) {
  expect(response.status).toBe(200)
  expect(response.headers.get("x-middleware-next")).toBe("1")
}

beforeEach(() => {
  mockReset(prismaMock)
  mockLogError.mockReset()
  resetShareProbe()
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ timezone: "UTC" }))
  prismaMock.rewindShare.findUnique.mockImplementation((async ({ where }: { where: { tokenHash?: string } }) =>
    where.tokenHash === sha256(V3_TOKEN) ? share() : null) as never)
  prismaMock.plexWrapped.findUnique.mockImplementation((async ({ where }: { where: { shareToken?: string } }) =>
    where.shareToken === V2_TOKEN ? buildPlexWrapped({ status: "completed" }) : null) as never)
})

afterEach(() => {
  jest.useRealTimers()
})

describe("proxy /rewind/s/<token> lookup", () => {
  it.each([
    "/rewind/s/bad-token",
    `/rewind/s/${"a".repeat(42)}`,
    `/rewind/s/${"a".repeat(44)}`,
    `/rewind/s/${"a".repeat(42)}=`,
    `/rewind/s/${"a".repeat(40)}%2F`,
    `/rewind/s/${"a".repeat(40)}%E0%A4%A`,
  ])("answers the malformed share path %s with a 404 and no database call", async (path) => {
    expectNotFoundRewrite(await proxy(request(path)), path)
    expect(prismaMock.config.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.rewindShare.findUnique).not.toHaveBeenCalled()
  })

  it("passes a live v3 link through, found by the SHA-256 of its token", async () => {
    expectPassedThrough(await proxy(request(`/rewind/s/${V3_TOKEN}`)))
    expect(prismaMock.rewindShare.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: sha256(V3_TOKEN) } }))
    expect(prismaMock.plexWrapped.findUnique).not.toHaveBeenCalled()
  })

  it("decodes the segment as the page does", async () => {
    expectPassedThrough(await proxy(request(`/rewind/s/%4B${V3_TOKEN.slice(1)}`)))
  })

  it.each([
    ["revoked", share({ revokedAt: new Date() })],
    ["rotated (its old row is revoked)", share({ revokedAt: new Date(), rotatedFromId: null })],
    ["expired", share({ expiresAt: new Date(Date.now() - 1000) })],
    ["on an unfinished Rewind", share({}, "generating")],
  ])("answers a %s v3 link with a 404 and the same page", async (_label, row) => {
    prismaMock.rewindShare.findUnique.mockResolvedValue(row as never)
    const path = `/rewind/s/${V3_TOKEN}`
    expectNotFoundRewrite(await proxy(request(path)), path)
  })

  it("answers an unknown token with a 404", async () => {
    const path = `/rewind/s/${UNKNOWN}`
    expectNotFoundRewrite(await proxy(request(path)), path)
  })

  it("answers every token with a 404 while public links are off", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindPublicLinks: false }))
    for (const token of [V3_TOKEN, V2_TOKEN]) {
      const path = `/rewind/s/${token}`
      expectNotFoundRewrite(await proxy(request(path)), path)
    }
  })

  it("passes a surviving v2 token through before the season closes, and 404s it after", async () => {
    jest.useFakeTimers({ now: new Date("2027-01-15T12:00:00Z"), doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] })
    expectPassedThrough(await proxy(request(`/rewind/s/${V2_TOKEN}`)))

    jest.setSystemTime(new Date("2027-02-02T12:00:00Z"))
    resetShareProbe()
    const path = `/rewind/s/${V2_TOKEN}`
    expectNotFoundRewrite(await proxy(request(path)), path)
  })

  it("lets the request through when the lookup fails, so the page reports the error", async () => {
    const error = new Error("lookup failed")
    prismaMock.rewindShare.findUnique.mockRejectedValue(error)

    expectPassedThrough(await proxy(request(`/rewind/s/${V3_TOKEN}`)))
    expect(mockLogError).toHaveBeenCalledWith("Share token lookup failed", error)
  })
})

describe("proxy /rewind/s/<token> busy and down states", () => {
  it("answers the 61st request a minute from one IP with 429 and the branded page, before any read", async () => {
    const ip = "198.51.100.61"
    for (let i = 0; i < 60; i++) expectPassedThrough(await proxy(request(`/rewind/s/${V3_TOKEN}`, ip)))
    prismaMock.rewindShare.findUnique.mockClear()
    prismaMock.config.findUnique.mockClear()

    const limited = await proxy(request(`/rewind/s/${V3_TOKEN}`, ip))

    expect(limited.status).toBe(429)
    expect(limited.headers.get("Content-Type")).toBe("text/html; charset=utf-8")
    expect(limited.headers.get("X-Robots-Tag")).toBe("noindex, nofollow")
    expect(limited.headers.get("X-Request-ID")).toBeTruthy()
    const body = await limited.text()
    expect(body).toContain("This Rewind couldn&#39;t load.")
    expect(body).toContain(`<a href="/rewind/s/${V3_TOKEN}">Try again</a>`)
    expect(prismaMock.rewindShare.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.config.findUnique).not.toHaveBeenCalled()

    // Another visitor is not limited
    expectPassedThrough(await proxy(request(`/rewind/s/${V3_TOKEN}`, "198.51.100.62")))
  })

  it("answers 503 with Retry-After: 30 when the database probe fails, and caches the result for 5 s", async () => {
    prismaMock.config.findUnique.mockRejectedValue(new Error("connection refused"))

    const down = await proxy(request(`/rewind/s/${V3_TOKEN}`))

    expect(down.status).toBe(503)
    expect(down.headers.get("Retry-After")).toBe("30")
    expect(await down.text()).toContain("Try again in a moment.")
    expect(prismaMock.rewindShare.findUnique).not.toHaveBeenCalled()

    prismaMock.config.findUnique.mockResolvedValue(buildConfig())
    expect((await proxy(request(`/rewind/s/${V3_TOKEN}`))).status).toBe(503)
  })

  it("answers 503 when the probe takes longer than 2 s", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] })
    prismaMock.config.findUnique.mockReturnValue(new Promise(() => {}) as never)

    const pending = proxy(request(`/rewind/s/${V3_TOKEN}`))
    await jest.advanceTimersByTimeAsync(2000)

    expect((await pending).status).toBe(503)
  })

  it.each(["/", "/rewind/2026", "/admin/users", "/api/rewind/card/s/Abcdefghijklmnopqrstuv/cover"])(
    "leaves %s untouched, even with the database down",
    async (path) => {
      prismaMock.config.findUnique.mockRejectedValue(new Error("connection refused"))
      expectPassedThrough(await proxy(request(path)))
      expect(prismaMock.rewindShare.findUnique).not.toHaveBeenCalled()
    }
  )
})
