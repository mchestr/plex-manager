/**
 * The fixed codes a redirect may carry in its query, and the toast each one
 * shows (UI-07). `FlashFromQuery` (in the root layout) reads them on every
 * page, shows the toast and takes them out of the URL.
 *
 * ## Parameters
 *
 * - `flash`: this app's codes, set with `withFlash()`.
 * - `error`: NextAuth's sign-in error codes (`pages.signIn` is `/`).
 *   `/auth/error` (`pages.error`) reads its own `error` with `nextAuthError()`.
 * - `status`: the Discord callback's legacy `status=linked`. Other values are
 *   left alone, because pages such as `/admin/queues` filter on `status`.
 *
 * ## Special cases
 *
 * Query text is attacker-controlled (SEC-20): a value that is not a known code
 * is never shown. An unknown `flash` or `error` is still removed from the URL
 * (with `error_description`), since nothing else reads them. Error copy lives
 * in `lib/ui/error-copy.ts`, with every other error code.
 *
 * @module lib/ui/flash-codes
 */

import { errorCopy } from "@/lib/ui/error-copy"

/** The Discord callback's outcomes (P4.9). */
const DISCORD_CALLBACK_CODES = [
  "discord_linked",
  "discord_failed",
  "discord_expired",
  "discord_session_mismatch",
] as const

export type DiscordCallbackFlash = (typeof DISCORD_CALLBACK_CODES)[number]

/** The connect route's refusals. */
type DiscordConnectFlash = "discord_rate_limited" | "discord_unavailable"

/** An admin removed a member (P11.13); the users list shows it. */
type AdminFlash = "member_removed"

type FlashCode = DiscordCallbackFlash | DiscordConnectFlash | AdminFlash

/**
 * NextAuth's error codes: sign-in errors reach the sign-in page as `?error=`,
 * and the rest `/auth/error` (`pages.error`). `RateLimited` is P0.10's
 * per-IP limit on the auth route.
 */
type NextAuthErrorCode =
  | "CredentialsSignin"
  | "AccessDenied"
  | "Configuration"
  | "Verification"
  | "RateLimited"
  | "Default"

/** The codes whose toast is an error, with copy in `error-copy.ts`. */
export type FlashErrorCode = Exclude<FlashCode, "discord_linked" | AdminFlash> | NextAuthErrorCode

type FlashTone = "success" | "error"

export interface FlashToast {
  title: string
  /** Left out where the title says it all ("Discord linked"). */
  description?: string
  tone: FlashTone
}

const DISCORD_LINKED: FlashToast = { title: "Discord linked", tone: "success" }

const MEMBER_REMOVED: FlashToast = {
  title: "Member removed",
  description: "Their access, sessions and stored data are gone.",
  tone: "success",
}

const errorToast = (code: FlashErrorCode): Required<FlashToast> => ({ ...errorCopy(code, { audience: "member" }), tone: "error" })

const FLASH: Record<FlashCode, FlashToast> = {
  discord_linked: DISCORD_LINKED,
  discord_failed: errorToast("discord_failed"),
  discord_expired: errorToast("discord_expired"),
  discord_session_mismatch: errorToast("discord_session_mismatch"),
  discord_rate_limited: errorToast("discord_rate_limited"),
  discord_unavailable: errorToast("discord_unavailable"),
  member_removed: MEMBER_REMOVED,
}

const NEXT_AUTH: Record<NextAuthErrorCode, Required<FlashToast>> = {
  CredentialsSignin: errorToast("CredentialsSignin"),
  AccessDenied: errorToast("AccessDenied"),
  Configuration: errorToast("Configuration"),
  Verification: errorToast("Verification"),
  RateLimited: errorToast("RateLimited"),
  Default: errorToast("Default"),
}

const STATUS: Record<string, FlashToast> = { linked: DISCORD_LINKED }

const lookup = (table: Record<string, FlashToast>, value: string | null): FlashToast | undefined =>
  value !== null && Object.hasOwn(table, value) ? table[value] : undefined

/**
 * The toasts a query asks for, and the query without the parameters that
 * carried them. `null` when the query carries none, so the URL stays as is.
 *
 * @example
 * ```ts
 * const read = readFlash(new URLSearchParams("flash=discord_linked&tab=2"))
 * read?.toasts[0].title // "Discord linked"
 * read?.query.toString() // "tab=2"
 * readFlash(new URLSearchParams("error=Your account is locked"))?.toasts // []
 * readFlash(new URLSearchParams("status=failed")) // null
 * ```
 */
export function readFlash(params: URLSearchParams): { toasts: FlashToast[]; query: URLSearchParams } | null {
  const flash = params.get("flash")
  const error = params.get("error")
  const status = lookup(STATUS, params.get("status"))
  if (flash === null && error === null && !status && !params.has("error_description")) return null

  const query = new URLSearchParams(params)
  for (const key of ["flash", "error", "error_description"]) query.delete(key)
  if (status) query.delete("status")

  // `flash=discord_linked&status=linked` shows one toast, not two.
  const toasts = [...new Set([lookup(FLASH, flash), lookup(NEXT_AUTH, error), status])].filter(
    (toast) => toast !== undefined
  )
  return { toasts, query }
}

/**
 * What `/auth/error` shows for NextAuth's `?error=`: the code and its copy
 * when it is a known code, otherwise `Default`. The query text itself is
 * never returned.
 *
 * @example
 * ```ts
 * nextAuthError("Verification").code // "Verification"
 * nextAuthError("<script>alert(1)</script>").code // "Default"
 * ```
 */
export function nextAuthError(value: unknown): Required<FlashToast> & { code: NextAuthErrorCode } {
  const code: NextAuthErrorCode =
    typeof value === "string" && Object.hasOwn(NEXT_AUTH, value) ? (value as NextAuthErrorCode) : "Default"
  return { ...NEXT_AUTH[code], code }
}

/** `path` (which may already carry a query) with `flash=<code>` set. */
export function withFlash(path: string, code: FlashCode): string {
  const index = path.indexOf("?")
  const pathname = index === -1 ? path : path.slice(0, index)
  const params = new URLSearchParams(index === -1 ? "" : path.slice(index + 1))
  params.set("flash", code)
  return `${pathname}?${params.toString()}`
}
