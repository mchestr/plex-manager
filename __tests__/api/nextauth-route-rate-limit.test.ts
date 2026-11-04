/**
 * @jest-environment node
 */

/**
 * Tests for the rate limits on app/api/auth/[...nextauth]/route.ts.
 *
 * The real next-auth handler runs the Plex credential callback behind the
 * per-IP limit in the route. Plex and the database are mocked; the limiter
 * uses its in-process store (jest.setup.js clears REDIS_URL).
 */

import { createHash } from "node:crypto"

import { POST } from "@/app/api/auth/[...nextauth]/route"
import { getPlexUserInfo } from "@/lib/connections/plex"
import { NextRequest } from "next/server"
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

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

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock("@/lib/connections/plex", () => ({
  checkUserServerAccess: jest.fn(),
  getPlexUserInfo: jest.fn(),
}))

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const mockGetPlexUserInfo = getPlexUserInfo as jest.MockedFunction<typeof getPlexUserInfo>

const env = process.env as Record<string, string | undefined>
const originalNextAuthUrl = env.NEXTAUTH_URL

/**
 * POSTs a credential callback through the route, as next-auth's `signIn()`
 * does. `ip` is the entry the trusted proxy appended; `spoofed` is what the
 * client put in front of it.
 */
async function callback(
  provider: "plex",
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
    mockGetPlexUserInfo.mockResolvedValue({ success: false, error: "Invalid token" })
  })

  afterEach(() => {
    delete env.E2E_TEST_MODE
  })

  describe("Plex (auth:plex)", () => {
    it("returns 429 on the 21st callback from one IP", async () => {
      for (let i = 0; i < 20; i++) {
        const attempt = await callback("plex", "203.0.113.20", { authToken: `token-${i}` })
        expect(attempt.status).toBe(401)
        // No PIN cookie: the token in the body is ignored (P4.8)
        expect(attempt.error).toBe("plex_pin_expired")
      }

      const limited = await callback("plex", "203.0.113.20", { authToken: "token-20" })

      expect(limited.status).toBe(429)
      expect(limited.error).toBe("RateLimited")
      expect(mockGetPlexUserInfo).not.toHaveBeenCalled()
    })

    it("keeps the Plex limit in E2E test mode", async () => {
      env.E2E_TEST_MODE = "true"

      for (let i = 0; i < 20; i++) {
        const attempt = await callback("plex", "203.0.113.21", { authToken: "TEST_ADMIN_TOKEN" })
        expect(attempt.status).toBe(401)
      }

      expect((await callback("plex", "203.0.113.21", { authToken: "TEST_ADMIN_TOKEN" })).status).toBe(429)
    })

    it("keys by the trusted proxy entry, so rotating the spoofed leftmost value does not help", async () => {
      for (let i = 0; i < 20; i++) {
        const attempt = await callback("plex", "203.0.113.22", { authToken: `token-${i}` }, `192.0.2.${i}`)
        expect(attempt.status).toBe(401)
      }

      const limited = await callback("plex", "203.0.113.22", { authToken: "token-20" }, "192.0.2.20")

      expect(limited.status).toBe(429)
      expect(Number(limited.response.headers.get("Retry-After"))).toBeGreaterThan(0)
      expect(limited.body.url).toBe("http://localhost:3000/api/auth/error?error=RateLimited")
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
