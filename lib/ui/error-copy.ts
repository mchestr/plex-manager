/**
 * One map from error codes to the copy people see (SEC-20).
 *
 * ## Overview
 *
 * Member and admin surfaces never render `error.message`: it can carry a host,
 * a port, a stack or another member's details. They render the fixed copy this
 * module looks up from a code instead. The map covers:
 *
 * - `ErrorCode` from `lib/security/error-handler.ts` (API route errors);
 * - `RewindErrorCode` from `lib/wrapped/generation-errors.ts` (stored failures);
 * - `ActionErrorCode` from `lib/actions/result.ts` (Server Action results);
 * - `FlashErrorCode` from `lib/ui/flash-codes.ts` (redirects that carry a code);
 * - `RewindPanelCode`, the states `/rewind/<year>` shows on a status panel (P5.1).
 *
 * The map `satisfies Record<AppErrorCode, ...>`, so a new code without copy is
 * a type error. Anything that is not a known code, including an exception's
 * message or a digest, gets the generic copy and is never echoed.
 *
 * This module is imported by client components, so it imports only types
 * from server modules.
 *
 * @module lib/ui/error-copy
 */

import type { ActionErrorCode } from "@/lib/actions/result"
import type { ErrorCode } from "@/lib/security/error-handler"
import type { FlashErrorCode } from "@/lib/ui/flash-codes"
import { rewindInfraMessage, type RewindInfraCode } from "@/lib/rewind/infra-copy"
import type { RewindErrorCode } from "@/lib/wrapped/generation-errors"

/** What a Rewind status panel says when there is no issue to show (P5.1). */
export type RewindPanelCode =
  | "REWIND_GENERATING"
  | "REWIND_UNREADABLE"
  | "REWIND_NOT_FOUND"
  | "REWIND_NOT_MADE"
  | "REWIND_NOT_OPEN"
  | "REWIND_NOT_ELIGIBLE"
  | RewindInfraCode

type AppErrorCode = `${ErrorCode}` | RewindErrorCode | ActionErrorCode | FlashErrorCode | RewindPanelCode

interface ErrorCopy {
  title: string
  description: string
}

type Audience = "member" | "admin"

/** Each code's member copy, and admin copy where an admin can act on more. */
type CopyEntry = { member: ErrorCopy; admin?: ErrorCopy }

const GENERIC: ErrorCopy = {
  title: "Something went wrong on our side",
  description: "Please try again. If it keeps happening, let the server admin know.",
}

const SIGN_IN: CopyEntry = {
  member: { title: "Please sign in", description: "Your session has ended. Sign in again to continue." },
}
const FORBIDDEN: CopyEntry = {
  member: { title: "You don't have access", description: "This page or action is for server admins only." },
}
const NOT_FOUND: CopyEntry = {
  member: { title: "Not found", description: "We couldn't find what you were looking for. It may have been removed." },
}
const INVALID: CopyEntry = {
  member: { title: "Check what you entered", description: "Some of the details aren't valid. Fix them and try again." },
}
const RATE_LIMITED: CopyEntry = {
  member: { title: "Too many tries", description: "Please wait a few minutes, then try again." },
}
const INTERNAL: CopyEntry = { member: GENERIC }

const REWIND_TITLE = "Your Rewind couldn't be made"
const INTERRUPTED = "Making your Rewind was interrupted. Please try again."

const rewind = (description: string): CopyEntry => ({ member: { title: REWIND_TITLE, description } })

const REWIND_UNAVAILABLE = "Rewind isn't available"
const infra = (code: RewindInfraCode): CopyEntry => ({
  member: { title: REWIND_UNAVAILABLE, description: rewindInfraMessage(code, "member") },
  admin: { title: REWIND_UNAVAILABLE, description: rewindInfraMessage(code, "admin") },
})

const DISCORD_NOT_LINKED = "Discord wasn't linked"
const discord = (description: string): CopyEntry => ({ member: { title: DISCORD_NOT_LINKED, description } })

const SIGN_IN_FAILED: CopyEntry = {
  member: { title: "Sign-in didn't work", description: "We couldn't sign you in. Please try again." },
}

