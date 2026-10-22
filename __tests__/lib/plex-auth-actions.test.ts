/**
 * @jest-environment node
 */

/**
 * The Plex sign-in actions in lib/plex-auth.ts (P4.8, SEC-11). The cookie jar
 * stands in for one browser; plex.tv is the mocked lib/connections/plex-pin;
 * the rate limiter is the real in-memory one.
 */

import { getServerSession, type Session } from "next-auth"

import { getOnboardingStatus } from "@/actions/onboarding"
import { getAccessLevel } from "@/lib/access"
import { createPin, readPin } from "@/lib/connections/plex-pin"
import { finishPlexSignIn, pollPlexSignIn, startPlexSignIn } from "@/lib/plex-auth"
import { pinCookie, readPinCookie } from "@/lib/plex-pin-cookie"
import { signValue } from "@/lib/security/signed-cookie"

interface SetCookie {
  name: string
  value: string
  httpOnly?: boolean
  sameSite?: string
  path?: string
  maxAge?: number
}

/** One browser's cookies, and every cookie the actions set. */
const mockBrowser = { jar: new Map<string, string>(), sets: [] as SetCookie[], ip: "203.0.113.7" }

jest.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mockBrowser.jar.has(name) ? { name, value: mockBrowser.jar.get(name) } : undefined),
    set: (cookie: SetCookie) => {
      mockBrowser.sets.push(cookie)
      mockBrowser.jar.set(cookie.name, cookie.value)
    },
    delete: (name: string) => mockBrowser.jar.delete(name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": mockBrowser.ip }),
}))
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/access", () => ({ getAccessLevel: jest.fn() }))
jest.mock("@/actions/onboarding", () => ({ getOnboardingStatus: jest.fn() }))
jest.mock("@/lib/connections/plex-pin", () => ({
  ...jest.requireActual("@/lib/connections/plex-pin"),
  createPin: jest.fn(),
  readPin: jest.fn(),
}))

const mockCreatePin = jest.mocked(createPin)
const mockReadPin = jest.mocked(readPin)
const mockGetServerSession = jest.mocked(getServerSession)
const mockGetAccessLevel = jest.mocked(getAccessLevel)
const mockGetOnboardingStatus = jest.mocked(getOnboardingStatus)

const ACCOUNT_TOKEN = "plex-account-token-xyz"
const AUTH_PREFIX = "https://app.plex.tv/auth#?"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

let nextPinId = 1000

/** A fresh browser with no cookies, on its own address. */
function newBrowser(ip = `198.51.100.${(nextPinId % 250) + 1}`) {
  mockBrowser.jar = new Map()
  mockBrowser.sets = []
  mockBrowser.ip = ip
}

function setCookie(name: string) {
  return mockBrowser.sets.filter((cookie) => cookie.name === name).at(-1)
}

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

afterAll(() => {
  process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
})

beforeEach(() => {
  jest.clearAllMocks()
  newBrowser()
  process.env.NEXT_PUBLIC_APP_URL = "https://plex.example.com"
  mockCreatePin.mockImplementation(async () => ({ ok: true, data: { id: ++nextPinId, code: `code${nextPinId}` } }))
  mockReadPin.mockResolvedValue({ status: "waiting" })
  mockGetServerSession.mockResolvedValue(null)
})

