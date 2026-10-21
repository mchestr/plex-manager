import { createHash } from "node:crypto"

import { getAccessLevel, type AccessLevel } from "@/lib/access"
import { checkUserServerAccess, getPlexUserInfo } from "@/lib/connections/plex"
import { waitForInvitedAccess } from "@/lib/connections/plex-access-wait"
import { readPin } from "@/lib/connections/plex-pin"
import { getEnv, usesSecureCookies } from "@/lib/env"
import { redeemPlexInvite } from "@/lib/invites/plex-redemption"
import { authenticateJellyfin } from "@/lib/jellyfin-auth"
import { PLEX_PIN_COOKIE, readPinCookie } from "@/lib/plex-pin-cookie"
import { prisma } from "@/lib/prisma"
import { isUniqueEmailConflict } from "@/lib/prisma-errors"
import { consume, reward } from "@/lib/security/rate-limit"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { readCookie } from "@/lib/security/signed-cookie"
import { SessionRevokedError } from "@/lib/session-revocation"
import { createLogger } from "@/lib/utils/logger"
import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"

const logger = createLogger("AUTH")

/**
 * How often the JWT callback re-reads a user's admin status, session version
 * and disabled flag from the database. Bounds how long a revoked (or newly
 * granted) privilege, or an ended session, can lag behind the DB for an
 * already-signed-in session. 5 minutes balances freshness against per-request
 * DB load (only one query per user per interval).
 */
const ADMIN_RECHECK_INTERVAL_MS = 5 * 60 * 1000

/**
 * The member's access level for the session token's `accessLevel` claim, which
 * `proxy.ts` reads to keep lapsed members on the read-only Rewind pages
 * (P4.5). `undefined` when the read fails: the proxy then decides nothing and
 * the `(app)` layout's own check still runs.
 */
async function readAccessLevel(userId: string): Promise<AccessLevel | undefined> {
  try {
    return await getAccessLevel(userId)
  } catch (error) {
    logger.warn("Failed to read the access level for the session token", { userId, error })
    return undefined
  }
}

/**
 * The `auth:jellyfin:user` subject for a submitted username.
 *
 * Jellyfin matches usernames case-insensitively by upper-casing them (.NET
 * `OrdinalIgnoreCase`), so the name is upper-cased before it is lower-cased:
 * "admın" (dotless i) and "ſam" (long s) reach the same accounts as "admin"
 * and "sam" and must share their budget. The hash keeps the Redis key short
 * however long the submitted name is.
 */
function jellyfinUsernameSubject(username: string): string {
  return createHash("sha256").update(username.trim().toUpperCase().toLowerCase()).digest("hex")
}

/**
 * Runs a Plex sign-in's `User` write with the member's Plex email, and once
 * more without it when another row already holds that address (SEC-08).
 *
 * Rows are matched by `plexUserId`, so a row holding the address is someone
 * else's: an old release stored Jellyfin usernames as emails, and a Plex email
 * can go stale after a change on plex.tv. Without the retry the unique email
 * would refuse the sign-in every time. On the retry a new row gets no email and
 * an existing row keeps the one it has.
 *
 * `write` builds a new data object on each call, because the encryption
 * extension in lib/prisma.ts rewrites `plexAuthToken` in the object it is given.
 */
async function writeWithPlexEmail<T>(
  plexUser: { id: string; email: string },
  write: (email: { email?: string }) => Promise<T>
): Promise<T> {
  try {
    return await write({ email: plexUser.email })
  } catch (error) {
    if (!isUniqueEmailConflict(error)) {
      throw error
    }
    const existingUser = await prisma.user.findUnique({
      where: { email: plexUser.email },
      select: { id: true },
    })
    logger.warn("auth.email_conflict", {
      existingUserId: existingUser?.id ?? null,
      plexUserId: plexUser.id,
    })
    return write({})
  }
}

/**
 * The Plex sign-in this browser started: the PIN in its signed `pm-plex-pin`
 * cookie, and the account token plex.tv issued for that PIN (SEC-11). The
 * token is read here, on the server, so it never passes through the browser,
 * and a request without the cookie (another browser, or one whose 15 minutes
 * ran out) cannot finish anyone's sign-in. Throws a `PlexSignInCode`.
 */
async function readPlexSignIn(
  headers: Record<string, unknown> | undefined
): Promise<{ authToken: string; inviteCode?: string }> {
  const cookieHeader = typeof headers?.cookie === "string" ? headers.cookie : undefined
  const pin = readPinCookie(readCookie(cookieHeader, PLEX_PIN_COOKIE))
  if (!pin) {
    logger.warn("auth.plex_pin_missing")
    throw new Error("plex_pin_expired")
  }

  const status = await readPin(pin.pinId, pin.code, pin.clientId)
  if (status.status !== "ready") {
    logger.warn("auth.plex_pin_not_ready", { status: status.status })
    throw new Error(status.status === "unavailable" ? "sign_in_failed" : "plex_pin_expired")
  }
  return { authToken: status.authToken, inviteCode: pin.inviteCode }
}

