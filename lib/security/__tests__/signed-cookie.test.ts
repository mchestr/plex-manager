/**
 * @jest-environment node
 */

import { createHmac, hkdfSync } from "node:crypto"

import { readCookie, signValue, verifyValue } from "@/lib/security/signed-cookie"

describe("signValue and verifyValue", () => {
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it("round-trips a payload for the same purpose", () => {
    const raw = signValue({ pinId: 42, code: "abc" }, "plex-pin", 900)

    expect(verifyValue(raw, "plex-pin")).toEqual({ pinId: 42, code: "abc" })
  })

  it("refuses a PIN cookie presented as a Discord OAuth cookie", () => {
    const raw = signValue({ pinId: 42 }, "plex-pin", 900)

    expect(verifyValue(raw, "discord-oauth")).toBeNull()
  })

  it("refuses a tampered body or signature", () => {
    const raw = signValue({ pinId: 42 }, "plex-pin", 900)
    const [body, signature] = raw.split(".")
    const forgedBody = Buffer.from(JSON.stringify({ pinId: 43, exp: 9_999_999_999 })).toString("base64url")
    // The first character carries six signature bits; the last carries padding.
    const flipped = `${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`
    const repadded = `${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`

    expect(verifyValue(`${forgedBody}.${signature}`, "plex-pin")).toBeNull()
    expect(verifyValue(`${body}.${flipped}`, "plex-pin")).toBeNull()
    expect(verifyValue(`${body}.${repadded}`, "plex-pin")).toBeNull()
    expect(verifyValue(`${body}.${signature}.extra`, "plex-pin")).toBeNull()
    expect(verifyValue(body, "plex-pin")).toBeNull()
  })

  it("refuses an expired value", () => {
    jest.useFakeTimers({ now: new Date("2026-11-11T12:00:00Z") })
    const raw = signValue({ pinId: 42 }, "plex-pin", 900)

    jest.setSystemTime(new Date("2026-11-11T12:14:59Z"))
    expect(verifyValue(raw, "plex-pin")).toEqual({ pinId: 42 })

    jest.setSystemTime(new Date("2026-11-11T12:15:00Z"))
    expect(verifyValue(raw, "plex-pin")).toBeNull()
  })

  it.each([undefined, null, "", "not-a-cookie", "a.b"])("refuses %p", (raw) => {
    expect(verifyValue(raw, "plex-pin")).toBeNull()
  })

  it.each([
    ["a body that is not JSON", "not json"],
    ["an array", "[1,2]"],
    ["a payload without exp", '{"pinId":42}'],
  ])("refuses a correctly signed value with %s", (_label, json) => {
    // Signed the way signValue signs, so only the body's shape is wrong
    const secret = process.env.NEXTAUTH_SECRET ?? ""
    const key = Buffer.from(hkdfSync("sha256", secret, "", "plex-manager:signed-cookie:plex-pin", 32))
    const body = Buffer.from(json).toString("base64url")
    const signature = createHmac("sha256", key).update(body).digest("base64url")

    expect(verifyValue(`${body}.${signature}`, "plex-pin")).toBeNull()
  })

  it("throws without NEXTAUTH_SECRET", () => {
    jest.replaceProperty(process.env, "NEXTAUTH_SECRET", "")

    expect(() => signValue({ pinId: 42 }, "plex-pin", 900)).toThrow("NEXTAUTH_SECRET is not set")
  })

  it("refuses a value signed with another NEXTAUTH_SECRET", () => {
    const raw = signValue({ pinId: 42 }, "plex-pin", 900)
    jest.replaceProperty(process.env, "NEXTAUTH_SECRET", "another-secret-that-is-at-least-32-characters")

    expect(verifyValue(raw, "plex-pin")).toBeNull()
  })
})

describe("readCookie", () => {
  it("finds one cookie in a raw header", () => {
    expect(readCookie("a=1; pm-plex-pin=abc.def; b=2", "pm-plex-pin")).toBe("abc.def")
  })

  it("decodes a percent-encoded value", () => {
    expect(readCookie("pm-plex-pin=a%3Db", "pm-plex-pin")).toBe("a=b")
  })

  it("keeps a value that is not valid percent-encoding as it is", () => {
    expect(readCookie("pm-plex-pin=a%zz", "pm-plex-pin")).toBe("a%zz")
  })

  it("does not match a cookie whose name only ends with the name", () => {
    expect(readCookie("x-pm-plex-pin=evil", "pm-plex-pin")).toBeUndefined()
  })

  it.each([undefined, null, ""])("returns undefined for the header %p", (header) => {
    expect(readCookie(header, "pm-plex-pin")).toBeUndefined()
  })
})
