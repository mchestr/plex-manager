import "server-only"

import type { Session } from "next-auth"

import { AUTH_ERROR_DIGESTS, type AuthErrorKind } from "@/lib/auth-errors"
import { getSession } from "@/lib/data/session"
import { canEnterAdminArea, hasPermission, type Permission } from "@/lib/permissions"

export type AdminGate =
  | { ok: true; session: Session }
  | { ok: false; reason: "unauthenticated" | "forbidden" }

/**
 * The admin check without throwing, for `app/admin/layout.tsx`: it renders the
 * matching screen itself, so nothing depends on how a production build
 * rewrites thrown errors (BP-27).
 */
export async function getAdminGate(): Promise<AdminGate> {
  // The memoised read (DUP-06): the layout gate and every loader share one lookup
  const session = await getSession()
  if (!session?.user?.id) return { ok: false, reason: "unauthenticated" }
  if (!session.user.isAdmin) return { ok: false, reason: "forbidden" }
  return { ok: true, session }
}

/**
 * The gate for the admin area's layout: an admin, or a role that holds
 * `assistant:use` or `users:read`. Pages the role may not open check
 * themselves (`assertAdmin`, `assertPermission`).
 */
export async function getAdminAreaGate(): Promise<AdminGate> {
  const session = await getSession()
  if (!session?.user?.id) return { ok: false, reason: "unauthenticated" }
  return canEnterAdminArea(session.user) ? { ok: true, session } : { ok: false, reason: "forbidden" }
}

/** An auth error the error boundaries recognise by its digest (`lib/auth-errors.ts`). */
function accessError(kind: AuthErrorKind): Error & { digest: string } {
  const message = kind === "forbidden" ? "Admin access required" : "Authentication required"
  return Object.assign(new Error(message), { digest: AUTH_ERROR_DIGESTS[kind] })
}

/**
 * The first line of every admin loader in `lib/data/*` (P11.5, BP-06).
 *
 * A shared layout is not an authorisation boundary: on client navigation Next
 * renders the page without re-running the layout, so each loader checks next
 * to its data. Throws an error with the `PM_UNAUTHENTICATED` or
 * `PM_FORBIDDEN` digest, which the error boundaries render as the sign-in or
 * Unauthorized screen. Server Actions use `adminAction` instead, which returns
 * the same refusals as codes.
 */
export async function assertAdmin(): Promise<Session> {
  const gate = await getAdminGate()
  if (!gate.ok) throw accessError(gate.reason)
  return gate.session
}

/**
 * `assertAdmin` for a loader or page a role may also open: passes for an
 * admin and for a user whose role holds `permission`, with the same
 * `PM_UNAUTHENTICATED` and `PM_FORBIDDEN` errors otherwise.
 */
export async function assertPermission(permission: Permission): Promise<Session> {
  const session = await getSession()
  if (!session?.user?.id) throw accessError("unauthenticated")
  if (!hasPermission(session.user, permission)) throw accessError("forbidden")
  return session
}

/**
 * Server-side helper to get admin status without redirecting
 * Returns null if not authenticated, false if not admin, true if admin
 *
 * @internal
 */
export async function getAdminStatus(): Promise<boolean | null> {
  const session = await getSession()

  if (!session) {
    return null
  }

  return session.user.isAdmin
}