/** Errors the Plex `authorize` passes on to the callback page, which maps them to its codes. */
const PLEX_SIGN_IN_ERRORS = new Set(["access_denied", "NO_SERVER_CONFIGURED"])

export const authOptions: NextAuthOptions = {
  // NOTE: PrismaAdapter is not compatible with CredentialsProvider
  // We use JWT strategy instead for Plex authentication
  providers: [
    CredentialsProvider({
      id: "plex",
      name: "Plex",
      // Nothing is read from the request body: a token sent there is ignored.
      credentials: {},
      async authorize(_credentials, req) {
        const { authToken, inviteCode } = await readPlexSignIn(req?.headers)

        // The invite is redeemed here, on the server, with the token plex.tv
        // issued (P4.12's service check included); it is idempotent per account.
        if (inviteCode) {
          const redeemed = await redeemPlexInvite(inviteCode, authToken)
          if (!redeemed.success) {
            logger.warn("auth.plex_invite_refused", { code: redeemed.code })
            const invalid = redeemed.code === "INVITE_INVALID" || redeemed.code === "INVITE_WRONG_SERVICE"
            throw new Error(invalid ? "invite_invalid" : "sign_in_failed")
          }
        }

        try {
          // Fetch user info from Plex API
          const userInfoResult = await getPlexUserInfo(authToken)
          if (!userInfoResult.success || !userInfoResult.data) {
            logger.error("Failed to fetch user", undefined, { error: userInfoResult.error })
            return null
          }

          const plexUser = userInfoResult.data

          // Get the configured Plex server
          const plexServer = await prisma.plexServer.findFirst({
            where: { isActive: true },
          })

          if (!plexServer) {
            logger.error("No active Plex server configured")
            throw new Error("NO_SERVER_CONFIGURED")
          }

          // Check if user has access to the configured Plex server
          // Use the server's admin token to check if the user exists in the server's user list
          // Also check if the user is the admin (admin users may not be in the user list)
          // A member who just redeemed an invite waits for plex.tv to propagate the share.
          const serverConfig = {
            url: plexServer.url,
            token: plexServer.token,
            adminPlexUserId: plexServer.adminPlexUserId,
          }
          const accessCheck = inviteCode
            ? await waitForInvitedAccess(serverConfig, plexUser.id)
            : await checkUserServerAccess(serverConfig, plexUser.id)

          if (!accessCheck.success) {
            // A failed access check (Plex/API error) is always fatal, regardless
            // of the Stripe flag — we must not silently admit a user when we could
            // not actually determine their access.
            logger.warn("Plex user access check failed", {
              plexUserId: plexUser.id,
              username: plexUser.username,
              // Email is automatically sanitized by logger in production
              serverUrl: plexServer.url,
              reason: accessCheck.error || "Access check failed",
            })
            throw new Error("access_denied")
          }

          if (!accessCheck.hasAccess) {
            // Clean "no access" result. Only relax the deny when the Stripe
            // subscription flow is enabled — then the user is allowed to create a
            // session and is gated to /subscribe by the (app) layout guard.
            // When disabled (the default) behavior is identical to today.
            const config = await prisma.config.findUnique({
              where: { id: "config" },
              select: { stripeEnabled: true },
            })

            if (!config?.stripeEnabled) {
              logger.warn("Plex user denied access", {
                plexUserId: plexUser.id,
                username: plexUser.username,
                // Email is automatically sanitized by logger in production
                serverUrl: plexServer.url,
                reason: accessCheck.error || "No access to server",
              })
              throw new Error("access_denied")
            }

            logger.info("Plex non-member allowed session (Stripe gating enabled)", {
              plexUserId: plexUser.id,
              username: plexUser.username,
              serverUrl: plexServer.url,
            })
          }

          // The server owner is always an admin. Everyone else keeps the role
          // stored on their row, so a role set in the UI survives the next
          // login (SEC-12): login only ever promotes.
          const isOwner = plexServer.adminPlexUserId === plexUser.id

          // Find or create user
          let dbUser = await prisma.user.findUnique({
            where: { plexUserId: plexUser.id },
          })

          if (dbUser?.disabledAt) {
            logger.warn("auth.disabled", { userId: dbUser.id, provider: "plex" })
            return null
          }

          if (!dbUser) {
            const isAdmin = isOwner
            // Create new user
            dbUser = await writeWithPlexEmail(plexUser, (email) =>
              prisma.user.create({
                data: {
                  plexUserId: plexUser.id,
                  plexAuthToken: authToken, // Store for watchlist sync
                  name: plexUser.username,
                  ...email,
                  image: plexUser.thumb,
                  isAdmin,
                },
              })
            )

            // Audit log: New user created
            if (isAdmin) {
              logAuditEvent(AuditEventType.USER_CREATED, dbUser.id, {
                isAdmin: true,
                plexUserId: plexUser.id,
              })
            }
          } else {
            const promotesOwner = isOwner && !dbUser.isAdmin

            // Update existing user info; admin status only ever goes up
            const userId = dbUser.id
            dbUser = await writeWithPlexEmail(plexUser, (email) =>
              prisma.user.update({
                where: { id: userId },
                data: {
                  plexAuthToken: authToken, // Update token on each login for watchlist sync
                  name: plexUser.username,
                  ...email,
                  image: plexUser.thumb,
                  ...(promotesOwner && { isAdmin: true }),
                },
              })
            )

            if (promotesOwner) {
              logAuditEvent(AuditEventType.ADMIN_PRIVILEGE_GRANTED, dbUser.id, {
                targetUserId: dbUser.id,
                previousAdminStatus: false,
                newAdminStatus: true,
                plexUserId: plexUser.id,
                reason: "server_owner",
              })
            }
          }

          return {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            image: dbUser.image,
            isAdmin: dbUser.isAdmin,
            sessionVersion: dbUser.sessionVersion,
          }
        } catch (error) {
          logger.error("Error authenticating user", error)
          // Re-throw access denied errors so the callback page can show them
          if (error instanceof Error && PLEX_SIGN_IN_ERRORS.has(error.message)) {
            throw error
          }
          return null
        }
      },
    }),
    CredentialsProvider({
      id: "jellyfin",
      name: "Jellyfin",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null
        }

        const { username, password } = credentials

        // Per-username limit, checked before Jellyfin sees the attempt, so
        // password guessing spread over many addresses still stops here. A
        // correct password refunds its point, so only failures count.
        const usernameSubject = jellyfinUsernameSubject(username)
        const limit = await consume("auth:jellyfin:user", usernameSubject)
        if (!limit.ok) {
          logger.warn("Jellyfin sign-in rate-limited", { username })
          throw new Error("RATE_LIMITED")
        }

        try {
          // authenticateJellyfin refuses before Jellyfin sees the password
          // when no server is active or "Allow Jellyfin sign-in" is off
          // (hiding the button alone would leave this callback open), and
          // checks the password and the admin status against one read of the
          // stored server.
          const authResult = await authenticateJellyfin(username, password)

          if (!authResult.success || !authResult.data) {
            logger.warn("Jellyfin authentication failed", {
              username,
              error: authResult.error,
            })
            return null
          }

          await reward("auth:jellyfin:user", usernameSubject)

          const jellyfinUser = authResult.data
          // Jellyfin has no server owner, so its administrators stay the
          // promotion source. Login promotes on "admin" and never demotes: app
          // admins demote members in the UI, and a failed lookup ("unknown")
          // keeps the stored role (GAP-26).
          const isJellyfinAdmin = jellyfinUser.adminStatus === "admin"

          // Match only by Jellyfin user ID. Jellyfin users can rename
          // themselves to any string, an email address included, so the
          // username never links to, or is stored as the email of, any row.
          let dbUser = await prisma.user.findUnique({
            where: { jellyfinUserId: jellyfinUser.id },
          })

          if (dbUser?.disabledAt) {
            logger.warn("auth.disabled", { userId: dbUser.id, provider: "jellyfin" })
            return null
          }

          if (!dbUser) {
            const isAdmin = isJellyfinAdmin
            dbUser = await prisma.user.create({
              data: {
                jellyfinUserId: jellyfinUser.id,
                name: jellyfinUser.username,
                isAdmin,
                primaryAuthService: "jellyfin",
                onboardingStatus: { plex: false, jellyfin: false },
              },
            })

            logger.info("Created new Jellyfin user", {
              userId: dbUser.id,
              jellyfinUserId: jellyfinUser.id,
              username: jellyfinUser.username,
              isAdmin,
            })

            // Audit log: New user created
            if (isAdmin) {
              logAuditEvent(AuditEventType.USER_CREATED, dbUser.id, {
                isAdmin: true,
                jellyfinUserId: jellyfinUser.id,
                authService: "jellyfin",
              })
            }
          } else {
            const promotes = isJellyfinAdmin && !dbUser.isAdmin

            // Update existing user; admin status only ever goes up
            dbUser = await prisma.user.update({
              where: { id: dbUser.id },
              data: {
                name: jellyfinUser.username,
                ...(promotes && { isAdmin: true }),
              },
            })

            if (promotes) {
              logAuditEvent(AuditEventType.ADMIN_PRIVILEGE_GRANTED, dbUser.id, {
                targetUserId: dbUser.id,
                previousAdminStatus: false,
                newAdminStatus: true,
                jellyfinUserId: jellyfinUser.id,
                authService: "jellyfin",
              })
            }
          }

          return {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            image: dbUser.image,
            isAdmin: dbUser.isAdmin,
            sessionVersion: dbUser.sessionVersion,
          }
        } catch (error) {
          logger.error("Error authenticating Jellyfin user", error)
          return null
        }
      },
    }),
  ],
  secret: getEnv().NEXTAUTH_SECRET,
  // Set explicitly (SEC-09), the same as NextAuth inferred it from NEXTAUTH_URL,
  // so the `__Secure-` cookie names of existing sessions do not change.
  useSecureCookies: usesSecureCookies(),
  pages: {
    signIn: "/",
    // NextAuth's non-sign-in errors (Configuration, AccessDenied, Verification, RateLimited) land on a StatusScreen
    error: "/auth/error",
  },
  logger: {
    error(code, metadata) {
      // A revoked session (SEC-10) is expected, and the jwt callback already
      // logged it as `auth.session_revoked`; next-auth would print its stack
      // on every request until the cookie is cleared.
      if (code === "JWT_SESSION_ERROR" && metadata instanceof Error && metadata.name === "SessionRevokedError") {
        return
      }
      logger.error(`next-auth.${code}`, metadata)
    },
  },
  session: {
    strategy: "jwt",
    // Cap session lifetime at 7 days instead of NextAuth's 30-day default, so a
    // stale token (e.g. a revoked admin) cannot persist for a month even in the
    // worst case. The jwt callback below refreshes admin status far sooner.
    maxAge: 7 * 24 * 60 * 60,
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
        session.user.name = token.name as string
        session.user.email = token.email as string
        session.user.image = token.picture as string
        session.user.isAdmin = token.isAdmin as boolean
      } else {
        logger.warn('Session callback - missing token.sub or session.user', {
          hasTokenSub: !!token.sub,
          hasSessionUser: !!session.user
        })
      }
      return session
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        // The NextAuth `User` type is augmented with `isAdmin` in
        // types/next-auth.d.ts, so no cast is needed. Email is omitted from the
        // log to avoid writing PII to logs.
        logger.debug('JWT callback - user signed in', {
          userId: user.id,
          isAdmin: user.isAdmin
        })
        // Store user info in JWT when user first signs in
        token.sub = user.id
        token.name = user.name
        token.email = user.email
        token.picture = user.image
        token.isAdmin = user.isAdmin || false
        token.sv = user.sessionVersion
        token.accessLevel = await readAccessLevel(user.id)
        token.checkedAt = Date.now()
        return token
      }

      // On subsequent requests the JWT is stateless, so isAdmin would otherwise
      // never update. Periodically (or when the client calls session.update())
      // re-read the DB so privilege changes take effect within a bounded window
      // rather than at token expiry.
      const isStale =
        !token.checkedAt || Date.now() - token.checkedAt > ADMIN_RECHECK_INTERVAL_MS
      if (!token.sub || (trigger !== "update" && !isStale)) {
        return token
      }

      const userId = token.sub
      let dbUser
      try {
        dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { isAdmin: true, sessionVersion: true, disabledAt: true },
        })
      } catch (error) {
        // On DB error, keep the existing token rather than logging the user
        // out; the next request will retry the refresh.
        logger.warn("Failed to refresh admin status in JWT callback", { error })
        return token
      }

      // Throwing is how a session ends (SEC-10): next-auth's session route
      // then clears the cookie and answers `{}`, and getServerSession returns
      // null. An emptied token would still yield a session object. Tokens
      // issued before sessionVersion existed carry no `sv` and count as 0.
      if (!dbUser) {
        logger.info("auth.session_revoked", { userId, reason: "missing-user" })
        throw new SessionRevokedError("missing-user")
      }
      if (dbUser.disabledAt) {
        logger.info("auth.session_revoked", { userId, reason: "disabled" })
        throw new SessionRevokedError("disabled")
      }
      if ((token.sv ?? 0) !== dbUser.sessionVersion) {
        logger.info("auth.session_revoked", { userId, reason: "version-mismatch" })
        throw new SessionRevokedError("version-mismatch")
      }

      if (dbUser.isAdmin !== token.isAdmin) {
        logger.info("Refreshed admin status from database", {
          userId,
          previousAdminStatus: token.isAdmin,
          newAdminStatus: dbUser.isAdmin,
        })
      }
      token.isAdmin = dbUser.isAdmin
      token.accessLevel = (await readAccessLevel(userId)) ?? token.accessLevel
      token.checkedAt = Date.now()
      return token
    },
  },
}

