import { createHash } from "node:crypto"

import { checkUserServerAccess, getPlexUserInfo } from "@/lib/connections/plex"
import { authenticateJellyfin, isJellyfinAdmin } from "@/lib/jellyfin-auth"
import { prisma } from "@/lib/prisma"
import { isUniqueEmailConflict } from "@/lib/prisma-errors"
import { consume, reward } from "@/lib/security/rate-limit"
import { isE2ETestMode } from "@/lib/security/test-mode"
import { createLogger } from "@/lib/utils/logger"
import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"

const logger = createLogger("AUTH")

/**
 * How often the JWT callback re-reads a user's admin status from the database.
 * Bounds how long a revoked (or newly granted) admin privilege can lag behind
 * the DB for an already-signed-in session. 5 minutes balances freshness against
 * per-request DB load (only one query per user per interval).
 */
const ADMIN_RECHECK_INTERVAL_MS = 5 * 60 * 1000

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

export const authOptions: NextAuthOptions = {
  // NOTE: PrismaAdapter is not compatible with CredentialsProvider
  // We use JWT strategy instead for Plex authentication
  providers: [
    CredentialsProvider({
      id: "plex",
      name: "Plex",
      credentials: {
        authToken: {
          label: "Plex Auth Token",
          type: "text",
        },
      },
      async authorize(credentials) {
        // TEST MODE BYPASS
        // Only active with the server-only E2E_TEST_MODE=true, and never in
        // production. NODE_ENV=test alone does not enable it. The server logs
        // a warning at startup when it is on (lib/instrumentation/node.ts).
        // Server auth does NOT read NEXT_PUBLIC_ENABLE_TEST_AUTH: that flag is
        // bundled into client JS and only lets the callback page present the
        // test token.
        const isTestMode = isE2ETestMode()

        if (isTestMode && credentials?.authToken) {
          logger.debug('Test mode active', {
            hasToken: !!credentials.authToken,
            nodeEnv: process.env.NODE_ENV,
          })

          if (credentials.authToken === 'TEST_ADMIN_TOKEN') {
             // Return the seeded admin user
             logger.debug('Looking up admin test user')
             try {
               const adminUser = await prisma.user.findUnique({
                 where: { email: 'admin@example.com' }
               })

               if (adminUser && adminUser.isAdmin) {
                 logger.debug('Admin test user found', { email: adminUser.email })
                 const userData = {
                   id: adminUser.id,
                   email: adminUser.email,
                   name: adminUser.name,
                   image: adminUser.image,
                   isAdmin: true,
                 }
                 return userData
               } else {
                 logger.error('Admin test user not found or not admin', { hasUser: !!adminUser })
                 return null
               }
             } catch (error) {
               logger.error('Error looking up admin user', error)
               return null
             }
          }

          if (credentials.authToken === 'TEST_REGULAR_TOKEN') {
             // Return the seeded regular user
             logger.debug('Looking up regular test user')
             try {
               const regularUser = await prisma.user.findUnique({
                 where: { email: 'regular@example.com' }
               })

               if (regularUser) {
                 logger.debug('Regular test user found', { email: regularUser.email })
                 const userData = {
                   id: regularUser.id,
                   email: regularUser.email,
                   name: regularUser.name,
                   image: regularUser.image,
                   isAdmin: regularUser.isAdmin,
                 }
                 return userData
               } else {
                 logger.error('Regular test user not found')
                 return null
               }
             } catch (error) {
               logger.error('Error looking up regular user', error)
               return null
             }
          }

          // If test mode but unrecognized token, fail
          logger.error('Test mode active but unrecognized test token')
          return null
        }

        if (!credentials?.authToken) {
          return null
        }

        const { authToken } = credentials

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
          const accessCheck = await checkUserServerAccess(
            {
              url: plexServer.url,
              token: plexServer.token,
              adminPlexUserId: plexServer.adminPlexUserId,
            },
            plexUser.id
          )

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
            throw new Error("ACCESS_DENIED")
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
              throw new Error("ACCESS_DENIED")
            }

            logger.info("Plex non-member allowed session (Stripe gating enabled)", {
              plexUserId: plexUser.id,
              username: plexUser.username,
              serverUrl: plexServer.url,
            })
          }

          // Check if this user is the admin by comparing Plex user IDs
          const isAdmin = plexServer.adminPlexUserId === plexUser.id

          // Find or create user
          let dbUser = await prisma.user.findUnique({
            where: { plexUserId: plexUser.id },
          })

          if (!dbUser) {
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
              const { logAuditEvent, AuditEventType } = await import("@/lib/security/audit-log")
              logAuditEvent(AuditEventType.USER_CREATED, dbUser.id, {
                isAdmin: true,
                plexUserId: plexUser.id,
              })
            }
          } else {
            // Check if admin status changed
            const adminStatusChanged = dbUser.isAdmin !== isAdmin

            // Update existing user info and admin status
            const userId = dbUser.id
            dbUser = await writeWithPlexEmail(plexUser, (email) =>
              prisma.user.update({
                where: { id: userId },
                data: {
                  plexAuthToken: authToken, // Update token on each login for watchlist sync
                  name: plexUser.username,
                  ...email,
                  image: plexUser.thumb,
                  isAdmin,
                },
              })
            )

            // Audit log: Admin privilege change
            if (adminStatusChanged) {
              const { logAuditEvent, AuditEventType } = await import("@/lib/security/audit-log")
              logAuditEvent(
                isAdmin ? AuditEventType.ADMIN_PRIVILEGE_GRANTED : AuditEventType.ADMIN_PRIVILEGE_REVOKED,
                dbUser.id,
                {
                  targetUserId: dbUser.id,
                  previousAdminStatus: !isAdmin,
                  newAdminStatus: isAdmin,
                  plexUserId: plexUser.id,
                }
              )
            }
          }

          return {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            image: dbUser.image,
            isAdmin: dbUser.isAdmin,
          }
        } catch (error) {
          logger.error("Error authenticating user", error)
          // Re-throw access denied errors so they can be handled specially
          if (error instanceof Error && (error.message === "ACCESS_DENIED" || error.message === "NO_SERVER_CONFIGURED")) {
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
          // Get the configured Jellyfin server
          const jellyfinServer = await prisma.jellyfinServer.findFirst({
            where: { isActive: true },
          })

          if (!jellyfinServer) {
            logger.error("No active Jellyfin server configured")
            throw new Error("NO_SERVER_CONFIGURED")
          }

          // "Allow Jellyfin sign-in" is off: refuse before Jellyfin sees the
          // password. Hiding the button alone would leave this callback open.
          if (!jellyfinServer.enabledForLogin) {
            logger.warn("jellyfin.login.disabled", { serverId: jellyfinServer.id })
            return null
          }

          // Authenticate with Jellyfin API
          const authResult = await authenticateJellyfin(
            { url: jellyfinServer.url, apiKey: jellyfinServer.apiKey },
            username,
            password
          )

          if (!authResult.success || !authResult.data) {
            logger.warn("Jellyfin authentication failed", {
              username,
              error: authResult.error,
            })
            return null
          }

          await reward("auth:jellyfin:user", usernameSubject)

          const jellyfinUser = authResult.data

          // Check if this user is the admin
          const isAdmin = await isJellyfinAdmin(
            { url: jellyfinServer.url, apiKey: jellyfinServer.apiKey },
            jellyfinUser.id,
            jellyfinServer.adminUserId
          )

          // Match only by Jellyfin user ID. Jellyfin users can rename
          // themselves to any string, an email address included, so the
          // username never links to, or is stored as the email of, any row.
          let dbUser = await prisma.user.findUnique({
            where: { jellyfinUserId: jellyfinUser.id },
          })

          if (!dbUser) {
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
              const { logAuditEvent, AuditEventType } = await import("@/lib/security/audit-log")
              logAuditEvent(AuditEventType.USER_CREATED, dbUser.id, {
                isAdmin: true,
                jellyfinUserId: jellyfinUser.id,
                authService: "jellyfin",
              })
            }
          } else {
            // Check if admin status changed
            const adminStatusChanged = dbUser.isAdmin !== isAdmin

            // Update existing user
            dbUser = await prisma.user.update({
              where: { id: dbUser.id },
              data: {
                name: jellyfinUser.username,
                isAdmin,
              },
            })

            // Audit log: Admin privilege change
            if (adminStatusChanged) {
              const { logAuditEvent, AuditEventType } = await import("@/lib/security/audit-log")
              logAuditEvent(
                isAdmin ? AuditEventType.ADMIN_PRIVILEGE_GRANTED : AuditEventType.ADMIN_PRIVILEGE_REVOKED,
                dbUser.id,
                {
                  targetUserId: dbUser.id,
                  previousAdminStatus: !isAdmin,
                  newAdminStatus: isAdmin,
                  jellyfinUserId: jellyfinUser.id,
                  authService: "jellyfin",
                }
              )
            }
          }

          return {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            image: dbUser.image,
            isAdmin: dbUser.isAdmin,
          }
        } catch (error) {
          logger.error("Error authenticating Jellyfin user", error)
          // Re-throw specific errors
          if (error instanceof Error && error.message === "NO_SERVER_CONFIGURED") {
            throw error
          }
          return null
        }
      },
    }),
  ],
  pages: {
    signIn: "/",
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
        token.checkedAt = Date.now()
        return token
      }

      // On subsequent requests the JWT is stateless, so isAdmin would otherwise
      // never update. Periodically (or when the client calls session.update())
      // re-read the DB so privilege changes take effect within a bounded window
      // rather than at token expiry.
      const isStale =
        !token.checkedAt || Date.now() - token.checkedAt > ADMIN_RECHECK_INTERVAL_MS
      if (token.sub && (trigger === "update" || isStale)) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub },
            select: { isAdmin: true },
          })
          if (dbUser) {
            if (dbUser.isAdmin !== token.isAdmin) {
              logger.info("Refreshed admin status from database", {
                userId: token.sub,
                previousAdminStatus: token.isAdmin,
                newAdminStatus: dbUser.isAdmin,
              })
            }
            token.isAdmin = dbUser.isAdmin
          }
          token.checkedAt = Date.now()
        } catch (error) {
          // On DB error, keep the existing token rather than logging the user
          // out; the next request will retry the refresh.
          logger.warn("Failed to refresh admin status in JWT callback", { error })
        }
      }

      return token
    },
  },
}

