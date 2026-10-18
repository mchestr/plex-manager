import { isIP } from "node:net"

const DEFAULT_TRUSTED_PROXY_HOPS = 1

/**
 * Reads `TRUSTED_PROXY_HOPS`, falling back to 1 when it is unset or not a
 * non-negative integer.
 *
 * @internal
 */
function trustedProxyHops(): number {
  const value = process.env.TRUSTED_PROXY_HOPS?.trim()
  return value && /^\d+$/.test(value) ? Number(value) : DEFAULT_TRUSTED_PROXY_HOPS
}

/**
 * Finds the client address behind a known number of reverse proxies.
 *
 * ## Why not the leftmost `X-Forwarded-For` entry
 *
 * Each proxy appends the address it received the request from, so only the
 * entries written by proxies we run can be trusted. Everything to their left
 * was sent by the client and can be anything. `TRUSTED_PROXY_HOPS` (default 1)
 * says how many proxies append to the header before it reaches the app.
 *
 * ```
 * X-Forwarded-For: 6.6.6.6, 203.0.113.7
 *                  ^^^^^^^  ^^^^^^^^^^^
 *                  client   appended by Traefik (hops = 1): the result
 * ```
 *
 * ## Algorithm
 *
 * 1. Split `X-Forwarded-For` on commas, trim each entry and drop empty ones.
 * 2. With N hops and at least N entries, take `entries[entries.length - N]`,
 *    the address the outermost trusted proxy saw.
 * 3. Otherwise, or when that entry is not an IP address, use `X-Real-IP`, then
 *    `"unknown"`.
 *
 * ## Special cases
 *
 * - `N = 0` is best-effort for installs with no proxy. Next.js writes the
 *   socket address into `X-Forwarded-For` only when the request has none, so
 *   the rightmost entry is used, and a client that sends its own header picks
 *   its own key.
 * - A non-integer or negative `TRUSTED_PROXY_HOPS` is ignored and the default
 *   of 1 applies.
 *
 * @param headers - The request headers (a `Headers` or Next's `ReadonlyHeaders`)
 * @param hops - The number of trusted proxies; defaults to `TRUSTED_PROXY_HOPS`
 * @returns The client address, or `"unknown"`
 *
 * @example
 * ```ts
 * // The client sent 6.6.6.6 and Traefik appended the address it saw.
 * clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }), 1) // => "203.0.113.7"
 *
 * // Cloudflare appended the client, then Traefik appended Cloudflare's edge.
 * clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 198.51.100.9, 172.70.1.1" }), 2) // => "198.51.100.9"
 *
 * // Too few entries for the hop count: X-Real-IP, then "unknown".
 * clientIp(new Headers({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.4" }), 2) // => "198.51.100.4"
 * ```
 */
export function clientIp(headers: Pick<Headers, "get">, hops: number = trustedProxyHops()): string {
  const entries = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  const position = Math.max(hops, 1)
  if (entries.length >= position) {
    const candidate = entries[entries.length - position]
    if (isIP(candidate)) {
      return candidate
    }
  }

  const realIp = headers.get("x-real-ip")?.trim()
  return realIp && isIP(realIp) ? realIp : "unknown"
}
