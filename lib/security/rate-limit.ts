import { NextRequest, NextResponse } from "next/server"

interface RateLimitOptions {
  windowMs: number // Time window in milliseconds
  max: number // Maximum number of requests per window
  keyGenerator?: (request: NextRequest) => string
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

// In-memory store (for production, use Redis)
const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

/**
 * Get client identifier from request
 */
function getClientId(request: NextRequest): string {
  // Try to get IP from headers (works with proxies)
  const forwarded = request.headers.get("x-forwarded-for")
  const ip = forwarded?.split(",")[0]?.trim() ||
             request.headers.get("x-real-ip") ||
             "unknown"

  // Include user agent for additional uniqueness
  const userAgent = request.headers.get("user-agent") || "unknown"

  return `${ip}:${userAgent}`
}

/**
 * Rate limit middleware for Next.js API routes
 */
export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, keyGenerator = getClientId } = options

  return async (request: NextRequest): Promise<NextResponse | null> => {
    const key = keyGenerator(request)
    const now = Date.now()

    const entry = rateLimitStore.get(key)

    if (!entry || now > entry.resetTime) {
      // Create new entry or reset expired one
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + windowMs,
      })
      return null // No rate limit exceeded
    }

    // Increment count
    entry.count++

    if (entry.count > max) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
      return NextResponse.json(
        {
          error: "Too many requests",
          code: "RATE_LIMIT_EXCEEDED",
          retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfter.toString(),
            "X-RateLimit-Limit": max.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": new Date(entry.resetTime).toISOString(),
          },
        }
      )
    }

    return null // No rate limit exceeded
  }
}

/**
 * Rate limit a Server Action by an arbitrary key (e.g. a user id).
 *
 * Server Actions don't receive a `NextRequest`, so the request-based
 * {@link rateLimit} doesn't apply. This shares the same in-memory store and
 * returns `true` when the caller is within the limit, `false` when exceeded.
 *
 * Note: the store is per-instance (not global across replicas) — adequate as a
 * basic abuse guard, matching the existing request limiters.
 *
 * @param key - Stable identifier for the caller (namespaced, e.g. `checkout:<userId>`).
 * @param options - `windowMs` and `max` for the window.
 * @returns `true` if allowed, `false` if the limit is exceeded.
 */
export function checkRateLimit(
  key: string,
  options: { windowMs: number; max: number }
): boolean {
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + options.windowMs })
    return true
  }

  entry.count++
  return entry.count <= options.max
}

/**
 * Pre-configured rate limiters
 */
export const shareRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
})

export const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Stricter limit for admin
})

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Very strict for auth endpoints
})

