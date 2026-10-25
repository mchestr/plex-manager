/**
 * Decides whether the Discord bot may log in (gateway IDENTIFY) right now.
 *
 * Discord resets a bot's token after about 1000 IDENTIFYs in 24 hours, so a
 * login loop takes the bot down until an admin pastes a new token. The guard
 * stands between the bot and `client.login()` with three rules:
 *
 * 1. **Fatal errors stop retries.** A rejected token or disallowed intents will
 *    fail the same way every time, so the guard blocks until the token changes.
 * 2. **Backoff.** Any other failure waits 30 s, doubling to 30 min, with jitter.
 *    A stable READY resets it.
 * 3. **Daily cap.** At most {@link DAILY_LOGIN_CAP} logins in a rolling 24 hours,
 *    counted in the {@link LoginLedger} so the count survives restarts.
 *
 * @module lib/discord/login-guard
 */

import type { LoginLedger } from "@/lib/discord/login-ledger"

/** @internal */
export const BACKOFF_BASE_MS = 30 * 1000
/** @internal */
export const BACKOFF_MAX_MS = 30 * 60 * 1000
/** Well under Discord's ~1000 a day. @internal */
export const DAILY_LOGIN_CAP = 100

/** `error.code` values discord.js uses for a token or intents Discord will keep rejecting. */
const FATAL_ERROR_CODES = new Set(["TokenInvalid", "TokenMissing", "DisallowedIntents", "InvalidIntents"])
/** Gateway close codes: authentication failed, invalid intents, disallowed intents. */
export const FATAL_CLOSE_CODES: ReadonlySet<number> = new Set([4004, 4013, 4014])

/** Whether Discord will reject this login the same way again until the config changes. @internal */
export function isFatalLoginError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const { code, status } = error as { code?: unknown; status?: unknown }
  if (status === 401) return true
  if (typeof code === "string") return FATAL_ERROR_CODES.has(code)
  return typeof code === "number" && FATAL_CLOSE_CODES.has(code)
}

/** Delay before attempt number `failures + 1`: 30 s, 60 s, ... up to 30 min, with 0-25% jitter on top. @internal */
export function backoffMs(failures: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1))
  return Math.min(BACKOFF_MAX_MS, Math.round(base * (1 + random() * 0.25)))
}

export type BlockedVerdict = { allowed: false; reason: "fatal" | "backoff" | "daily_cap"; retryAt: number | null }
export type LoginVerdict = { allowed: true } | BlockedVerdict

export class LoginGuard {
  private failures = 0
  private nextAttemptAt = 0
  private fatalFor: string | null = null

  constructor(
    private readonly ledger: Pick<LoginLedger, "count" | "record">,
    private readonly now: () => number = Date.now,
    private readonly random: () => number = Math.random
  ) {}

  /**
   * @param tokenId - Identifies the token (not the token itself); a different
   *   one lifts a fatal block, since an admin has pasted a new token.
   */
  async check(tokenId: string): Promise<LoginVerdict> {
    if (this.fatalFor !== null) {
      if (this.fatalFor === tokenId) return { allowed: false, reason: "fatal", retryAt: null }
      this.reset()
    }
    const now = this.now()
    if (now < this.nextAttemptAt) return { allowed: false, reason: "backoff", retryAt: this.nextAttemptAt }
    if ((await this.ledger.count(now)) >= DAILY_LOGIN_CAP) {
      return { allowed: false, reason: "daily_cap", retryAt: null }
    }
    return { allowed: true }
  }

  /** Counts the login against the day's cap; call it before `client.login()`. */
  async recordAttempt(): Promise<void> {
    await this.ledger.record(this.now())
  }

  /** Returns the verdict the failure leads to: fatal, or the backoff before the next try. */
  recordFailure(error: unknown, tokenId: string): BlockedVerdict {
    if (isFatalLoginError(error)) {
      this.fatalFor = tokenId
      return { allowed: false, reason: "fatal", retryAt: null }
    }
    this.failures += 1
    this.nextAttemptAt = this.now() + backoffMs(this.failures, this.random)
    return { allowed: false, reason: "backoff", retryAt: this.nextAttemptAt }
  }

  /** A close code the gateway will not recover from (4004, 4013, 4014). */
  recordFatalClose(tokenId: string): void {
    this.fatalFor = tokenId
  }

  /** The bot reached a stable READY. */
  recordReady(): void {
    this.failures = 0
    this.nextAttemptAt = 0
  }

  private reset(): void {
    this.failures = 0
    this.nextAttemptAt = 0
    this.fatalFor = null
  }
}