const COPY = {
  // lib/security/error-handler.ts ErrorCode
  INTERNAL_ERROR: INTERNAL,
  UNAUTHORIZED: SIGN_IN,
  NOT_FOUND,
  VALIDATION_ERROR: INVALID,
  RATE_LIMIT_EXCEEDED: RATE_LIMITED,
  FORBIDDEN,

  // lib/actions/result.ts ActionErrorCode (NOT_FOUND and FORBIDDEN are shared above)
  UNAUTHENTICATED: SIGN_IN,
  VALIDATION: INVALID,
  RATE_LIMITED,
  NOT_ENTITLED: {
    member: {
      title: "Your membership isn't active",
      description: "This needs an active membership. Renew your subscription to continue.",
    },
  },
  CONFLICT: {
    member: { title: "That changed in the meantime", description: "Someone else changed this first. Reload and try again." },
  },
  UPSTREAM_UNAVAILABLE: {
    member: { title: "A connected service didn't answer", description: "Please try again in a few minutes." },
    admin: {
      title: "A connected service didn't answer",
      description: "Plex, Tautulli, Overseerr or another service is unreachable. Check its connection in Settings.",
    },
  },
  INVITE_INVALID: {
    member: {
      title: "This invite can't be used",
      description: "The invite code is wrong, expired or used up. Ask the person who invited you for a new one.",
    },
  },
  INVITE_WRONG_SERVICE: {
    member: {
      title: "This invite is for the other media server",
      description: "Sign in with the service the invite names, Plex or Jellyfin, to use it.",
    },
  },
  INTERNAL,

  // lib/wrapped/generation-errors.ts RewindErrorCode
  TAUTULLI_USER_NOT_FOUND: rewind(
    "We couldn't find your account in Tautulli yet. Ask the server admin to refresh Tautulli's user list."
  ),
  GENERATION_FAILED: rewind("Something went wrong while generating your Wrapped. Please try again."),
  TIMEOUT: rewind("Making your Rewind took too long. Please try again in a few minutes."),
  UPSTREAM_ERROR: rewind("We couldn't read your watch history just now. Please try again in a few minutes."),
  LLM_FAILED: rewind("We couldn't write your Rewind this time. Please try again."),
  NOT_CONFIGURED: rewind("Rewind isn't fully set up on this server yet. Ask the server admin."),
  WORKER_LOST: rewind(INTERRUPTED),
  JOB_LOST: rewind(INTERRUPTED),

  // RewindPanelCode: the /rewind/<year> status panels
  REWIND_GENERATING: {
    member: { title: "Setting your pages", description: "Your Rewind is being made. This page opens it when it's ready." },
  },
  REWIND_UNREADABLE: {
    member: {
      title: "Your Rewind couldn't be opened",
      description: "Part of it couldn't be read. Ask the server admin to make it again.",
    },
  },
  REWIND_NOT_FOUND: {
    member: { title: "No Rewind for this year", description: "You don't have a Rewind for this year." },
  },
  REWIND_NOT_MADE: {
    member: { title: "Your Rewind isn't made yet", description: "Start it from the home page. It takes a few minutes." },
  },
  REWIND_NOT_OPEN: {
    member: { title: "Your Rewind isn't open yet", description: "It opens when the season starts on this server." },
  },
  REWIND_NOT_ELIGIBLE: {
    member: {
      title: "Rewind isn't available for your account",
      description: "Rewind needs Plex watch history. Jellyfin support is planned.",
    },
  },
  REDIS_NOT_CONFIGURED: infra("REDIS_NOT_CONFIGURED"),
  REDIS_UNAVAILABLE: infra("REDIS_UNAVAILABLE"),

  // lib/ui/flash-codes.ts FlashErrorCode: the Discord link routes
  discord_failed: discord("Something went wrong while linking. Please try again."),
  discord_expired: discord("That link expired. Start linking again."),
  discord_session_mismatch: discord("Finish linking in the browser and account you started in."),
  discord_rate_limited: {
    member: { title: "Too many Discord link attempts", description: "Please wait a few minutes, then try again." },
  },
  discord_unavailable: {
    member: { title: "Discord linking is unavailable", description: "Please try again in a few minutes." },
  },

  // lib/ui/flash-codes.ts FlashErrorCode: NextAuth's sign-in errors
  CredentialsSignin: SIGN_IN_FAILED,
  Default: SIGN_IN_FAILED,
  AccessDenied: {
    member: { title: "You don't have access", description: "This account isn't a member of this server." },
  },
  Configuration: {
    member: {
      title: "Sign-in isn't working",
      description: "Something is wrong with this server's sign-in settings. Let the server admin know.",
    },
  },
  Verification: {
    member: { title: "That sign-in expired", description: "Start signing in again." },
  },
} satisfies Record<AppErrorCode, CopyEntry>

function isKnownCode(code: unknown): code is AppErrorCode {
  return typeof code === "string" && Object.hasOwn(COPY, code)
}

/**
 * The title and description to show for an error code.
 *
 * @param code - a known code, or anything else (an unknown code, a digest, an
 *   exception's message), which gets the generic copy
 * @param options.audience - `admin` gets the admin copy where a code has one
 *
 * @example
 * ```ts
 * errorCopy("TIMEOUT", { audience: "member" }).description
 * // "Making your Rewind took too long. Please try again in a few minutes."
 * errorCopy("Can't reach database server at db:5432", { audience: "admin" }).title
 * // "Something went wrong on our side"
 * ```
 */
export function errorCopy(code: unknown, { audience }: { audience: Audience }): ErrorCopy {
  if (!isKnownCode(code)) return GENERIC
  const entry: CopyEntry = COPY[code]
  return (audience === "admin" ? entry.admin : undefined) ?? entry.member
}
