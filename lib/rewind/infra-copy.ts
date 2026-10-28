/**
 * The FR-50 copy: what Rewind says when its Redis is missing or down. The
 * Rewind card, `/rewind` and the admin season dashboard all show these strings.
 */

export type RewindInfraCode = "REDIS_NOT_CONFIGURED" | "REDIS_UNAVAILABLE"

/**
 * Returns the message for `code`. Without `REDIS_URL` admins are told what to
 * configure and members only that Rewind is not available; an outage reads the
 * same for both.
 *
 * @example
 * ```ts
 * rewindInfraMessage("REDIS_NOT_CONFIGURED", "admin") // "Rewind needs Redis (REDIS_URL)"
 * rewindInfraMessage("REDIS_NOT_CONFIGURED", "member") // "Rewind is not available on this server"
 * rewindInfraMessage("REDIS_UNAVAILABLE", "member") // "Rewind is temporarily unavailable. Try again in a few minutes."
 * ```
 */
export function rewindInfraMessage(code: RewindInfraCode, audience: "admin" | "member"): string {
  if (code === "REDIS_UNAVAILABLE") return "Rewind is temporarily unavailable. Try again in a few minutes."
  return audience === "admin" ? "Rewind needs Redis (REDIS_URL)" : "Rewind is not available on this server"
}
