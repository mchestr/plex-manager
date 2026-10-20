/**
 * The fixed `?flash=` codes a redirect may carry. A page shows copy for a known
 * code and drops anything else, because query text is attacker-controlled.
 *
 * @module lib/ui/flash-codes
 */

/** The Discord callback's outcomes (P4.9). */
const DISCORD_CALLBACK_CODES = [
  "discord_linked",
  "discord_failed",
  "discord_expired",
  "discord_session_mismatch",
] as const

export type DiscordCallbackFlash = (typeof DISCORD_CALLBACK_CODES)[number]

/** `path` (which may already carry a query) with `flash=<code>` set. */
export function withFlash(path: string, code: DiscordCallbackFlash): string {
  const index = path.indexOf("?")
  const pathname = index === -1 ? path : path.slice(0, index)
  const params = new URLSearchParams(index === -1 ? "" : path.slice(index + 1))
  params.set("flash", code)
  return `${pathname}?${params.toString()}`
}
