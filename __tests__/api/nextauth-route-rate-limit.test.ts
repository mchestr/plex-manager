/**
 * @jest-environment node
 */

/**
 * Tests for the rate limits on app/api/auth/[...nextauth]/route.ts.
 *
 * The real next-auth handler runs the credential callbacks, so the per-IP
 * limit in the route and the Jellyfin per-username limit in `authorize` are
 * exercised together. Jellyfin, Plex and the database are mocked; the limiter
 * uses its in-process store (jest.setup.js clears REDIS_URL).
 */

import { createHash } from "node:crypto"

import { POST } from "@/app/api/auth/[...nextauth]/route"
import { authenticateJellyfin } from "@/lib/jellyfin-auth"
import { getPlexUserInfo } from "@/lib/connections/plex"
import { prisma } from "@/lib/prisma"
import { consume } from "@/lib/security/rate-limit"
import { NextRequest } from "next/server"

const CSRF_TOKEN = "csrf-token-for-tests"

let currentHeaders = new Headers()

jest.mock("next/headers", () => ({
  headers: jest.fn(async () => currentHeaders),
  cookies: jest.fn(async () => ({
    getAll: () => {
      const hash = createHash("sha256").update(`${CSRF_TOKEN}${process.env.NEXTAUTH_SECRET}`).digest("hex")
      return [{ name: "next-auth.csrf-token", value: `${CSRF_TOKEN}|${hash}` }]
    },
  })),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    jellyfinServer: { findFirst: jest.fn() },
    plexServer: { findFirst: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
  },
}))

jest.mock("@/lib/jellyfin-auth", () => ({
  authenticateJellyfin: jest.fn(),
  isJellyfinAdmin: jest.fn(),
}))

jest.mock("@/lib/connections/plex", () => ({
  checkUserServerAccess: jest.fn(),
  getPlexUserInfo: jest.fn(),
}))

// The real limiter, wrapped so a test can read the subjects it was given.
jest.mock("@/lib/security/rate-limit", () => {
  const actual = jest.requireActual<typeof import("@/lib/security/rate-limit")>("@/lib/security/rate-limit")
  return { ...actual, consume: jest.fn(actual.consume) }
})

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const mockAuthenticateJellyfin = authenticateJellyfin as jest.MockedFunction<typeof authenticateJellyfin>
const mockGetPlexUserInfo = getPlexUserInfo as jest.MockedFunction<typeof getPlexUserInfo>
const mockJellyfinServerFindFirst = prisma.jellyfinServer.findFirst as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockUserUpdate = prisma.user.update as jest.Mock
const mockConsume = consume as jest.MockedFunction<typeof consume>

const env = process.env as Record<string, string | undefined>
const originalNextAuthUrl = env.NEXTAUTH_URL

/**
 * POSTs a credential callback through the route, as next-auth's `signIn()`
 * does. `ip` is the entry the trusted proxy appended; `spoofed` is what the
 * client put in front of it.
 */
async function callback(
  provider: "jellyfin" | "plex",
  ip: string,
  credentials: Record<string, string>,
  spoofed = "6.6.6.6"
) {
  const requestHeaders = {
    "content-type": "application/x-www-form-urlencoded",
    host: "localhost:3000",
    "x-forwarded-for": `${spoofed}, ${ip}`,
  }
  currentHeaders = new Headers(requestHeaders)
  const request = new NextRequest(`http://localhost:3000/api/auth/callback/${provider}`, {
    method: "POST",
    headers: requestHeaders,
    body: new URLSearchParams({ ...credentials, csrfToken: CSRF_TOKEN, json: "true" }).toString(),
  })
  const response = await POST(request, { params: Promise.resolve({ nextauth: ["callback", provider] }) })
  const body = (await response.json()) as { url: string }
  return { status: response.status, error: new URL(body.url).searchParams.get("error"), response, body }
}

