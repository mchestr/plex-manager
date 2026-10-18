/**
 * @jest-environment node
 */

/**
 * Tests for lib/security/ip-hash.ts: the stored visit hash comes from the
 * address the trusted proxy wrote, so a client cannot choose it.
 */

import { getHashedIP, hashIP } from "@/lib/security/ip-hash"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

function request(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/wrapped/share/token", { headers })
}

describe("getHashedIP", () => {
  it("hashes the entry the trusted proxy appended, so a spoofed leftmost entry does not change it", () => {
    const honest = getHashedIP(request({ "x-forwarded-for": "203.0.113.7" }))

    expect(getHashedIP(request({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))).toBe(honest)
    expect(getHashedIP(request({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.7" }))).toBe(honest)
    expect(honest).toBe(hashIP("203.0.113.7"))
  })

  it("gives different clients different hashes", () => {
    expect(getHashedIP(request({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))).not.toBe(
      getHashedIP(request({ "x-forwarded-for": "6.6.6.6, 203.0.113.8" }))
    )
  })

  it("hashes an IPv6 client by its /64", () => {
    expect(getHashedIP(request({ "x-forwarded-for": "2001:db8:1:2::1" }))).toBe(
      getHashedIP(request({ "x-forwarded-for": "2001:db8:1:2::2" }))
    )
  })

  it("returns null when no client address can be found", () => {
    expect(getHashedIP(request({}))).toBeNull()
    expect(getHashedIP(request({ "x-forwarded-for": "garbage" }))).toBeNull()
  })
})

describe("hashIP", () => {
  it("returns a salted SHA-256 hex digest, or null for no address", () => {
    expect(hashIP("203.0.113.7")).toMatch(/^[0-9a-f]{64}$/)
    expect(hashIP("203.0.113.7")).not.toBe(hashIP("203.0.113.8"))
    expect(hashIP(null)).toBeNull()
  })
})
