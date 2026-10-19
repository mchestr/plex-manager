/**
 * @jest-environment node
 */

import { sessionCookieName as fixtureCookieName } from "@/e2e/fixtures/session"
import { sessionCookieName } from "@/lib/env"

// lib/auth.ts sets useSecureCookies explicitly from NEXTAUTH_URL (SEC-09), the
// same as NextAuth inferred it, so existing `__Secure-` sessions survive.

jest.mock("@/e2e/helpers/prisma", () => ({ createE2EPrismaClient: jest.fn() }))
jest.mock("@/lib/prisma", () => ({ prisma: {} }))
jest.mock("@/lib/connections/plex", () => ({ checkUserServerAccess: jest.fn(), getPlexUserInfo: jest.fn() }))
jest.mock("@/lib/jellyfin-auth", () => ({ authenticateJellyfin: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), reward: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ AuditEventType: {}, logAuditEvent: jest.fn() }))

const originalUrl = process.env.NEXTAUTH_URL

function loadAuthOptions(url: string) {
  process.env.NEXTAUTH_URL = url
  let options: typeof import("@/lib/auth").authOptions | undefined
  jest.isolateModules(() => {
    options = (require("@/lib/auth") as typeof import("@/lib/auth")).authOptions
  })
  return options!
}

afterAll(() => {
  process.env.NEXTAUTH_URL = originalUrl
})

describe("authOptions cookies", () => {
  it("uses Secure cookies for an https NEXTAUTH_URL", () => {
    expect(loadAuthOptions("https://plex.example.com").useSecureCookies).toBe(true)
  })

  it("does not use Secure cookies for loopback http", () => {
    expect(loadAuthOptions("http://localhost:3000").useSecureCookies).toBe(false)
  })

  it("passes NEXTAUTH_SECRET to NextAuth", () => {
    expect(loadAuthOptions("http://localhost:3000").secret).toBe(process.env.NEXTAUTH_SECRET)
  })

  it.each(["https://plex.example.com", "http://localhost:3100"])(
    "names the session cookie the way the E2E fixture does for %s",
    (url) => {
      expect(sessionCookieName(url)).toBe(fixtureCookieName(url))
    }
  )
})
