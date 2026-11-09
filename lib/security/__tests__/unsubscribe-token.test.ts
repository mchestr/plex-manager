/**
 * @jest-environment node
 *
 * The unsubscribe token: a signed value for the purpose
 * `email-unsubscribe` that holds the member id only and expires after 365
 * days.
 */

import { signValue } from "@/lib/security/signed-cookie"
import {
  MAX_UNSUBSCRIBE_TOKEN_LENGTH,
  signUnsubscribeToken,
  UNSUBSCRIBE_TOKEN_TTL_SEC,
  verifyUnsubscribeToken,
} from "@/lib/security/unsubscribe-token"

const NOW = new Date("2026-11-10T12:00:00Z")

beforeEach(() => {
  jest.useFakeTimers({ now: NOW })
})

afterEach(() => {
  jest.useRealTimers()
})

describe("unsubscribe token", () => {
  it("names the member it was signed for, and holds nothing else", () => {
    const token = signUnsubscribeToken("member-1")

    expect(verifyUnsubscribeToken(token)).toBe("member-1")
    const [body] = token.split(".")
    expect(JSON.parse(Buffer.from(body, "base64url").toString("utf8"))).toEqual({
      u: "member-1",
      exp: Math.floor(NOW.getTime() / 1000) + UNSUBSCRIBE_TOKEN_TTL_SEC,
    })
  })

  it("lasts 365 days", () => {
    const token = signUnsubscribeToken("member-1")

    jest.setSystemTime(new Date(NOW.getTime() + (UNSUBSCRIBE_TOKEN_TTL_SEC - 1) * 1000))
    expect(verifyUnsubscribeToken(token)).toBe("member-1")
    jest.setSystemTime(new Date(NOW.getTime() + UNSUBSCRIBE_TOKEN_TTL_SEC * 1000))
    expect(verifyUnsubscribeToken(token)).toBeNull()
  })

  it("refuses a value signed for another purpose", () => {
    expect(verifyUnsubscribeToken(signValue({ u: "member-1" }, "plex-pin", 900))).toBeNull()
  })

  it("refuses a changed token", () => {
    const token = signUnsubscribeToken("member-1")
    const other = Buffer.from(JSON.stringify({ u: "member-2", exp: 9_999_999_999 })).toString("base64url")

    expect(verifyUnsubscribeToken(`${other}.${token.split(".")[1]}`)).toBeNull()
    expect(verifyUnsubscribeToken(`${token}x`)).toBeNull()
  })

  it("refuses a token signed with another NEXTAUTH_SECRET", () => {
    const token = signUnsubscribeToken("member-1")
    jest.replaceProperty(process.env, "NEXTAUTH_SECRET", "another-secret-that-is-at-least-32-characters")

    expect(verifyUnsubscribeToken(token)).toBeNull()
  })

  it.each([
    ["extra keys", { u: "member-1", to: "on" }],
    ["no member id", { user: "member-1" }],
    ["an empty member id", { u: "" }],
    ["a member id that is not a string", { u: 42 }],
  ])("refuses a payload with %s", (_case, payload) => {
    expect(verifyUnsubscribeToken(signValue(payload, "email-unsubscribe", 900))).toBeNull()
  })

  it.each([
    ["no token", undefined],
    ["null", null],
    ["an empty token", ""],
    ["a token that is too long", "a".repeat(MAX_UNSUBSCRIBE_TOKEN_LENGTH + 1)],
    ["text that is no token", "not-a-token"],
  ])("refuses %s", (_case, token) => {
    expect(verifyUnsubscribeToken(token)).toBeNull()
  })
})