function jellyfin(ip: string, username: string, password = "wrong-password") {
  return callback("jellyfin", ip, { username, password })
}

/** Makes Jellyfin accept `goodPassword` for any username and reject everything else. */
function acceptPassword(goodPassword: string) {
  const dbUser = { id: "user-1", email: null, name: "carol", image: null, isAdmin: false }
  mockUserFindUnique.mockResolvedValue(dbUser)
  mockUserUpdate.mockResolvedValue(dbUser)
  mockAuthenticateJellyfin.mockImplementation(async (_server, username, password) =>
    password === goodPassword
      ? { success: true, data: { id: "jellyfin-user-1", username, isAdmin: false } }
      : { success: false, error: "Invalid username or password" }
  )
}

describe("NextAuth credential callback rate limits", () => {
  beforeAll(() => {
    env.NEXTAUTH_URL = "http://localhost:3000"
  })

  afterAll(() => {
    env.NEXTAUTH_URL = originalNextAuthUrl
  })

  beforeEach(() => {
    jest.clearAllMocks()
    delete env.E2E_TEST_MODE
    mockJellyfinServerFindFirst.mockResolvedValue({
      url: "http://jellyfin.local:8096",
      apiKey: "api-key",
      adminUserId: "admin-id",
      isActive: true,
    })
    mockAuthenticateJellyfin.mockResolvedValue({ success: false, error: "Invalid username or password" })
    mockGetPlexUserInfo.mockResolvedValue({ success: false, error: "Invalid token" })
  })

  afterEach(() => {
    delete env.E2E_TEST_MODE
  })

  describe("Jellyfin, per IP (auth:jellyfin:ip)", () => {
    it("returns 429 with error=RateLimited on the 11th callback from one IP, while another IP passes", async () => {
      for (let i = 0; i < 10; i++) {
        const attempt = await jellyfin("203.0.113.10", `user-${i}`)
        expect(attempt).toMatchObject({ status: 401, error: "CredentialsSignin" })
      }

      const limited = await jellyfin("203.0.113.10", "user-10")

      expect(limited.status).toBe(429)
      expect(limited.body.url).toBe("http://localhost:3000/api/auth/error?error=RateLimited")
      expect(Number(limited.response.headers.get("Retry-After"))).toBeGreaterThan(0)
      expect(mockAuthenticateJellyfin).toHaveBeenCalledTimes(10)

      const otherIp = await jellyfin("203.0.113.11", "user-11")
      expect(otherIp).toMatchObject({ status: 401, error: "CredentialsSignin" })
      expect(mockAuthenticateJellyfin).toHaveBeenCalledTimes(11)
    })

    it("keys by the trusted proxy entry, so rotating the spoofed leftmost value does not help", async () => {
      const credentials = (i: number) => ({ username: `rotating-${i}`, password: "x" })
      for (let i = 0; i < 10; i++) {
        const attempt = await callback("jellyfin", "203.0.113.12", credentials(i), `192.0.2.${i}`)
        expect(attempt.status).toBe(401)
      }

      const limited = await callback("jellyfin", "203.0.113.12", credentials(10), "192.0.2.10")

      expect(limited.status).toBe(429)
    })
  })

  describe("Jellyfin, per username (auth:jellyfin:user)", () => {
    it("refuses the 6th attempt for one username across different IPs before contacting Jellyfin", async () => {
      for (let i = 0; i < 5; i++) {
        const attempt = await jellyfin(`198.51.100.${i + 1}`, "Alice")
        expect(attempt).toMatchObject({ status: 401, error: "CredentialsSignin" })
      }

      const limited = await jellyfin("198.51.100.6", "  ALICE ")

      expect(limited).toMatchObject({ status: 401, error: "RATE_LIMITED" })
      expect(mockAuthenticateJellyfin).toHaveBeenCalledTimes(5)

      const otherUser = await jellyfin("198.51.100.7", "bob")
      expect(otherUser).toMatchObject({ status: 401, error: "CredentialsSignin" })
    })

    it("counts only failures: 5 successful sign-ins and then a failure are not refused", async () => {
      acceptPassword("correct-password")

      for (let i = 0; i < 5; i++) {
        const signIn = await jellyfin(`198.51.100.${20 + i}`, "carol", "correct-password")
        expect(signIn).toMatchObject({ status: 200, error: null })
      }

      const failure = await jellyfin("198.51.100.25", "carol")
      expect(failure).toMatchObject({ status: 401, error: "CredentialsSignin" })
      expect(mockAuthenticateJellyfin).toHaveBeenCalledTimes(6)
    })

    it("folds case the way Jellyfin does, so 'Admin' and 'admın' (dotless i) share one bucket", async () => {
      const variants = ["Admin", "admın", "ADMIN", "admın", "aDmIn"]
      for (const [i, username] of variants.entries()) {
        const attempt = await jellyfin(`198.51.100.${40 + i}`, username)
        expect(attempt).toMatchObject({ status: 401, error: "CredentialsSignin" })
      }

      expect(await jellyfin("198.51.100.45", "admın")).toMatchObject({ status: 401, error: "RATE_LIMITED" })
      expect(mockAuthenticateJellyfin).toHaveBeenCalledTimes(5)
    })

    it("keys a username by a fixed-length hash, however long the name, and still limits it", async () => {
      const longName = "x".repeat(10_000)
      for (let i = 0; i < 5; i++) {
        await jellyfin(`198.51.100.${60 + i}`, longName)
      }

      expect(await jellyfin("198.51.100.65", longName.toUpperCase())).toMatchObject({ error: "RATE_LIMITED" })
      const subjects = mockConsume.mock.calls
        .filter(([name]) => name === "auth:jellyfin:user")
        .map(([, subject]) => subject)
      expect(subjects).toHaveLength(6)
      expect(new Set(subjects).size).toBe(1)
      expect(subjects[0]).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  describe("Plex (auth:plex)", () => {
    it("returns 429 on the 21st callback from one IP", async () => {
      for (let i = 0; i < 20; i++) {
        const attempt = await callback("plex", "203.0.113.20", { authToken: `token-${i}` })
        expect(attempt.status).toBe(401)
      }

      const limited = await callback("plex", "203.0.113.20", { authToken: "token-20" })

      expect(limited.status).toBe(429)
      expect(limited.error).toBe("RateLimited")
      expect(mockGetPlexUserInfo).toHaveBeenCalledTimes(20)
    })

    it("does not limit Plex test-token sign-ins in E2E test mode", async () => {
      env.E2E_TEST_MODE = "true"

      for (let i = 0; i < 25; i++) {
        const attempt = await callback("plex", "203.0.113.21", { authToken: "UNKNOWN_TEST_TOKEN" })
        expect(attempt.status).toBe(401)
      }
    })

    it("keeps the Jellyfin limit in E2E test mode", async () => {
      env.E2E_TEST_MODE = "true"

      for (let i = 0; i < 10; i++) {
        await jellyfin("203.0.113.22", `e2e-${i}`)
      }

      expect((await jellyfin("203.0.113.22", "e2e-10")).status).toBe(429)
    })
  })

  describe("other next-auth requests", () => {
    it("does not limit actions other than the credential callbacks", async () => {
      currentHeaders = new Headers({ "x-forwarded-for": "203.0.113.30" })
      for (let i = 0; i < 30; i++) {
        const request = new NextRequest("http://localhost:3000/api/auth/signout", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "203.0.113.30" },
          body: new URLSearchParams({ csrfToken: CSRF_TOKEN, json: "true" }).toString(),
        })
        const response = await POST(request, { params: Promise.resolve({ nextauth: ["signout"] }) })
        expect(response.status).not.toBe(429)
      }
    })
  })
})
