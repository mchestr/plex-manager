/**
 * Where sign-in may send someone afterwards: `?callbackUrl=` on `/`, such as
 * the admin denial's `/?callbackUrl=/admin` (P10.17, P10.27).
 *
 * Only a same-origin relative path passes, so the parameter can never become
 * an open redirect:
 *
 * - it starts with one `/` (no `//host` or `/\host`, which browsers read as
 *   another origin), has no backslash, no control character and no whitespace;
 * - it resolves against a placeholder origin to that same origin, and the
 *   normalised path still starts with one `/` (`/a/..//evil.example` would
 *   normalise to `//evil.example`).
 *
 * The result is the normalised path with its query and hash.
 *
 * @module lib/validations/callback-path
 */

import { z } from "zod"

const MAX_LENGTH = 512
const PLACEHOLDER_ORIGIN = "http://callback.invalid"
// Control characters, whitespace and backslashes: URL parsing strips or
// rewrites them, so a path that carries one is never what it looks like.
const hasUnsafeCharacter = (value: string) =>
  [...value].some((char) => char === "\\" || char.charCodeAt(0) <= 0x20 || char.charCodeAt(0) === 0x7f)

const startsWithOneSlash = (path: string) => path.startsWith("/") && !path.startsWith("//")

/**
 * The same-origin path in `value`, or `null` for anything else.
 *
 * @example
 * ```ts
 * safeCallbackPath("/admin") // "/admin"
 * safeCallbackPath("/rewind/2026?from=home#top") // "/rewind/2026?from=home#top"
 * safeCallbackPath("https://evil.example/") // null
 * safeCallbackPath("//evil.example") // null
 * safeCallbackPath("/a/..//evil.example") // null
 * ```
 */
export function safeCallbackPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_LENGTH) return null
  if (!startsWithOneSlash(value) || hasUnsafeCharacter(value)) return null

  let url: URL
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN)
  } catch {
    return null
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return null

  const path = `${url.pathname}${url.search}${url.hash}`
  return startsWithOneSlash(path) ? path : null
}

/** A stored callback path (the Plex PIN cookie): only a value `safeCallbackPath` keeps as is. */
export const callbackPathSchema = z
  .string()
  .max(MAX_LENGTH)
  .refine((value) => safeCallbackPath(value) === value, "Not a same-origin path")
