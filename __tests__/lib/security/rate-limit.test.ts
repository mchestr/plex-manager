/**
 * Tests for rate limiting functionality
 * Tests rate limit enforcement and client identification
 */

import { NextRequest } from "next/server"
import { rateLimit } from "@/lib/security/rate-limit"

// Mock Next.js server
jest.mock("next/server", () => ({
  NextRequest: jest.requireActual("next/server").NextRequest,
  NextResponse: {
    json: jest.fn((data, init) => {
      const headersMap = new Map(Object.entries(init?.headers || {}))
      const mockHeaders = {
        get: (key: string) => headersMap.get(key),
        set: (key: string, value: string) => headersMap.set(key, value),
      }
      return {
        json: () => Promise.resolve(data),
        status: init?.status || 200,
        headers: mockHeaders,
      }
    }),
  },
}))

// Mock timers for testing
jest.useFakeTimers()

describe("Rate Limiting", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
  })

  describe("rateLimit", () => {
    it("should allow first request", async () => {
      const limiter = rateLimit({
        windowMs: 60000, // 1 minute
        max: 5,
      })

      const request = new NextRequest("http://localhost:3000/api/test", {
        headers: {
          "x-forwarded-for": "10.9.0.1",
          "user-agent": "Test Browser",
        },
      })

      const response = await limiter(request)
      expect(response).toBeNull()
    })

    it("should allow requests up to the limit", async () => {
      const limiter = rateLimit({
        windowMs: 60000,
        max: 3,
      })

      // Use unique IP to avoid conflicts with other tests
      const request = new NextRequest("http://localhost:3000/api/test", {
        headers: {
          "x-forwarded-for": "192.168.1.100",
          "user-agent": "Test Browser Unique",
        },
      })

      // First 3 requests should pass (count starts at 1, so max 3 means 3 requests allowed)
      expect(await limiter(request)).toBeNull()
      expect(await limiter(request)).toBeNull()
      expect(await limiter(request)).toBeNull()

      // 4th request should be blocked
      const blockedResponse = await limiter(request)
      expect(blockedResponse).not.toBeNull()
      expect(blockedResponse!.status).toBe(429)
    })

    it("should block requests exceeding the limit", async () => {
      const limiter = rateLimit({
        windowMs: 60000,
        max: 2,
      })

      const request = new NextRequest("http://localhost:3000/api/test", {
        headers: {
          "x-forwarded-for": "10.9.0.2",
          "user-agent": "Test Browser",
        },
      })

      // First 2 requests pass
      await limiter(request)
      await limiter(request)

      // Third request should be blocked
      const response = await limiter(request)
      expect(response).not.toBeNull()
      expect(response!.status).toBe(429)

      const data = await response!.json()
      expect(data.error).toBe("Too many requests")
      expect(data.code).toBe("RATE_LIMIT_EXCEEDED")
    })

    it("should include rate limit headers in blocked response", async () => {
      const limiter = rateLimit({
        windowMs: 60000,
        max: 1,
      })

      const request = new NextRequest("http://localhost:3000/api/test", {
        headers: {
          "x-forwarded-for": "10.9.0.3",
          "user-agent": "Test Browser",
        },
      })

      // First request passes
      await limiter(request)

      // Second request blocked
      const response = await limiter(request)
      expect(response).not.toBeNull()

      expect(response!.headers.get("Retry-After")).toBeTruthy()
      expect(response!.headers.get("X-RateLimit-Limit")).toBe("1")
      expect(response!.headers.get("X-RateLimit-Remaining")).toBe("0")
      expect(response!.headers.get("X-RateLimit-Reset")).toBeTruthy()
    })

    it("should reset count after window expires", async () => {
      const windowMs = 60000
      const limiter = rateLimit({
        windowMs,
        max: 2,
      })

      const request = new NextRequest("http://localhost:3000/api/test", {
        headers: {
          "x-forwarded-for": "10.9.0.4",
          "user-agent": "Test Browser",
        },
      })

      // Use up the limit
      await limiter(request)
      await limiter(request)

      // Should be blocked
      const blockedResponse = await limiter(request)
      expect(blockedResponse).not.toBeNull()

      // Advance time past the window
      jest.advanceTimersByTime(windowMs + 1000)

      // Should be allowed again
      const allowedResponse = await limiter(request)
      expect(allowedResponse).toBeNull()
    })

    it("should track different clients separately", async () => {
      const limiter = rateLimit({
        windowMs: 60000,
        max: 1,
      })

      const request1 = new NextRequest("http://localhost:3000/api/test", {
        headers: {
          "x-forwarded-for": "10.9.0.5",
          "user-agent": "Browser A",
        },
      })

      const request2 = new NextRequest("http://localhost:3000/api/test", {
        headers: {
          "x-forwarded-for": "192.168.1.2",
          "user-agent": "Browser B",
        },
      })

      // First client uses their limit
      await limiter(request1)
      const blocked1 = await limiter(request1)
      expect(blocked1).not.toBeNull()

      // Second client should still be allowed
      const allowed2 = await limiter(request2)
      expect(allowed2).toBeNull()
    })

    it("should use custom key generator if provided", async () => {
      const customKeyGen = jest.fn(() => "custom-key")
      const limiter = rateLimit({
        windowMs: 60000,
        max: 1,
        keyGenerator: customKeyGen,
      })

      const request = new NextRequest("http://localhost:3000/api/test", {
        headers: {
          "x-forwarded-for": "10.9.0.6",
        },
      })

      await limiter(request)
      expect(customKeyGen).toHaveBeenCalledWith(request)
    })

    it("should handle requests with x-real-ip header", async () => {
      const limiter = rateLimit({
        windowMs: 60000,
        max: 1,
      })

      const request = new NextRequest("http://localhost:3000/api/test", {
        headers: {
          "x-real-ip": "10.0.0.1",
          "user-agent": "Test Browser",
        },
      })

      const response = await limiter(request)
      expect(response).toBeNull()
    })

    it("should handle requests with forwarded-for containing multiple IPs", async () => {
      const limiter = rateLimit({
        windowMs: 60000,
        max: 1,
      })

      const request = new NextRequest("http://localhost:3000/api/test", {
        headers: {
          "x-forwarded-for": "192.168.1.200, 10.0.0.1, 172.16.0.1",
          "user-agent": "Test Browser Multiple IPs",
        },
      })

      const response = await limiter(request)
      expect(response).toBeNull()
    })

    it("should handle requests without IP headers", async () => {
      const limiter = rateLimit({
        windowMs: 60000,
        max: 1,
      })

      const request = new NextRequest("http://localhost:3000/api/test", {
        headers: {
          "user-agent": "Test Browser",
        },
      })

      const response = await limiter(request)
      expect(response).toBeNull()
    })

    it("should include retry-after time in blocked response", async () => {
      const limiter = rateLimit({
        windowMs: 60000,
        max: 1,
      })

      const request = new NextRequest("http://localhost:3000/api/test", {
        headers: {
          "x-forwarded-for": "10.9.0.7",
        },
      })

      // Use up limit
      await limiter(request)

      // Get blocked response
      const response = await limiter(request)
      expect(response).not.toBeNull()

      const data = await response!.json()
      expect(data.retryAfter).toBeDefined()
      expect(typeof data.retryAfter).toBe("number")
      expect(data.retryAfter).toBeGreaterThan(0)
      expect(data.retryAfter).toBeLessThanOrEqual(60) // Should be within window
    })
  })

  describe("Pre-configured rate limiters", () => {
    it("should export shareRateLimiter", () => {
      const { shareRateLimiter } = require("@/lib/security/rate-limit")
      expect(shareRateLimiter).toBeDefined()
      expect(typeof shareRateLimiter).toBe("function")
    })

    it("should export adminRateLimiter", () => {
      const { adminRateLimiter } = require("@/lib/security/rate-limit")
      expect(adminRateLimiter).toBeDefined()
      expect(typeof adminRateLimiter).toBe("function")
    })

    it("should export authRateLimiter", () => {
      const { authRateLimiter } = require("@/lib/security/rate-limit")
      expect(authRateLimiter).toBeDefined()
      expect(typeof authRateLimiter).toBe("function")
    })
  })
})