describe("startPlexSignIn", () => {
  it("keeps the PIN in a signed httpOnly cookie and returns only the plex.tv URL", async () => {
    const result = await startPlexSignIn({ inviteCode: "FRIENDS1" })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(Object.keys(result.data)).toEqual(["authUrl"])

    const cookie = setCookie("pm-plex-pin")
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 900 })
    const pin = readPinCookie(cookie?.value)
    expect(pin).toEqual({ pinId: nextPinId, code: `code${nextPinId}`, clientId: expect.stringMatching(UUID), inviteCode: "FRIENDS1" })

    const params = new URLSearchParams(result.data.authUrl.slice(AUTH_PREFIX.length))
    expect(result.data.authUrl.startsWith(AUTH_PREFIX)).toBe(true)
    expect(params.get("clientID")).toBe(pin?.clientId)
    expect(params.get("code")).toBe(pin?.code)
    expect(params.get("context[device][product]")).toBe("Plex Manager")
    // The forward URL carries no PIN id and no invite code
    expect(params.get("forwardUrl")).toBe("https://plex.example.com/auth/callback/plex")
    expect(result.data.authUrl).not.toContain("FRIENDS1")
    // Spaces are %20, as plex.tv has always received them
    expect(result.data.authUrl).toContain("Plex%20Manager")
  })

  it("keeps a same-origin callback path in the cookie, never in the plex.tv URL", async () => {
    const result = await startPlexSignIn({ callbackPath: "/admin" })

    expect(readPinCookie(setCookie("pm-plex-pin")?.value)?.callbackPath).toBe("/admin")
    expect(result.success && result.data.authUrl).not.toContain("admin")
  })

  it.each(["https://evil.example/admin", "//evil.example", "/\\evil.example", "/a/..//evil.example"])(
    "drops the off-site callback path %s and still signs in",
    async (callbackPath) => {
      await expect(startPlexSignIn({ callbackPath })).resolves.toMatchObject({ success: true })
      expect(readPinCookie(setCookie("pm-plex-pin")?.value)).not.toHaveProperty("callbackPath")
    }
  )

  it("keeps a base URL's path in the forward URL", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://plex.example.com/manager/"

    const result = await startPlexSignIn({})

    expect(result.success && new URLSearchParams(result.data.authUrl.slice(AUTH_PREFIX.length)).get("forwardUrl")).toBe(
      "https://plex.example.com/manager/auth/callback/plex"
    )
  })

  it("gives each browser its own client identifier and keeps it for a year", async () => {
    await startPlexSignIn({})
    const first = setCookie("pm-plex-client")
    const firstId = readPinCookie(setCookie("pm-plex-pin")?.value)?.clientId
    expect(first).toMatchObject({ httpOnly: true, sameSite: "lax", maxAge: 365 * 24 * 60 * 60 })

    // The same browser again: no new identifier
    mockBrowser.sets = []
    await startPlexSignIn({})
    expect(setCookie("pm-plex-client")).toBeUndefined()
    expect(mockCreatePin).toHaveBeenLastCalledWith(firstId)

    // Another browser
    newBrowser()
    await startPlexSignIn({})
    const secondId = readPinCookie(setCookie("pm-plex-pin")?.value)?.clientId
    expect(secondId).toMatch(UUID)
    expect(secondId).not.toBe(firstId)
    expect(mockCreatePin).toHaveBeenLastCalledWith(secondId)
  })

  it("replaces a client identifier cookie that is not signed by the app", async () => {
    mockBrowser.jar.set("pm-plex-client", "attacker-chosen-id")

    await startPlexSignIn({})

    expect(mockCreatePin).toHaveBeenCalledWith(expect.stringMatching(UUID))
  })

  it.each([{ inviteCode: "A B" }, { inviteCode: "../x" }, { pinId: 1 }])("refuses the input %p", async (input) => {
    await expect(startPlexSignIn(input as Parameters<typeof startPlexSignIn>[0])).resolves.toMatchObject({
      success: false,
      code: "VALIDATION",
    })
    expect(mockCreatePin).not.toHaveBeenCalled()
  })

  it("returns UPSTREAM_UNAVAILABLE and sets no PIN cookie when plex.tv fails", async () => {
    mockCreatePin.mockResolvedValue({ ok: false, code: "HTTP", status: 503 })

    await expect(startPlexSignIn({})).resolves.toMatchObject({ success: false, code: "UPSTREAM_UNAVAILABLE" })
    expect(setCookie("pm-plex-pin")).toBeUndefined()
  })

  it("is limited per client IP (plex:pin:create)", async () => {
    newBrowser("192.0.2.200")
    for (let call = 0; call < 30; call++) {
      await expect(startPlexSignIn({})).resolves.toMatchObject({ success: true })
    }
    await expect(startPlexSignIn({})).resolves.toMatchObject({ success: false, code: "RATE_LIMITED" })
  })
})

