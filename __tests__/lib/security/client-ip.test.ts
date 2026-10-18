/**
 * @jest-environment node
 */

/**
 * Tests for lib/security/client-ip.ts: the client address comes from the
 * entry the outermost trusted proxy wrote, never from client-supplied entries.
 */

import { clientIp } from "@/lib/security/client-ip"

function headersWith(values: Record<string, string>): Headers {
  return new Headers(values)
}

describe("clientIp", () => {
  const originalHops = process.env.TRUSTED_PROXY_HOPS

  afterEach(() => {
    if (originalHops === undefined) {
      delete process.env.TRUSTED_PROXY_HOPS
    } else {
      process.env.TRUSTED_PROXY_HOPS = originalHops
    }
  })

  describe("JSDoc examples", () => {
    it("returns the address Traefik appended with one hop", () => {
      expect(clientIp(headersWith({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }), 1)).toBe("203.0.113.7")
    })

    it("returns the address Cloudflare appended with two hops", () => {
      expect(
        clientIp(headersWith({ "x-forwarded-for": "6.6.6.6, 198.51.100.9, 172.70.1.1" }), 2)
      ).toBe("198.51.100.9")
    })

    it("falls back to X-Real-IP when there are fewer entries than hops", () => {
      expect(
        clientIp(headersWith({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.4" }), 2)
      ).toBe("198.51.100.4")
    })
  })

  describe("hop counts", () => {
    it("reads the rightmost entry with hops 0 (best-effort, no proxy)", () => {
      expect(clientIp(headersWith({ "x-forwarded-for": "198.51.100.20" }), 0)).toBe("198.51.100.20")
      expect(clientIp(headersWith({ "x-forwarded-for": "6.6.6.6, 198.51.100.20" }), 0)).toBe("198.51.100.20")
    })

    it("reads the entry the single trusted proxy appended with hops 1", () => {
      expect(clientIp(headersWith({ "x-forwarded-for": "10.1.1.1, 6.6.6.6, 203.0.113.7" }), 1)).toBe(
        "203.0.113.7"
      )
    })

    it("reads the second entry from the right with hops 2", () => {
      expect(clientIp(headersWith({ "x-forwarded-for": "10.1.1.1, 6.6.6.6, 203.0.113.7" }), 2)).toBe(
        "6.6.6.6"
      )
    })

    it("defaults to TRUSTED_PROXY_HOPS, and to 1 when it is unset or invalid", () => {
      const headers = headersWith({ "x-forwarded-for": "6.6.6.6, 198.51.100.9, 172.70.1.1" })

      delete process.env.TRUSTED_PROXY_HOPS
      expect(clientIp(headers)).toBe("172.70.1.1")

      process.env.TRUSTED_PROXY_HOPS = "2"
      expect(clientIp(headers)).toBe("198.51.100.9")

      process.env.TRUSTED_PROXY_HOPS = " 2 "
      expect(clientIp(headers)).toBe("198.51.100.9")

      for (const invalid of ["", "-1", "1.5", "two"]) {
        process.env.TRUSTED_PROXY_HOPS = invalid
        expect(clientIp(headers)).toBe("172.70.1.1")
      }
    })
  })

  describe("spoofing", () => {
    it("puts requests with different spoofed leftmost values in one bucket", () => {
      const spoofed = ["1.1.1.1", "2.2.2.2", "8.8.8.8, 9.9.9.9", "203.0.113.200"].map((fake) =>
        clientIp(headersWith({ "x-forwarded-for": `${fake}, 203.0.113.7` }), 1)
      )

      expect(new Set(spoofed)).toEqual(new Set(["203.0.113.7"]))
    })

    it("ignores X-Real-IP while the trusted entry is present", () => {
      expect(
        clientIp(headersWith({ "x-forwarded-for": "6.6.6.6, 203.0.113.7", "x-real-ip": "6.6.6.6" }), 1)
      ).toBe("203.0.113.7")
    })
  })

  describe("fallbacks and garbage", () => {
    it("drops empty entries and surrounding whitespace", () => {
      expect(clientIp(headersWith({ "x-forwarded-for": " , 6.6.6.6 ,, 203.0.113.7 , " }), 1)).toBe(
        "203.0.113.7"
      )
    })

    it("accepts IPv6 addresses", () => {
      expect(clientIp(headersWith({ "x-forwarded-for": "6.6.6.6, 2001:db8::7" }), 1)).toBe("2001:db8::7")
    })

    it("falls back to X-Real-IP when the trusted entry is not an IP address", () => {
      expect(
        clientIp(headersWith({ "x-forwarded-for": "6.6.6.6, not-an-ip", "x-real-ip": "198.51.100.4" }), 1)
      ).toBe("198.51.100.4")
    })

    it("returns unknown when nothing usable is present", () => {
      expect(clientIp(headersWith({}), 1)).toBe("unknown")
      expect(clientIp(headersWith({ "x-forwarded-for": " , ," }), 1)).toBe("unknown")
      expect(clientIp(headersWith({ "x-forwarded-for": "<script>", "x-real-ip": "also garbage" }), 1)).toBe(
        "unknown"
      )
    })
  })
})
