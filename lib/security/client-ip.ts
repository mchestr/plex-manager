import { isIP } from "node:net"

import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("CLIENT_IP")

const DEFAULT_TRUSTED_PROXY_HOPS = 1

/** Misconfigurations already reported by this process; each is logged once. */
const reported = new Set<string>()

function warnOnce(problem: string, message: string, meta: Record<string, unknown>): void {
  if (!reported.has(problem)) {
    reported.add(problem)
    logger.warn(message, meta)
  }
}

/**
 * Reads `TRUSTED_PROXY_HOPS`, falling back to 1 (with a one-time warning)
 * when it is set to anything but a non-negative integer.
 */
export function trustedProxyHops(): number {
  const value = process.env.TRUSTED_PROXY_HOPS?.trim()
  if (!value) {
    return DEFAULT_TRUSTED_PROXY_HOPS
  }
  if (/^\d+$/.test(value)) {
    return Number(value)
  }
  warnOnce("invalid-hops", "TRUSTED_PROXY_HOPS is not a non-negative integer; using 1", { value })
  return DEFAULT_TRUSTED_PROXY_HOPS
}

/**
 * Returns the bare address in a header entry, or `null` when it is not an IP
 * address. Strips what some proxies add around it: `[v6]`, `[v6]:port` and
 * `v4:port`. A bare IPv6 address is never split on its colons.
 *
 * @internal
 */
function parseAddress(entry: string): string | null {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(entry)
  const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(entry)
  const address = bracketed?.[1] ?? v4WithPort?.[1] ?? entry
  return isIP(address) ? address : null
}

/**
 * Expands a valid IPv6 address into its eight 16-bit groups, dropping any zone
 * id and converting an embedded IPv4 tail (`::ffff:203.0.113.7`) to two groups.
 *
 * @internal
 */
function ipv6Groups(address: string): number[] {
  let value = address.toLowerCase().split("%")[0]
  const v4Tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(value)
  if (v4Tail) {
    const [a, b, c, d] = v4Tail.slice(1).map(Number)
    value = `${value.slice(0, v4Tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }

  const [head, tail] = value.split("::")
  const headGroups = head ? head.split(":") : []
  if (tail === undefined) {
    return headGroups.map((group) => parseInt(group, 16))
  }
  const tailGroups = tail ? tail.split(":") : []
  const zeros = Array<string>(8 - headGroups.length - tailGroups.length).fill("0")
  return [...headGroups, ...zeros, ...tailGroups].map((group) => parseInt(group, 16))
}

/**
 * The rate-limit identity of an address. IPv4 stays as it is. An IPv4-mapped
 * IPv6 address (`::ffff:203.0.113.7`) becomes the IPv4 address. Any other IPv6
 * address becomes its /64 network, because one subscriber is usually given a
 * whole /64 and could otherwise take a fresh bucket for every request.
 *
 * @internal
 */
function addressKey(address: string): string {
  if (isIP(address) === 4) {
    return address
  }

  const groups = ipv6Groups(address)
  const isV4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff
  if (isV4Mapped) {
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".")
  }
  return `${groups.slice(0, 4).map((group) => group.toString(16)).join(":")}::/64`
}

/**
 * Finds the client address behind a known number of reverse proxies, as the
 * key for per-client rate limits.
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
 * 4. Normalise the address: strip `[...]` and `:port`, turn IPv4-mapped IPv6
 *    into IPv4, and collapse other IPv6 addresses to their /64 network.
 *
 * ## Special cases
 *
 * - `N = 0` is best-effort for installs with no proxy. Next.js writes the
 *   socket address into `X-Forwarded-For` only when the request has none, so
 *   the rightmost entry is used, and a client that sends its own header picks
 *   its own key.
 * - A non-integer or negative `TRUSTED_PROXY_HOPS` is ignored and the default
 *   of 1 applies.
 * - Every request that ends up as `"unknown"` shares one bucket. Each kind of
 *   misconfiguration (a bad `TRUSTED_PROXY_HOPS`, a header with no usable
 *   entry for the hop count, no address at all) is logged once per process.
 *
 * @param headers - The request headers (a `Headers` or Next's `ReadonlyHeaders`)
 * @param hops - The number of trusted proxies; defaults to `TRUSTED_PROXY_HOPS`
 * @returns The client's IPv4 address or IPv6 /64, or `"unknown"`
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
 *
 * // IPv6 clients are keyed by their /64.
 * clientIp(new Headers({ "x-forwarded-for": "2001:db8:1:2::1" }), 1) // => "2001:db8:1:2::/64"
 * ```
 */
export function clientIp(headers: Pick<Headers, "get">, hops: number = trustedProxyHops()): string {
  const entries = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  const position = Math.max(hops, 1)
  const forwarded = entries.length >= position ? parseAddress(entries[entries.length - position]) : null
  if (forwarded) {
    return addressKey(forwarded)
  }
  if (entries.length > 0) {
    warnOnce("forwarded-unusable", "X-Forwarded-For has no usable entry for TRUSTED_PROXY_HOPS; using X-Real-IP", {
      trustedProxyHops: hops,
      entries: entries.length,
    })
  }

  const realIp = parseAddress(headers.get("x-real-ip")?.trim() ?? "")
  if (realIp) {
    return addressKey(realIp)
  }
  warnOnce("unknown", "No client address in X-Forwarded-For or X-Real-IP; these requests share one rate-limit bucket", {
    trustedProxyHops: hops,
    entries: entries.length,
  })
  return "unknown"
}
