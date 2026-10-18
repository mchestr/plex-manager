/**
 * @jest-environment node
 */

/**
 * Tests for lib/security/client-ip.ts: the client address comes from the
 * entry the outermost trusted proxy wrote, never from client-supplied entries.
 */

import { clientIp } from "@/lib/security/client-ip"

const mockWarn = jest.fn()

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: (...args: unknown[]) => mockWarn(...args),
    error: jest.fn(),
  }),
}))

function headersWith(values: Record<string, string>): Headers {
  return new Headers(values)
}

/** A fresh copy of the module, so its once-per-process warnings start unreported. */
function freshClientIp(): typeof clientIp {
  let fresh: typeof clientIp = clientIp
  jest.isolateModules(() => {
    fresh = jest.requireActual<typeof import("@/lib/security/client-ip")>("@/lib/security/client-ip").clientIp
  })
  return fresh
}

describe("clientIp", () => {
  const originalHops = process.env.TRUSTED_PROXY_HOPS

  beforeEach(() => {
    mockWarn.mockClear()
  })

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

    it("keys IPv6 clients by their /64", () => {
      expect(clientIp(headersWith({ "x-forwarded-for": "2001:db8:1:2::1" }), 1)).toBe("2001:db8:1:2::/64")
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

    it("strips a port and brackets that a proxy wrote around the address", () => {
      expect(clientIp(headersWith({ "x-forwarded-for": "6.6.6.6, 203.0.113.7:51234" }), 1)).toBe("203.0.113.7")
      expect(clientIp(headersWith({ "x-forwarded-for": "6.6.6.6, [2001:db8:1:2::1]:443" }), 1)).toBe(
        "2001:db8:1:2::/64"
      )
      expect(clientIp(headersWith({ "x-forwarded-for": "[2001:db8:1:2::1]" }), 1)).toBe("2001:db8:1:2::/64")
      expect(clientIp(headersWith({ "x-real-ip": "203.0.113.7:8080" }), 1)).toBe("203.0.113.7")
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
      expect(clientIp(headersWith({ "x-forwarded-for": "203.0.113.7:not-a-port" }), 1)).toBe("unknown")
    })
  })

  describe("IPv6 and IPv4-mapped addresses", () => {
    const key = (address: string) => clientIp(headersWith({ "x-forwarded-for": `6.6.6.6, ${address}` }), 1)

    it("gives two addresses in one /64 the same key", () => {
      expect(key("2001:db8:1:2::1")).toBe(key("2001:db8:1:2:ffff:ffff:ffff:fffe"))
      expect(key("2001:db8:1:2::1")).toBe(key("2001:db8:1:2:a:b:c:d"))
    })

    it("gives addresses in different /64s different keys", () => {
      expect(key("2001:db8:1:2::1")).not.toBe(key("2001:db8:1:3::1"))
      expect(key("2001:db8:1:2::1")).not.toBe(key("2001:db8:2:2::1"))
    })

    it("writes every spelling of one /64 the same way", () => {
      for (const spelling of ["2001:0DB8:0001:0002:0000:0000:0000:0001", "2001:db8:1:2:0::1", "2001:db8:1:2::9%eth0"]) {
        expect(key(spelling)).toBe("2001:db8:1:2::/64")
      }
      expect(key("::1")).toBe("0:0:0:0::/64")
      expect(key("fe80::")).toBe("fe80:0:0:0::/64")
    })

    it("treats an IPv4-mapped IPv6 address as the IPv4 address", () => {
      expect(key("::ffff:203.0.113.7")).toBe("203.0.113.7")
      expect(key("::FFFF:203.0.113.7")).toBe("203.0.113.7")
      expect(key("::ffff:cb00:7107")).toBe("203.0.113.7")
      expect(key("0:0:0:0:0:ffff:203.0.113.7")).toBe(key("203.0.113.7"))
      expect(clientIp(headersWith({ "x-real-ip": "::ffff:198.51.100.4" }), 2)).toBe("198.51.100.4")
    })

    it("keeps an IPv6 address with an embedded IPv4 tail in its /64", () => {
      expect(key("64:ff9b::203.0.113.7")).toBe("64:ff9b:0:0::/64")
    })
  })

  describe("misconfiguration warnings", () => {
    it("warns once per process when no client address can be found", () => {
      const fresh = freshClientIp()

      expect(fresh(headersWith({}), 1)).toBe("unknown")
      expect(fresh(headersWith({ "x-forwarded-for": "garbage" }), 1)).toBe("unknown")

      const unknownWarnings = mockWarn.mock.calls.filter(([message]) => String(message).includes("share one rate-limit bucket"))
      expect(unknownWarnings).toHaveLength(1)
    })

    it("warns once when X-Forwarded-For has fewer entries than the hop count", () => {
      const fresh = freshClientIp()

      fresh(headersWith({ "x-forwarded-for": "172.70.1.1", "x-real-ip": "172.70.1.1" }), 2)
      fresh(headersWith({ "x-forwarded-for": "172.70.1.2", "x-real-ip": "172.70.1.2" }), 2)

      expect(mockWarn).toHaveBeenCalledTimes(1)
      expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining("TRUSTED_PROXY_HOPS"), {
        trustedProxyHops: 2,
        entries: 1,
      })
    })

    it("warns once when TRUSTED_PROXY_HOPS is invalid", () => {
      const fresh = freshClientIp()
      process.env.TRUSTED_PROXY_HOPS = "two"

      fresh(headersWith({ "x-forwarded-for": "203.0.113.7" }))
      fresh(headersWith({ "x-forwarded-for": "203.0.113.8" }))

      expect(mockWarn).toHaveBeenCalledTimes(1)
      expect(mockWarn).toHaveBeenCalledWith("TRUSTED_PROXY_HOPS is not a non-negative integer; using 1", {
        value: "two",
      })
    })

    it("does not warn for a well-formed header and hop count", () => {
      const fresh = freshClientIp()
      process.env.TRUSTED_PROXY_HOPS = "2"

      fresh(headersWith({ "x-forwarded-for": "6.6.6.6, 198.51.100.9, 172.70.1.1" }))

      expect(mockWarn).not.toHaveBeenCalled()
    })
  })
})
