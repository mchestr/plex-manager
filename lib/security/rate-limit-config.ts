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
const HOUR = 60 * MINUTE
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
  // A session's poster access checks (database and Plex lookups), cache hits included; a page of posters is a few dozen.
  "poster:access": { points: 2000, duration: 15 * MINUTE },
  admin: { points: 50, duration: 15 * MINUTE },
  // The command menu's search-as-you-type (P10.16); `admin` would throttle typing
  "admin:search": { points: 120, duration: MINUTE },
  // Test connection with typed values in settings and setup (P10.20), per admin
  "admin:test": { points: 30, duration: 10 * MINUTE },
  // Queue actions (retry, remove, pause, resume, sync) per admin (P11.5)
  "admin:queue": { points: 30, duration: MINUTE },
  // Invite create and delete per admin (P11.5)
  "admin:invites": { points: 30, duration: 10 * MINUTE },
  // Member removals per admin (P11.13)
  "admin:remove-member": { points: 10, duration: HOUR },
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
  "llm:models": { points: 30, duration: 15 * MINUTE },
  // Assistant messages per user (P4.20). The Discord pair is shared by DMs and `/assistant ask`.
  "llm:assistant:admin": { points: 60, duration: HOUR },
  "llm:discord:dm": { points: 20, duration: HOUR },
  "llm:discord:dm:day": { points: 100, duration: DAY },
  "discord:mystats": { points: 5, duration: HOUR },
  // The web "Force resync" button
  "discord:resync": { points: 3, duration: HOUR },
  // The member's "Sync Now" watchlist button (P4.13)
  "watchlist:manual": { points: 4, duration: HOUR },
  "rw:share-actions": { points: 10, duration: 60 * MINUTE },
  "rw:share-page": { points: 60, duration: MINUTE },
  // Card renders (cache misses only) per owner and per share link (P5.10)
  "rw:card:session": { points: 60, duration: MINUTE },
  "rw:card:share": { points: 30, duration: MINUTE },
  "rw:gen:burst": { points: 1, duration: 10 * MINUTE },
  "rw:gen:daily": { points: 3, duration: DAY },
  // View tracking per member (P7.14): one call per page reached in a session, plus shares
  "rw:view": { points: 120, duration: 15 * MINUTE },
  // Hide and unhide a title per member (P7.7)
  "rw:hide": { points: 20, duration: DAY },
  // Admin dry runs of the Rewind pipeline per admin (P7.10)
  "rw:dryrun": { points: 10, duration: 10 * MINUTE },
  // Rewind copy calls per LLM provider (design 9.4); the pipeline waits for a point
  "rw:llm": { points: 30, duration: MINUTE },
} as const satisfies Record<string, LimitConfig>

export type LimitName = keyof typeof LIMITS
