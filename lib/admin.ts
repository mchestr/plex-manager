import { getServerSession, type Session } from "next-auth"
import { authOptions } from "@/lib/auth"
import { AUTH_ERROR_DIGESTS } from "@/lib/auth-errors"

/**
 * Custom error class for unauthorized admin access
 *
 * @internal
 */
export class UnauthorizedAdminError extends Error {
  /** Kept by Next in production, unlike the name and message (BP-27). */
  readonly digest = AUTH_ERROR_DIGESTS.forbidden

  constructor(message: string = "Admin access required") {
    super(message)
    this.name = "UnauthorizedAdminError"
  }
}

/**
 * Custom error class for unauthenticated access
 *
 * @internal
 */
export class UnauthenticatedError extends Error {
  /** Kept by Next in production, unlike the name and message (BP-27). */
  readonly digest = AUTH_ERROR_DIGESTS.unauthenticated

  constructor(message: string = "Authentication required") {
    super(message)
    this.name = "UnauthenticatedError"
  }
}

export type AdminGate =
  | { ok: true; session: Session }
  | { ok: false; reason: "unauthenticated" | "forbidden" }

/**
 * The admin check without throwing, for `app/admin/layout.tsx`: it renders the
 * matching screen itself, so nothing depends on how a production build
 * rewrites thrown errors (BP-27).
 */
export async function getAdminGate(): Promise<AdminGate> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return { ok: false, reason: "unauthenticated" }
  if (!session.user.isAdmin) return { ok: false, reason: "forbidden" }
  return { ok: true, session }
}

/**
 * Server-side helper to check if the current user is an admin, for the admin
 * actions until P11.5 moves them onto `adminAction`.
 * Throws UnauthenticatedError if not authenticated and UnauthorizedAdminError
 * if not admin; both carry a stable `digest` the error boundaries read.
 * Returns the session if admin
 */
export async function requireAdmin() {
  const session = await getServerSession(authOptions)

  if (!session) {
    throw new UnauthenticatedError("UNAUTHENTICATED")
  }

  if (!session.user.isAdmin) {
    throw new UnauthorizedAdminError("UNAUTHORIZED")
  }

  return session
}

/**
 * Server-side helper to get admin status without redirecting
 * Returns null if not authenticated, false if not admin, true if admin
 *
 * @internal
 */
export async function getAdminStatus(): Promise<boolean | null> {
  const session = await getServerSession(authOptions)

  if (!session) {
    return null
  }

  return session.user.isAdmin
}
