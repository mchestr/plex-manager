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
 * - `RewindPanelCode`, the states `/rewind/<year>` shows on a status panel (P5.1);
 * - `SECRET_REQUIRED` from `lib/security/secret-reuse.ts` (a stored secret refused for a new address).
 *
 * {@link connectionTestCopy} maps a connection test's code to the field it
 * belongs to and an Alert with the fix (P10.20).
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
import { authErrorKind, type AuthErrorKind } from "@/lib/auth-errors"
import type { ErrorCode } from "@/lib/security/error-handler"
import type { SecretRequiredCode } from "@/lib/security/secret-reuse"
import type { ProbeFailureCode } from "@/lib/settings/connection-status"
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

type AppErrorCode = `${ErrorCode}` | RewindErrorCode | ActionErrorCode | FlashErrorCode | RewindPanelCode | SecretRequiredCode

interface ErrorCopy {
  title: string
  description: string
}

type Audience = "member" | "admin"

/** Each code's member copy, and admin copy where an admin can act on more. */
type CopyEntry = { member: ErrorCopy; admin?: ErrorCopy }

const GENERIC: ErrorCopy = {
  title: "Something went wrong on the server",
  description: "Try again. If the problem continues, tell the server admin.",
}

const SIGN_IN: CopyEntry = {
  member: { title: "Sign in again", description: "Your session has ended." },
}
const FORBIDDEN: CopyEntry = {
  member: { title: "You don't have access", description: "This page or action is for server admins only." },
}
const NOT_FOUND: CopyEntry = {
  member: { title: "Not found", description: "The link may be old, or someone may have deleted the item." },
}
const INVALID: CopyEntry = {
  member: { title: "Check what you entered", description: "Some values are not valid. Correct them and try again." },
}
const RATE_LIMITED: CopyEntry = {
  member: { title: "Too many tries", description: "Wait a few minutes, then try again." },
}
const INTERNAL: CopyEntry = { member: GENERIC }

const REWIND_TITLE = "Your Rewind couldn't be made"
const INTERRUPTED = "Your Rewind stopped before it was complete. Try again."

const rewind = (description: string): CopyEntry => ({ member: { title: REWIND_TITLE, description } })

const REWIND_UNAVAILABLE = "Rewind isn't available"
const infra = (code: RewindInfraCode): CopyEntry => ({
  member: { title: REWIND_UNAVAILABLE, description: rewindInfraMessage(code, "member") },
  admin: { title: REWIND_UNAVAILABLE, description: rewindInfraMessage(code, "admin") },
})

const DISCORD_NOT_LINKED = "Discord wasn't linked"
const discord = (description: string): CopyEntry => ({ member: { title: DISCORD_NOT_LINKED, description } })

