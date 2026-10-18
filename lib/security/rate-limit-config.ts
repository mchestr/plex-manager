/**
 * The named rate limits. Each name is also the key prefix in the limiter's
 * store, so the counts of different features never mix (`share:<ip>`,
 * `admin:<ip>`).
 *
 * This is a plain module with no `@/` imports and no `server-only`, so the
 * Playwright global setup can read the names to clear stale counters. The
 * limiter itself is `lib/security/rate-limit.ts`.
 *
 * Names are `feature` or `feature:scope`, such as `auth:jellyfin:user`.
 * Rewind limits start with `rw:`.
 *
 * @module lib/security/rate-limit-config
 */

const MINUTE = 60
const DAY = 24 * 60 * MINUTE

interface LimitConfig {
  /** Requests allowed per window. */
  points: number
  /** Window length in seconds. */
  duration: number
}

export const LIMITS = {
  share: { points: 100, duration: 15 * MINUTE },
  poster: { points: 500, duration: 15 * MINUTE },
  admin: { points: 50, duration: 15 * MINUTE },
  checkout: { points: 10, duration: MINUTE },
  portal: { points: 10, duration: MINUTE },
  "discord-link": { points: 5, duration: 5 * MINUTE },
  "auth:plex": { points: 20, duration: 15 * MINUTE },
  "auth:jellyfin:ip": { points: 10, duration: 15 * MINUTE },
  "auth:jellyfin:user": { points: 5, duration: 15 * MINUTE },
  "invite:validate": { points: 20, duration: 15 * MINUTE },
  "invite:redeem": { points: 10, duration: 15 * MINUTE },
  "plex:pin:create": { points: 30, duration: 10 * MINUTE },
  "plex:pin:poll": { points: 300, duration: 10 * MINUTE },
  "rw:share-actions": { points: 10, duration: 60 * MINUTE },
  "rw:share-page": { points: 60, duration: MINUTE },
  "rw:gen:burst": { points: 1, duration: 10 * MINUTE },
  "rw:gen:daily": { points: 3, duration: DAY },
} as const satisfies Record<string, LimitConfig>

export type LimitName = keyof typeof LIMITS
