import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

/**
 * Custom error class for unauthorized admin access
 *
 * @internal
 */
export class UnauthorizedAdminError extends Error {
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
  constructor(message: string = "Authentication required") {
    super(message)
    this.name = "UnauthenticatedError"
  }
}

/**
 * Server-side helper to check if the current user is an admin
 * Throws UnauthenticatedError if not authenticated (caught by error boundary)
 * Throws UnauthorizedAdminError if not admin (caught by error boundary)
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