const SIGN_IN_FAILED: CopyEntry = {
  member: { title: "Sign-in didn't work", description: "Try again. If it fails again, tell the server admin." },
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
      description: "Renew your subscription to continue.",
    },
  },
  CONFLICT: {
    member: { title: "Someone else changed this", description: "Reload the page and try again." },
  },
  UPSTREAM_UNAVAILABLE: {
    member: { title: "A connected service didn't answer", description: "Try again in a few minutes." },
    admin: {
      title: "A connected service didn't answer",
      description: "Check the Plex, Tautulli and Overseerr connections in Admin, Settings.",
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
  SETUP_UNCLAIMED: {
    member: {
      title: "Claim this server first",
      description: "Enter the setup code from the server log, or the value of SETUP_TOKEN, to continue setup.",
    },
  },
  INTERNAL,

  // lib/security/secret-reuse.ts: a blank secret refused for a new address (SEC-31)
  SECRET_REQUIRED: {
    member: {
      title: "Enter the key again",
      description: "The address changed. The saved key goes only to its original address.",
    },
  },

  // lib/wrapped/generation-errors.ts RewindErrorCode
  TAUTULLI_USER_NOT_FOUND: rewind(
    "Tautulli does not have your account yet. Ask the server admin to refresh the Tautulli user list."
  ),
  GENERATION_FAILED: rewind("An error stopped your Rewind. Try again."),
  TIMEOUT: rewind("Your Rewind took too long to make. Try again in a few minutes."),
  UPSTREAM_ERROR: rewind("The server could not read your watch history. Try again in a few minutes."),
  LLM_FAILED: rewind("The AI could not write your Rewind. Try again."),
  NOT_CONFIGURED: rewind("Rewind isn't fully set up on this server yet. Ask the server admin."),
  WORKER_LOST: rewind(INTERRUPTED),
  JOB_LOST: rewind(INTERRUPTED),
  REWIND_DISABLED: rewind("Rewind isn't open on this server yet."),
  NOT_IN_AUDIENCE: rewind("Rewind isn't open to everyone on this server yet."),
  NO_PLEX_IDENTITY: rewind("Rewind needs Plex watch history. Jellyfin support is planned."),
  MANAGED_ACCOUNT: rewind("Rewind isn't made for managed Plex accounts on this server."),
  JOINED_LATE: rewind("Your first Rewind arrives next year."),

  // RewindPanelCode: the /rewind/<year> status panels
  REWIND_GENERATING: {
    member: { title: "Setting your pages", description: "This page opens your Rewind when it is ready." },
  },
  REWIND_UNREADABLE: {
    member: {
      title: "Your Rewind couldn't be opened",
      description: "Part of it couldn't be read. Ask the server admin to make it again.",
    },
  },
  REWIND_NOT_FOUND: {
    member: { title: "No Rewind for this year", description: "Open another year from the Rewind page." },
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
  discord_failed: discord("Try again from the Discord page."),
  discord_expired: discord("The link expired. Try again from the Discord page."),
  discord_session_mismatch: discord("Use the same browser and account that you started with."),
  discord_rate_limited: {
    member: { title: "Too many Discord link attempts", description: "Wait a few minutes, then try again." },
  },
  discord_unavailable: {
    member: { title: "Discord linking is unavailable", description: "Try again in a few minutes." },
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
      description: "The sign-in settings on this server have a problem. Tell the server admin.",
    },
  },
  Verification: {
    member: { title: "That sign-in expired", description: "Sign in again." },
  },
  RateLimited: {
    member: { title: "Too many attempts", description: "Wait a few minutes, then sign in again." },
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
 * // "Your Rewind took too long to make. Try again in a few minutes."
 * errorCopy("Can't reach database server at db:5432", { audience: "admin" }).title
 * // "Something went wrong on the server"
 * ```
 */
export function errorCopy(code: unknown, { audience }: { audience: Audience }): ErrorCopy {
  if (!isKnownCode(code)) return GENERIC
  const entry: CopyEntry = COPY[code]
  return (audience === "admin" ? entry.admin : undefined) ?? entry.member
}

/** The admin gate's two denials (ui-design-system 6.7). */
const AUTH_COPY: Record<AuthErrorKind, ErrorCopy> = {
  unauthenticated: {
    title: "Sign in to continue",
    description: "Sign in with your Plex account to open the admin pages.",
  },
  forbidden: {
    title: "Admins only",
    description: "Your account is not an admin on this server.",
  },
}

/** The copy for one of the admin gate's denials. */
export function authCopy(kind: AuthErrorKind): ErrorCopy {
  return AUTH_COPY[kind]
}

/** What an error boundary shows: the auth denial it is, or the copy for its digest. */
interface BoundaryCopy extends ErrorCopy {
  /** `unauthenticated` or `forbidden` for the admin gate's errors, else null. */
  auth: AuthErrorKind | null
  /** The digest to show in mono, when the error has one. */
  code?: string
}

/**
 * The copy an `error.tsx` boundary renders (SEC-20, UI-19). The auth errors
 * are told apart by digest (`authErrorKind`), since a production build strips
 * their name and message; any other error gets the copy for its digest when
 * that is a known code, else "Something went wrong on the server". The message
 * is never read.
 *
 * @example
 * ```ts
 * boundaryCopy(Object.assign(new Error("x"), { digest: "PM_FORBIDDEN" })).title // "Admins only"
 * boundaryCopy(Object.assign(new Error("db:5432"), { digest: "abc123" })).code // "abc123"
 * boundaryCopy(new Error("db:5432")).title // "Something went wrong on the server"
 * ```
 */
export function boundaryCopy(error: Error & { digest?: string }): BoundaryCopy {
  const auth = authErrorKind(error)
  if (auth) return { auth, ...AUTH_COPY[auth] }
  const copy = errorCopy(error.digest, { audience: "member" })
  return error.digest ? { auth: null, ...copy, code: error.digest } : { auth: null, ...copy }
}

/** Why a connection test or a save's check failed (P10.20). */
export type ConnectionTestCode = ProbeFailureCode | SecretRequiredCode

export interface ConnectionTestCopy {
  /** The field the error belongs on. */
  field: "url" | "secret"
  /** The short line under that field. */
  fieldError: string
  /** The inline Alert: what happened, and the fix. */
  title: string
  fix: string
}

/**
 * A connection test's code as copy: a line for the URL or secret field and
 * an inline Alert with the fix. The tester's own message is never shown.
 *
 * @param noun - what the secret is called in this form ("API key", "Plex token")
 *
 * @example
 * ```ts
 * connectionTestCopy("NOT_FOUND").fieldError // "Nothing answered at this address"
 * connectionTestCopy("UNAUTHORIZED", "Plex token").field // "secret"
 * ```
 */
export function connectionTestCopy(code: ConnectionTestCode, noun = "API key"): ConnectionTestCopy {
  switch (code) {
    case "TIMEOUT":
      return {
        field: "url",
        fieldError: "Nothing answered within 5 seconds",
        title: "The server didn't answer in time",
        fix: "Check that it's running and that this server can reach the address.",
      }
    case "NOT_FOUND":
      return {
        field: "url",
        fieldError: "Nothing answered at this address",
        title: "Nothing answered at this address",
        fix: "Check the scheme, host and port, and that the service is running.",
      }
    case "UNREACHABLE":
      return {
        field: "url",
        fieldError: "Can't connect to this address",
        title: "Couldn't connect",
        fix: "Check the address and port, and any firewall or reverse proxy in between.",
      }
    case "UNAUTHORIZED":
      return {
        field: "secret",
        fieldError: `The server refused this ${noun}`,
        title: `The ${noun} was refused`,
        fix: `Copy the ${noun} again from the service's settings.`,
      }
    case "SECRET_REQUIRED":
      return {
        field: "secret",
        fieldError: `Enter the ${noun} again to use it with the new address`,
        title: `Enter the ${noun} again`,
        fix: `Plex Manager sends the saved ${noun} only to the address you saved it with.`,
      }
  }
}