describe("pollPlexSignIn", () => {
  it("refuses a browser without the PIN cookie", async () => {
    await expect(pollPlexSignIn()).resolves.toEqual({ success: true, data: { status: "expired" } })
    expect(mockReadPin).not.toHaveBeenCalled()
  })

  it("refuses a tampered PIN cookie", async () => {
    await startPlexSignIn({})
    const [body, signature] = (mockBrowser.jar.get("pm-plex-pin") ?? "").split(".")
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>
    const forged = Buffer.from(JSON.stringify({ ...payload, pinId: 1 })).toString("base64url")
    mockBrowser.jar.set("pm-plex-pin", `${forged}.${signature}`)

    await expect(pollPlexSignIn()).resolves.toEqual({ success: true, data: { status: "expired" } })
    expect(mockReadPin).not.toHaveBeenCalled()
  })

  it("refuses a cookie signed for another purpose", async () => {
    const pin = { pinId: 77, code: "abcd", clientId: "6f1c2a7e-3b4d-4c5e-8f90-1a2b3c4d5e6f" }
    mockBrowser.jar.set("pm-plex-pin", signValue(pin, "discord-oauth", 900))

    await expect(pollPlexSignIn()).resolves.toEqual({ success: true, data: { status: "expired" } })
    expect(mockReadPin).not.toHaveBeenCalled()
  })

  it("reads the cookie's PIN with its code and client identifier", async () => {
    await startPlexSignIn({})
    const pin = readPinCookie(mockBrowser.jar.get("pm-plex-pin"))

    await expect(pollPlexSignIn()).resolves.toEqual({ success: true, data: { status: "waiting" } })
    expect(mockReadPin).toHaveBeenCalledWith(pin?.pinId, pin?.code, pin?.clientId)
  })

  it("says ready without returning the token", async () => {
    await startPlexSignIn({})
    mockReadPin.mockResolvedValue({ status: "ready", authToken: ACCOUNT_TOKEN })

    const result = await pollPlexSignIn()

    expect(result).toEqual({ success: true, data: { status: "ready" } })
    expect(JSON.stringify(result)).not.toContain("authToken")
    expect(JSON.stringify(result)).not.toContain(ACCOUNT_TOKEN)
  })

  it("keeps waiting through a plex.tv hiccup, and reports an expired PIN", async () => {
    await startPlexSignIn({})

    mockReadPin.mockResolvedValue({ status: "unavailable" })
    await expect(pollPlexSignIn()).resolves.toEqual({ success: true, data: { status: "waiting" } })

    mockReadPin.mockResolvedValue({ status: "expired" })
    await expect(pollPlexSignIn()).resolves.toEqual({ success: true, data: { status: "expired" } })
  })

  it("rate-limits the 301st poll for one PIN, from any address", async () => {
    await startPlexSignIn({})
    for (let poll = 1; poll <= 300; poll++) {
      mockBrowser.ip = `10.${Math.floor(poll / 250)}.${poll % 250}.9`
      await expect(pollPlexSignIn()).resolves.toMatchObject({ success: true })
    }

    mockBrowser.ip = "10.9.9.9"
    await expect(pollPlexSignIn()).resolves.toMatchObject({ success: false, code: "RATE_LIMITED" })
    expect(mockReadPin).toHaveBeenCalledTimes(300)
  })
})

describe("finishPlexSignIn", () => {
  const session: Session = {
    user: { id: "user-1", name: "Member", email: "m@example.com", isAdmin: false },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  }

  beforeEach(() => {
    mockBrowser.jar.set(
      "pm-plex-pin",
      pinCookie({ pinId: 5, code: "abcd", clientId: "6f1c2a7e-3b4d-4c5e-8f90-1a2b3c4d5e6f" }).value
    )
    mockGetServerSession.mockResolvedValue(session)
    mockGetAccessLevel.mockResolvedValue("full")
    mockGetOnboardingStatus.mockResolvedValue({
      success: true,
      data: { isComplete: true, service: "plex", allStatuses: { plex: true, jellyfin: false } },
    })
  })

  it("deletes the PIN cookie and sends a member home", async () => {
    await expect(finishPlexSignIn()).resolves.toEqual({ success: true, data: { next: "/" } })
    expect(mockBrowser.jar.has("pm-plex-pin")).toBe(false)
  })

  it("sends a member to the cookie's callback path", async () => {
    mockBrowser.jar.set(
      "pm-plex-pin",
      pinCookie({ pinId: 5, code: "abcd", clientId: "6f1c2a7e-3b4d-4c5e-8f90-1a2b3c4d5e6f", callbackPath: "/admin" }).value
    )

    await expect(finishPlexSignIn()).resolves.toEqual({ success: true, data: { next: "/admin" } })
  })

  it("ignores a callback path in a cookie the app did not sign", async () => {
    const [body] = (mockBrowser.jar.get("pm-plex-pin") ?? "").split(".")
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>
    const forged = Buffer.from(JSON.stringify({ ...payload, callbackPath: "//evil.example" })).toString("base64url")
    mockBrowser.jar.set("pm-plex-pin", forged + ".bad")

    await expect(finishPlexSignIn()).resolves.toEqual({ success: true, data: { next: "/" } })
  })

  it("sends a member who has not finished onboarding to /onboarding", async () => {
    mockGetOnboardingStatus.mockResolvedValue({
      success: true,
      data: { isComplete: false, service: "plex", allStatuses: { plex: false, jellyfin: false } },
    })

    await expect(finishPlexSignIn()).resolves.toEqual({ success: true, data: { next: "/onboarding" } })
  })

  it.each(["lapsed", "none"] as const)("sends a %s non-member (Stripe on) to /subscribe", async (level) => {
    mockGetAccessLevel.mockResolvedValue(level)

    await expect(finishPlexSignIn()).resolves.toEqual({ success: true, data: { next: "/subscribe" } })
    expect(mockGetOnboardingStatus).not.toHaveBeenCalled()
  })

  it("refuses without a session, and still deletes the cookie", async () => {
    mockGetServerSession.mockResolvedValue(null)

    await expect(finishPlexSignIn()).resolves.toMatchObject({ success: false, code: "UNAUTHENTICATED" })
    expect(mockBrowser.jar.has("pm-plex-pin")).toBe(false)
  })
})
