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
 * - the `ActionErrorCode` names that P4.3's action helper returns.
 *
 * The map `satisfies Record<AppErrorCode, ...>`, so a new code without copy is
 * a type error. Anything that is not a known code, including an exception's
 * message or a digest, gets the generic copy and is never echoed.
 *
 * This module is imported by client components, so it stays free of
 * server-only imports.
 *
 * @module lib/ui/error-copy
 */

import type { ErrorCode } from "@/lib/security/error-handler"
import type { RewindErrorCode } from "@/lib/wrapped/generation-errors"

/**
 * P4.3's planned codes (plan step P4.3). When `lib/actions/result.ts` lands,
 * this becomes `import type { ActionErrorCode } from "@/lib/actions/result"`.
 */
type ActionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "NOT_ENTITLED"
  | "CONFLICT"
  | "UPSTREAM_UNAVAILABLE"
  | "INTERNAL"

type AppErrorCode = `${ErrorCode}` | RewindErrorCode | ActionErrorCode

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

const COPY = {
  // lib/security/error-handler.ts ErrorCode
  INTERNAL_ERROR: INTERNAL,
  UNAUTHORIZED: SIGN_IN,
  NOT_FOUND,
  VALIDATION_ERROR: INVALID,
  RATE_LIMIT_EXCEEDED: RATE_LIMITED,
  FORBIDDEN,

  // P4.3's ActionErrorCode (NOT_FOUND and FORBIDDEN are shared above)
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
